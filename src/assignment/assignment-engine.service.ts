import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { EmployeeAvailability } from '../employees/employee-availability.enum';
import { LeadActivitiesService } from '../leads/lead-activities.service';
import { Lead } from '../leads/lead.entity';
import { ActivityType, LeadStatus } from '../leads/lead.enums';
import { OPEN_STATUS_SQL, TERMINAL_STATUSES } from '../leads/lead-status.rules';
import { User } from '../users/user.entity';
import { AssignmentHistory } from './assignment-history.entity';
import { AssignmentOutcome, CandidateView } from './assignment-outcome';
import { AssignmentRule } from './assignment-rule.entity';
import {
  Candidate,
  ruleMatchesLead,
  SelectionResult,
  selectEmployee,
} from './assignment-selection';
import { AssignmentAction, AssignmentMode } from './assignment.enums';
import { ReassignLeadDto } from './dto/reassign-lead.dto';

/** One fixed key so only one assignment decision runs at a time (see lockForAssignment). */
const ASSIGNMENT_LOCK_KEY = 730301;

export interface Actor {
  /** null = the system itself (for example a scheduler). */
  userId: number | null;
}

interface Evaluation {
  rule: AssignmentRule | null;
  selection: SelectionResult | null;
  reason: string;
}

@Injectable()
export class AssignmentEngineService {
  private readonly logger = new Logger(AssignmentEngineService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activities: LeadActivitiesService,
  ) {}

  /** Shows who would get the lead, writing nothing. */
  async preview(leadId: number): Promise<AssignmentOutcome> {
    const manager = this.dataSource.manager;
    const lead = await this.loadLead(manager, leadId);
    this.assertAssignable(lead);
    const evaluation = await this.evaluate(manager, lead);
    return this.toOutcome(lead.id, evaluation, AssignmentMode.AUTOMATIC, true);
  }

  /** Runs the rules and assigns the lead, or records that nobody was eligible. */
  async autoAssign(leadId: number, actor: Actor): Promise<AssignmentOutcome> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockForAssignment(manager);
      const lead = await this.loadLead(manager, leadId, true);
      this.assertAssignable(lead);

      const evaluation = await this.evaluate(manager, lead);
      const chosen = evaluation.selection?.chosen ?? null;
      const outcome = this.toOutcome(lead.id, evaluation, AssignmentMode.AUTOMATIC, false);

