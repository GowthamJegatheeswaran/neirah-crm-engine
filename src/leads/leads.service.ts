import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Role } from '../users/role.enum';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { buildPage, offsetFor } from '../common/pagination/paginated';
import { escapeLike } from '../common/utils/escape-like';
import { EmployeesService } from '../employees/employees.service';
import { AddNoteDto } from './dto/add-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadFilterDto, LeadSortBy } from './dto/lead-filter.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { computeLeadChanges, EDITABLE_LEAD_FIELDS } from './lead-changes';
import { LeadActivitiesService } from './lead-activities.service';
import { TERMINAL_STATUSES, validateManualTransition } from './lead-status.rules';
import { Lead } from './lead.entity';
import { ActivityType, LeadPriority, LeadSource, LeadStatus } from './lead.enums';

const PRIORITY_RANK = `CASE l.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

// Whitelist of sortable fields: the client picks a key, we pick the SQL.
const SORT_EXPRESSIONS: Record<LeadSortBy, string> = {
  [LeadSortBy.CREATED_AT]: 'l.created_at',
  [LeadSortBy.UPDATED_AT]: 'l.updated_at',
  [LeadSortBy.ESTIMATED_VALUE]: 'l.estimated_value',
  [LeadSortBy.NAME]: 'LOWER(l.name)',
  [LeadSortBy.STATUS]: 'l.status',
  [LeadSortBy.PRIORITY]: PRIORITY_RANK,
};

@Injectable()
export class LeadsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activities: LeadActivitiesService,
    private readonly employees: EmployeesService,
  ) {}

  async create(dto: CreateLeadDto, user: AuthenticatedUser) {
    const id = await this.dataSource.transaction(async (manager) => {
      const lead = await manager.getRepository(Lead).save({
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        company: dto.company ?? null,
        source: dto.source ?? LeadSource.MANUAL,
        service: dto.service,
        location: dto.location,
        estimatedValue: dto.estimatedValue ?? 0,
        priority: dto.priority ?? LeadPriority.MEDIUM,
        status: LeadStatus.NEW,
        assignedEmployeeId: null,
      });
      await this.activities.record(manager, {
        leadId: lead.id,
        type: ActivityType.LEAD_CREATED,
        description: `Lead "${lead.name}" created`,
        metadata: { source: lead.source, service: lead.service, location: lead.location },
        performedByUserId: user.id,
      });
      return lead.id;
    });
    return this.findOne(id, user);
  }

  async findAll(filter: LeadFilterDto, user: AuthenticatedUser) {
    const { page, limit, sortBy, order } = filter;
    const qb = this.baseQuery();
    await this.applyScope(qb, user);

    if (filter.search) {
      const like = `%${escapeLike(filter.search)}%`;
      qb.andWhere(
        '(l.name ILIKE :like OR l.email ILIKE :like OR l.company ILIKE :like OR l.phone ILIKE :like)',
        { like },
      );
    }
    if (filter.status) qb.andWhere('l.status = :status', { status: filter.status });
    if (filter.priority) qb.andWhere('l.priority = :priority', { priority: filter.priority });
    if (filter.source) qb.andWhere('l.source = :source', { source: filter.source });
    if (filter.service)
      qb.andWhere('LOWER(l.service) = LOWER(:service)', { service: filter.service });
    if (filter.location) {
      qb.andWhere('LOWER(l.location) = LOWER(:location)', { location: filter.location });
    }
    if (filter.assignedEmployeeId !== undefined) {
      qb.andWhere('l.assigned_employee_id = :emp', { emp: filter.assignedEmployeeId });
    }
    if (filter.unassigned === true) qb.andWhere('l.assigned_employee_id IS NULL');
    if (filter.minValue !== undefined)
      qb.andWhere('l.estimated_value >= :min', { min: filter.minValue });
    if (filter.maxValue !== undefined)
      qb.andWhere('l.estimated_value <= :max', { max: filter.maxValue });
    if (filter.createdFrom) qb.andWhere('l.created_at >= :from', { from: filter.createdFrom });
    if (filter.createdTo) qb.andWhere('l.created_at <= :to', { to: filter.createdTo });

    const total = await qb.getCount();
    const rows = await qb
      .orderBy(SORT_EXPRESSIONS[sortBy], order.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('l.id', 'ASC')
      .offset(offsetFor(page, limit))
      .limit(limit)
      .getMany();

    return buildPage(rows.map(toView), total, page, limit);
  }

  async findOne(id: number, user: AuthenticatedUser) {
    return toView(await this.getAccessible(id, user));
  }

  async update(id: number, dto: UpdateLeadDto, user: AuthenticatedUser) {
    await this.dataSource.transaction(async (manager) => {
      // Lock the row so two simultaneous edits cannot both pass the status check.
      const lead = await manager
        .getRepository(Lead)
        .createQueryBuilder('l')
        .setLock('pessimistic_write')
        .where('l.id = :id', { id })
        .getOne();
      if (!lead) throw new NotFoundException('Lead not found');
      await this.assertAccess(lead, user);

      const changes = computeLeadChanges(lead, dto);
      const fieldNames = Object.keys(changes);
      const statusChanging = dto.status !== undefined && dto.status !== lead.status;

      if (fieldNames.length > 0 && TERMINAL_STATUSES.includes(lead.status)) {
        throw new ConflictException(`A ${lead.status} lead can no longer be edited`);
      }
      if (statusChanging) {
        const problem = validateManualTransition(lead.status, dto.status as LeadStatus);
        if (problem) throw new ConflictException(problem);
      }
      if (fieldNames.length === 0 && !statusChanging) return;

      const patch: Partial<Lead> = {};
      for (const f of EDITABLE_LEAD_FIELDS) {
        if (changes[f]) (patch as Record<string, unknown>)[f] = changes[f].to;
      }
      if (statusChanging) patch.status = dto.status;
      await manager.getRepository(Lead).update(id, patch);

      if (fieldNames.length > 0) {
        await this.activities.record(manager, {
          leadId: id,
          type: ActivityType.LEAD_UPDATED,
          description: `Updated ${fieldNames.join(', ')}`,
          metadata: { changes },
          performedByUserId: user.id,
        });
      }
      if (statusChanging) {
        await this.activities.record(manager, {
          leadId: id,
          type: ActivityType.STATUS_CHANGED,
          description: `Status changed from ${lead.status} to ${dto.status}`,
          metadata: { from: lead.status, to: dto.status },
          performedByUserId: user.id,
        });
      }
    });
    return this.findOne(id, user);
  }

  async addNote(id: number, dto: AddNoteDto, user: AuthenticatedUser) {
    await this.getAccessible(id, user);
    return this.activities.record(this.dataSource.manager, {
      leadId: id,
      type: ActivityType.NOTE_ADDED,
      description: dto.note,
      performedByUserId: user.id,
    });
  }

  async timeline(id: number, query: TimelineQueryDto, user: AuthenticatedUser) {
    await this.getAccessible(id, user);
    return this.activities.timeline(id, query);
  }

  private baseQuery(): SelectQueryBuilder<Lead> {
    return this.dataSource
      .getRepository(Lead)
      .createQueryBuilder('l')
      .leftJoin('l.assignedEmployee', 'ae')
      .addSelect(['ae.id', 'ae.fullName']);
  }

  /** Sales users only ever see leads assigned to their own employee profile. */
  private async applyScope(qb: SelectQueryBuilder<Lead>, user: AuthenticatedUser) {
    if (user.role !== Role.SALES) return;
    const employeeId = await this.employees.findEmployeeIdByUserId(user.id);
    // -1 never matches, so a sales user without a profile sees nothing
    qb.andWhere('l.assigned_employee_id = :scopeEmp', { scopeEmp: employeeId ?? -1 });
  }

  private async getAccessible(id: number, user: AuthenticatedUser): Promise<Lead> {
    const qb = this.baseQuery().where('l.id = :id', { id });
    await this.applyScope(qb, user);
    const lead = await qb.getOne();
    // Same 404 for "does not exist" and "not yours" so ids cannot be probed.
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async assertAccess(lead: Lead, user: AuthenticatedUser): Promise<void> {
    if (user.role !== Role.SALES) return;
    const employeeId = await this.employees.findEmployeeIdByUserId(user.id);
    if (employeeId === null || lead.assignedEmployeeId !== employeeId) {
      throw new NotFoundException('Lead not found');
    }
  }
}

function toView(l: Lead) {
  return {
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    company: l.company,
    source: l.source,
    service: l.service,
    location: l.location,
    estimatedValue: l.estimatedValue,
    priority: l.priority,
    status: l.status,
    assignedEmployee: l.assignedEmployee
      ? { id: l.assignedEmployee.id, fullName: l.assignedEmployee.fullName }
      : null,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}
