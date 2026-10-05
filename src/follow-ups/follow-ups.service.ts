import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { buildPage, offsetFor } from '../common/pagination/paginated';
import { Employee } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { LeadActivitiesService } from '../leads/lead-activities.service';
import { Lead } from '../leads/lead.entity';
import { ActivityType } from '../leads/lead.enums';
import { TERMINAL_STATUSES } from '../leads/lead-status.rules';
import { Role } from '../users/role.enum';
import { User } from '../users/user.entity';
import { CloseFollowUpDto } from './dto/close-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpFilterDto } from './dto/follow-up-filter.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { FollowUp } from './follow-up.entity';
import { FollowUpStatus, FollowUpType, OPEN_FOLLOW_UP_STATUSES } from './follow-up.enums';
import { effectiveOverdueSql } from './follow-up.sql';

const OPEN_SQL = OPEN_FOLLOW_UP_STATUSES.map((s) => `'${s}'`).join(',');
/** Most follow-ups the processor marks in one run (the rest are picked up on the next run). */
const OVERDUE_BATCH = 500;

interface Marked {
  id: number;
  title: string;
  dueAt: Date;
  employeeId: number | null;
}

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activities: LeadActivitiesService,
    private readonly employees: EmployeesService,
  ) {}

  // ----------------------------------------------------------------------------- create / read

  async create(leadId: number, dto: CreateFollowUpDto, user: AuthenticatedUser) {
    const dueAt = this.parseFuture(dto.dueAt);
    const id = await this.dataSource.transaction(async (manager) => {
      const lead = await this.lockLead(manager, leadId);
      await this.assertLeadAccess(lead, user);
      if (TERMINAL_STATUSES.includes(lead.status)) {
        throw new ConflictException(`A ${lead.status} lead cannot get new follow-ups`);
      }

      let employeeId = lead.assignedEmployeeId;
      if (dto.employeeId !== undefined && dto.employeeId !== lead.assignedEmployeeId) {
        if (user.role === Role.SALES) {
          throw new ForbiddenException(
            'Only managers and admins can give a follow-up to another employee',
          );
        }
        await this.assertEmployeeUsable(manager, dto.employeeId);
        employeeId = dto.employeeId;
      }
      if (employeeId === null) {
        throw new UnprocessableEntityException(
          'The lead has no owner yet. Assign the lead first or pass employeeId',
        );
      }

      const saved = await manager.getRepository(FollowUp).save({
        leadId,
        employeeId,
        type: dto.type ?? FollowUpType.CALL,
        title: dto.title,
        notes: dto.notes ?? null,
        dueAt,
        status: FollowUpStatus.PENDING,
        createdByUserId: user.id,
      });
      await this.activities.record(manager, {
        leadId,
        type: ActivityType.FOLLOW_UP_CREATED,
        description: `Follow-up scheduled: ${saved.title} (due ${dueAt.toISOString()})`,
        metadata: { followUpId: saved.id, type: saved.type, dueAt, employeeId },
        performedByUserId: user.id,
      });
      return saved.id;
    });
    return this.findOne(id, user);
  }

  async findOne(id: number, user: AuthenticatedUser) {
    const qb = this.baseQuery().where('f.id = :id', { id });
    await this.applyEmployeeScope(qb, user);
    const row = await qb.getOne();
    if (!row) throw new NotFoundException('Follow-up not found');
    return toView(row);
  }

  async findAll(filter: FollowUpFilterDto, user: AuthenticatedUser) {
    const qb = this.baseQuery();
    await this.applyEmployeeScope(qb, user);
    return this.page(qb, filter, user);
  }

  async findForLead(leadId: number, filter: FollowUpFilterDto, user: AuthenticatedUser) {
    const lead = await this.dataSource.getRepository(Lead).findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    await this.assertLeadAccess(lead, user);
    const qb = this.baseQuery().where('f.lead_id = :leadId', { leadId });
    return this.page(qb, { ...filter, leadId: undefined }, user);
  }

  // ------------------------------------------------------------------------------------ change

  async update(id: number, dto: UpdateFollowUpDto, user: AuthenticatedUser) {
    const newDue = dto.dueAt !== undefined ? this.parseFuture(dto.dueAt) : undefined;
    await this.dataSource.transaction(async (manager) => {
      const f = await this.lockFollowUp(manager, id);
      await this.assertFollowUpAccess(f, user);
      this.assertOpen(f);

      const patch: Partial<FollowUp> = {};
      if (dto.title !== undefined) patch.title = dto.title;
      if (dto.type !== undefined) patch.type = dto.type;
      if (dto.notes !== undefined) patch.notes = dto.notes;

      const rescheduled = newDue !== undefined && newDue.getTime() !== f.dueAt.getTime();
      if (rescheduled) {
        patch.dueAt = newDue;
        // a rescheduled late follow-up gets a fresh start
        patch.status = FollowUpStatus.PENDING;
        patch.overdueAt = null;
      }

      let handedOver: { from: number | null; to: number } | null = null;
      if (dto.employeeId !== undefined && dto.employeeId !== f.employeeId) {
        if (user.role === Role.SALES) {
          throw new ForbiddenException('Only managers and admins can hand over a follow-up');
        }
        await this.assertEmployeeUsable(manager, dto.employeeId);
        patch.employeeId = dto.employeeId;
        handedOver = { from: f.employeeId, to: dto.employeeId };
      }

      if (Object.keys(patch).length === 0) return;
      await manager.getRepository(FollowUp).update(id, patch);

      if (rescheduled) {
        await this.activities.record(manager, {
          leadId: f.leadId,
          type: ActivityType.FOLLOW_UP_RESCHEDULED,
          description: `Follow-up "${f.title}" rescheduled to ${newDue.toISOString()}`,
          metadata: { followUpId: id, from: f.dueAt, to: newDue },
          performedByUserId: user.id,
        });
      }
      if (handedOver) {
        await this.activities.record(manager, {
          leadId: f.leadId,
          type: ActivityType.FOLLOW_UP_REASSIGNED,
          description: `Follow-up "${f.title}" handed over to employee ${handedOver.to}`,
          metadata: { followUpId: id, ...handedOver },
          performedByUserId: user.id,
        });
      }
    });
    return this.findOne(id, user);
  }

  complete(id: number, dto: CloseFollowUpDto, user: AuthenticatedUser) {
    return this.close(id, FollowUpStatus.COMPLETED, dto, user);
  }

  cancel(id: number, dto: CloseFollowUpDto, user: AuthenticatedUser) {
    return this.close(id, FollowUpStatus.CANCELLED, dto, user);
  }

  private async close(
    id: number,
    target: FollowUpStatus.COMPLETED | FollowUpStatus.CANCELLED,
    dto: CloseFollowUpDto,
    user: AuthenticatedUser,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const f = await this.lockFollowUp(manager, id);
      await this.assertFollowUpAccess(f, user);
      this.assertOpen(f);

      const done = target === FollowUpStatus.COMPLETED;
      const now = new Date();
      await manager.getRepository(FollowUp).update(id, {
        status: target,
        completedAt: done ? now : null,
        cancelledAt: done ? null : now,
        outcomeNote: dto.note ?? null,
      });
      await this.activities.record(manager, {
        leadId: f.leadId,
        type: done ? ActivityType.FOLLOW_UP_COMPLETED : ActivityType.FOLLOW_UP_CANCELLED,
        description:
          `Follow-up "${f.title}" ${done ? 'completed' : 'cancelled'}` +
          (dto.note ? `: ${dto.note}` : ''),
        metadata: { followUpId: id, wasOverdue: f.status === FollowUpStatus.OVERDUE },
        performedByUserId: user.id,
      });
    });
    return this.findOne(id, user);
  }

  // ------------------------------------------------------------------- hooks for other modules
  // These run inside the caller's transaction and expect it to hold the lead row lock.

  /** A lead was converted/lost: its open follow-ups no longer make sense. */
  async cancelOpenForLead(
    manager: EntityManager,
    leadId: number,
    reason: string,
    userId: number | null,
  ): Promise<number> {
    const res = await manager.query<{ id: number }[] | [{ id: number }[], number]>(
      `UPDATE follow_ups
          SET status = 'cancelled', cancelled_at = now(), outcome_note = $2, updated_at = now()
        WHERE lead_id = $1 AND status IN (${OPEN_SQL})
        RETURNING id`,
      [leadId, reason],
    );
    const ids = flattenReturning(res);
    if (ids.length > 0) {
      await this.activities.record(manager, {
        leadId,
        type: ActivityType.FOLLOW_UP_CANCELLED,
        description: `${ids.length} open follow-up(s) cancelled: ${reason}`,
        metadata: { followUpIds: ids.map((r) => r.id), reason },
        performedByUserId: userId,
      });
    }
    return ids.length;
  }

  /** The lead got a new owner: the open follow-ups move with it. */
  async transferOpenForLead(
    manager: EntityManager,
    leadId: number,
    toEmployeeId: number,
    userId: number | null,
  ): Promise<number> {
    const res = await manager.query<
      { id: number; from: number | null }[] | [{ id: number; from: number | null }[], number]
    >(
      `UPDATE follow_ups f
          SET employee_id = $2, updated_at = now()
         FROM follow_ups prev
        WHERE f.id = prev.id AND f.lead_id = $1 AND f.status IN (${OPEN_SQL})
          AND f.employee_id IS DISTINCT FROM $2
        RETURNING f.id, prev.employee_id AS "from"`,
      [leadId, toEmployeeId],
    );
    const moved = flattenReturning(res);
    if (moved.length > 0) {
      await this.activities.record(manager, {
        leadId,
        type: ActivityType.FOLLOW_UP_REASSIGNED,
        description: `${moved.length} open follow-up(s) moved to employee ${toEmployeeId} with the lead`,
        metadata: { followUpIds: moved.map((r) => r.id), toEmployeeId },
        performedByUserId: userId,
      });
    }
    return moved.length;
  }

  /**
   * Marks pending follow-ups whose due time passed as overdue and writes ONE timeline entry each.
   * Safe to run again and again: only rows still 'pending' are touched, so nothing is duplicated.
   * Each follow-up is handled in its own short transaction (lead lock first, like every writer).
   */
  async markOverdue(dryRun = false): Promise<{ marked: number; ids: number[] }> {
    const due = await this.dataSource.query<{ id: number; lead_id: number }[]>(
      `SELECT id, lead_id FROM follow_ups
        WHERE status = 'pending' AND due_at < now()
        ORDER BY due_at ASC, id ASC
        LIMIT ${OVERDUE_BATCH}`,
    );
    if (dryRun) return { marked: due.length, ids: due.map((r) => r.id) };

    const ids: number[] = [];
    for (const row of due) {
      await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT 1 FROM leads WHERE id = $1 FOR UPDATE', [row.lead_id]);
        const res = await manager.query<Marked[] | [Marked[], number]>(
          `UPDATE follow_ups SET status = 'overdue', overdue_at = now(), updated_at = now()
            WHERE id = $1 AND status = 'pending' AND due_at < now()
            RETURNING id, title, due_at AS "dueAt", employee_id AS "employeeId"`,
          [row.id],
        );
        const updated = flattenReturning(res);
        if (updated.length === 0) return; // completed/cancelled/rescheduled in the meantime
        const f = updated[0];
        ids.push(f.id);
        await this.activities.record(manager, {
          leadId: row.lead_id,
          type: ActivityType.FOLLOW_UP_OVERDUE,
          description: `Follow-up "${f.title}" is overdue (was due ${new Date(f.dueAt).toISOString()})`,
          metadata: { followUpId: f.id, dueAt: f.dueAt, employeeId: f.employeeId },
          performedByUserId: null,
        });
      });
    }
    if (ids.length > 0) this.logger.log(`Marked ${ids.length} follow-up(s) overdue`);
    return { marked: ids.length, ids };
  }

  // ------------------------------------------------------------------------------------ helpers

  private parseFuture(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new UnprocessableEntityException('dueAt is not a valid date');
    }
    if (date.getTime() <= Date.now()) {
      throw new UnprocessableEntityException('dueAt must be in the future');
    }
    return date;
  }

  private assertOpen(f: FollowUp) {
    if (f.status === FollowUpStatus.COMPLETED || f.status === FollowUpStatus.CANCELLED) {
      throw new ConflictException(`This follow-up is already ${f.status}`);
    }
  }

  private async assertEmployeeUsable(manager: EntityManager, employeeId: number) {
    const e = await manager.getRepository(Employee).findOne({ where: { id: employeeId } });
    if (!e) throw new UnprocessableEntityException('employeeId does not match any employee');
    if (!e.isActive) throw new UnprocessableEntityException('That employee is inactive');
    if (e.userId !== null) {
      const u = await manager.getRepository(User).findOne({ where: { id: e.userId } });
      if (u && !u.isActive) {
        throw new UnprocessableEntityException("That employee's login account is inactive");
      }
    }
  }

  /** Lead row lock FIRST, always. Same order everywhere, so two requests can never deadlock. */
  private async lockLead(manager: EntityManager, leadId: number): Promise<Lead> {
    const lead = await manager
      .getRepository(Lead)
      .createQueryBuilder('l')
      .setLock('pessimistic_write')
      .where('l.id = :id', { id: leadId })
      .getOne();
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async lockFollowUp(manager: EntityManager, id: number): Promise<FollowUp> {
    const peek = await manager.getRepository(FollowUp).findOne({ where: { id } });
    if (!peek) throw new NotFoundException('Follow-up not found');
    await this.lockLead(manager, peek.leadId);
    // re-read under the lock: the state may have changed while we waited
    const f = await manager
      .getRepository(FollowUp)
      .createQueryBuilder('f')
      .setLock('pessimistic_write')
      .where('f.id = :id', { id })
      .getOne();
    if (!f) throw new NotFoundException('Follow-up not found');
    return f;
  }

  private async assertLeadAccess(lead: Lead, user: AuthenticatedUser) {
    if (user.role !== Role.SALES) return;
    const mine = await this.employees.findEmployeeIdByUserId(user.id);
    if (mine === null || lead.assignedEmployeeId !== mine) {
      throw new NotFoundException('Lead not found');
    }
  }

  private async assertFollowUpAccess(f: FollowUp, user: AuthenticatedUser) {
    if (user.role !== Role.SALES) return;
    const mine = await this.employees.findEmployeeIdByUserId(user.id);
    if (mine === null || f.employeeId !== mine) throw new NotFoundException('Follow-up not found');
  }

  private baseQuery(): SelectQueryBuilder<FollowUp> {
    return this.dataSource
      .getRepository(FollowUp)
      .createQueryBuilder('f')
      .leftJoin('f.lead', 'l')
      .addSelect(['l.id', 'l.name'])
      .leftJoin('f.employee', 'e')
      .addSelect(['e.id', 'e.fullName']);
  }

  private async applyEmployeeScope(qb: SelectQueryBuilder<FollowUp>, user: AuthenticatedUser) {
    if (user.role !== Role.SALES) return;
    const mine = await this.employees.findEmployeeIdByUserId(user.id);
    qb.andWhere('f.employee_id = :scopeEmp', { scopeEmp: mine ?? -1 });
  }

  private async page(
    qb: SelectQueryBuilder<FollowUp>,
    filter: FollowUpFilterDto,
    user: AuthenticatedUser,
  ) {
    const { page, limit } = filter;
    if (filter.status) qb.andWhere('f.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('f.type = :type', { type: filter.type });
    if (filter.leadId !== undefined) qb.andWhere('f.lead_id = :leadId', { leadId: filter.leadId });
    if (filter.employeeId !== undefined && user.role !== Role.SALES) {
      qb.andWhere('f.employee_id = :emp', { emp: filter.employeeId });
    }
    if (filter.overdue === true) qb.andWhere(effectiveOverdueSql('f'));
    if (filter.overdue === false) {
      qb.andWhere(`f.status IN (${OPEN_SQL})`).andWhere(`NOT ${effectiveOverdueSql('f')}`);
    }
    if (filter.dueFrom) qb.andWhere('f.due_at >= :dueFrom', { dueFrom: filter.dueFrom });
    if (filter.dueTo) qb.andWhere('f.due_at <= :dueTo', { dueTo: filter.dueTo });

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('f.due_at', 'ASC')
      .addOrderBy('f.id', 'ASC')
      .offset(offsetFor(page, limit))
      .limit(limit)
      .getMany();
    return buildPage(rows.map(toView), total, page, limit);
  }
}

/** pg returns [rows, count] for UPDATE ... RETURNING through TypeORM; plain rows for SELECT. */
function flattenReturning<T>(res: T[] | [T[], number]): T[] {
  return Array.isArray(res[0]) ? (res as [T[], number])[0] : (res as T[]);
}

function toView(f: FollowUp) {
  const open = f.status === FollowUpStatus.PENDING || f.status === FollowUpStatus.OVERDUE;
  return {
    id: f.id,
    leadId: f.leadId,
    lead: f.lead ? { id: f.lead.id, name: f.lead.name } : null,
    employee: f.employee ? { id: f.employee.id, fullName: f.employee.fullName } : null,
    type: f.type,
    title: f.title,
    notes: f.notes,
    dueAt: f.dueAt,
    status: f.status,
    /** true for any open follow-up whose due time has passed (even before the processor ran). */
    isOverdue: open && (f.status === FollowUpStatus.OVERDUE || f.dueAt.getTime() < Date.now()),
    overdueAt: f.overdueAt,
    completedAt: f.completedAt,
    cancelledAt: f.cancelledAt,
    outcomeNote: f.outcomeNote,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}