      if (chosen) {
        await manager
          .getRepository(Lead)
          .update(lead.id, { assignedEmployeeId: chosen.id, status: LeadStatus.ASSIGNED });
        const history = await this.writeHistory(manager, {
          leadId: lead.id,
          action: AssignmentAction.ASSIGNED,
          mode: AssignmentMode.AUTOMATIC,
          fromEmployeeId: null,
          toEmployeeId: chosen.id,
          rule: evaluation.rule,
          reason: evaluation.reason,
          metadata: this.metadataOf(outcome),
          userId: actor.userId,
        });
        await this.activities.record(manager, {
          leadId: lead.id,
          type: ActivityType.ASSIGNED,
          description: `Assigned to ${chosen.fullName}. ${evaluation.reason}`,
          metadata: {
            employeeId: chosen.id,
            ruleId: evaluation.rule?.id ?? null,
            historyId: history.id,
          },
          performedByUserId: actor.userId,
        });
        this.logger.log(`Lead ${lead.id} assigned to employee ${chosen.id} (${evaluation.reason})`);
      } else {
        const history = await this.writeHistory(manager, {
          leadId: lead.id,
          action: AssignmentAction.NO_ELIGIBLE,
          mode: AssignmentMode.AUTOMATIC,
          fromEmployeeId: null,
          toEmployeeId: null,
          rule: evaluation.rule,
          reason: evaluation.reason,
          metadata: this.metadataOf(outcome),
          userId: actor.userId,
        });
        await this.activities.record(manager, {
          leadId: lead.id,
          type: ActivityType.ASSIGNMENT_FAILED,
          description: `Not assigned. ${evaluation.reason}`,
          metadata: { ruleId: evaluation.rule?.id ?? null, historyId: history.id },
          performedByUserId: actor.userId,
        });
        this.logger.warn(`Lead ${lead.id} left unassigned (${evaluation.reason})`);
      }
      return outcome;
    });
  }

  /** Manual assignment or reassignment by a manager/admin. The previous owner stays in the history. */
  async reassign(leadId: number, dto: ReassignLeadDto, actor: Actor): Promise<AssignmentOutcome> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockForAssignment(manager);
      const lead = await this.loadLead(manager, leadId, true);
      if (TERMINAL_STATUSES.includes(lead.status)) {
        throw new ConflictException(`A ${lead.status} lead cannot be reassigned`);
      }
      if (lead.assignedEmployeeId === dto.employeeId) {
        throw new ConflictException('The lead already belongs to this employee');
      }

      const target = await manager
        .getRepository(Employee)
        .findOne({ where: { id: dto.employeeId } });
      if (!target) throw new UnprocessableEntityException('employeeId does not match any employee');
      if (!target.isActive) throw new UnprocessableEntityException('That employee is inactive');
      if (target.userId !== null) {
        const user = await manager.getRepository(User).findOne({ where: { id: target.userId } });
        if (user && !user.isActive) {
          throw new UnprocessableEntityException("That employee's login account is inactive");
        }
      }

      const from = lead.assignedEmployeeId
        ? await manager.getRepository(Employee).findOne({ where: { id: lead.assignedEmployeeId } })
        : null;
      const openLeads = await this.countOpenLeads(manager, target.id);
      const action = from ? AssignmentAction.REASSIGNED : AssignmentAction.ASSIGNED;

      await manager.getRepository(Lead).update(lead.id, {
        assignedEmployeeId: target.id,
        status: lead.status === LeadStatus.NEW ? LeadStatus.ASSIGNED : lead.status,
      });

      const warnings: string[] = [];
      if (target.availability !== EmployeeAvailability.AVAILABLE) {
        warnings.push(`employee availability is '${target.availability}'`);
      }
      if (openLeads >= target.maxWorkload) {
        warnings.push(`employee is at the workload limit (${openLeads}/${target.maxWorkload})`);
      }

      const reason = `Manual ${from ? 'reassignment' : 'assignment'}: ${dto.reason}`;
      const history = await this.writeHistory(manager, {
        leadId: lead.id,
        action,
        mode: AssignmentMode.MANUAL,
        fromEmployeeId: from?.id ?? null,
        toEmployeeId: target.id,
        rule: null,
        reason,
        metadata: { overrideWarnings: warnings, targetOpenLeads: openLeads },
        userId: actor.userId,
      });
      await this.activities.record(manager, {
        leadId: lead.id,
        type: from ? ActivityType.REASSIGNED : ActivityType.ASSIGNED,
        description: from
          ? `Reassigned from ${from.fullName} to ${target.fullName}. Reason: ${dto.reason}`
          : `Assigned manually to ${target.fullName}. Reason: ${dto.reason}`,
        metadata: {
          fromEmployeeId: from?.id ?? null,
          toEmployeeId: target.id,
          historyId: history.id,
          overrideWarnings: warnings,
        },
        performedByUserId: actor.userId,
      });
      this.logger.log(
        `Lead ${lead.id} ${action} to employee ${target.id} manually by user ${actor.userId}`,
      );

      return {
        leadId: lead.id,
        assigned: true,
        action,
        mode: AssignmentMode.MANUAL,
        dryRun: false,
        employee: { id: target.id, fullName: target.fullName },
        rule: null,
        reason,
        tieBreak: 'none',
        candidates: [],
        excluded: [],
      };
    });
  }

  // ---------------------------------------------------------------------------------------------

  /**
   * Makes assignment decisions one at a time. Without this, two simultaneous requests could both
   * read "Priya has 9/10 leads" and both give her a lead. The lock is released automatically
   * when the transaction ends.
   */
  private async lockForAssignment(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [ASSIGNMENT_LOCK_KEY]);
  }

  private async loadLead(manager: EntityManager, id: number, lock = false): Promise<Lead> {
    const qb = manager.getRepository(Lead).createQueryBuilder('l').where('l.id = :id', { id });
    if (lock) qb.setLock('pessimistic_write');
    const lead = await qb.getOne();
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private assertAssignable(lead: Lead) {
    if (TERMINAL_STATUSES.includes(lead.status)) {
      throw new ConflictException(`A ${lead.status} lead cannot be assigned`);
    }
    if (lead.assignedEmployeeId !== null || lead.status !== LeadStatus.NEW) {
      throw new ConflictException('The lead is already assigned. Use reassign to change its owner');
    }
  }

  private async evaluate(manager: EntityManager, lead: Lead): Promise<Evaluation> {
    const rules = await manager.getRepository(AssignmentRule).find({
      where: { isActive: true },
      order: { priority: 'ASC', id: 'ASC' },
    });
    if (rules.length === 0) {
      return { rule: null, selection: null, reason: 'No active assignment rules are configured' };
    }
    const rule = rules.find((r) => ruleMatchesLead(r, lead));
    if (!rule) {
      return { rule: null, selection: null, reason: 'No active assignment rule matches this lead' };
    }
    const candidates = await this.loadCandidates(manager, rule, lead);
    const selection = selectEmployee(candidates, rule);
    return { rule, selection, reason: selection.reason };
  }

  /**
   * Employees who pass the hard filters: active, available, login (if any) active, and
   * specialization when the rule asks for it. Workload and territory policy is applied in
   * selectEmployee. Workload is counted live from open leads, never stored.
   */
  private async loadCandidates(
    manager: EntityManager,
    rule: AssignmentRule,
    lead: Lead,
  ): Promise<Candidate[]> {
    const specializationFilter = rule.requireSpecialization
      ? `AND EXISTS (SELECT 1 FROM unnest(e.specializations) s WHERE LOWER(TRIM(s)) = LOWER(TRIM($2)))`
      : '';
    const params: unknown[] = rule.requireSpecialization
      ? [lead.location, lead.service]
      : [lead.location];
    const rows = await manager.query(
      `SELECT e.id,
              e.full_name AS "fullName",
              e.territory,
              e.max_workload AS "maxWorkload",
              (SELECT COUNT(*) FROM leads l
                 WHERE l.assigned_employee_id = e.id AND l.status IN (${OPEN_STATUS_SQL}))::int AS "openLeads",
              COALESCE((SELECT MAX(h.id) FROM assignment_history h
                 WHERE h.to_employee_id = e.id AND h.action IN ('assigned', 'reassigned')), 0)::int AS "lastAssignmentRank",
              (LOWER(TRIM(e.territory)) = LOWER(TRIM($1))) AS "territoryMatch"
         FROM employees e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE e.is_active = true
          AND e.availability = 'available'
          AND (u.id IS NULL OR u.is_active = true)
          ${specializationFilter}`,
      params,
    );
    return rows as Candidate[];
  }

  private async countOpenLeads(manager: EntityManager, employeeId: number): Promise<number> {
    const rows = await manager.query(
      `SELECT COUNT(*)::int AS n FROM leads l WHERE l.assigned_employee_id = $1 AND l.status IN (${OPEN_STATUS_SQL})`,
      [employeeId],
    );
    return rows[0].n as number;
  }

  private toOutcome(
    leadId: number,
    evaluation: Evaluation,
    mode: AssignmentMode,
    dryRun: boolean,
  ): AssignmentOutcome {
    const chosen = evaluation.selection?.chosen ?? null;
    const view = (c: Candidate): CandidateView => ({
      id: c.id,
      fullName: c.fullName,
      openLeads: c.openLeads,
      maxWorkload: c.maxWorkload,
      territoryMatch: c.territoryMatch,
    });
    return {
      leadId,
      assigned: chosen !== null,
      action: chosen ? AssignmentAction.ASSIGNED : AssignmentAction.NO_ELIGIBLE,
      mode,
      dryRun,
      employee: chosen ? { id: chosen.id, fullName: chosen.fullName } : null,
      rule: evaluation.rule ? { id: evaluation.rule.id, name: evaluation.rule.name } : null,
      reason: evaluation.reason,
      tieBreak: evaluation.selection?.tieBreak ?? 'none',
      candidates: (evaluation.selection?.ranked ?? []).map(view),
      excluded: evaluation.selection?.excluded ?? [],
    };
  }

  private metadataOf(outcome: AssignmentOutcome): Record<string, unknown> {
    return {
      tieBreak: outcome.tieBreak,
      candidates: outcome.candidates,
      excluded: outcome.excluded,
    };
  }

  private writeHistory(
    manager: EntityManager,
    h: {
      leadId: number;
      action: AssignmentAction;
      mode: AssignmentMode;
      fromEmployeeId: number | null;
      toEmployeeId: number | null;
      rule: AssignmentRule | null;
      reason: string;
      metadata: Record<string, unknown>;
      userId: number | null;
    },
  ): Promise<AssignmentHistory> {
    return manager.getRepository(AssignmentHistory).save({
      leadId: h.leadId,
      action: h.action,
      mode: h.mode,
      fromEmployeeId: h.fromEmployeeId,
      toEmployeeId: h.toEmployeeId,
      ruleId: h.rule?.id ?? null,
      ruleName: h.rule?.name ?? null,
      reason: h.reason,
      metadata: h.metadata,
      performedByUserId: h.userId,
    });
  }
}
