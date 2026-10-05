import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AssignmentEngineService } from '../assignment/assignment-engine.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { LeadActivitiesService } from '../leads/lead-activities.service';
import { ActivityType, LeadPriority, LeadSource } from '../leads/lead.enums';
import { OPEN_STATUS_SQL } from '../leads/lead-status.rules';
import { LeadEscalation } from './lead-escalation.entity';
import {
  findPolicy,
  isBreached,
  minutesLate,
  pickReference,
  SlaPolicyFacts,
  SlaReference,
} from './sla-evaluation';
import { SlaPoliciesService } from './sla-policies.service';
import { EscalationOutcome, ReferenceType, SlaAction } from './sla.enums';

/** Only one processor run at a time across ALL app instances (a session-level advisory lock). */
const SLA_RUN_LOCK_KEY = 730302;

/** Things the owner can do that count as "responding". */
const QUALIFYING_ACTIVITIES = [
  ActivityType.STATUS_CHANGED,
  ActivityType.NOTE_ADDED,
  ActivityType.FOLLOW_UP_CREATED,
  ActivityType.FOLLOW_UP_COMPLETED,
]
  .map((t) => `'${t}'`)
  .join(',');

export interface SlaRunItem {
  leadId: number;
  policyId: number;
  policyName: string;
  action: SlaAction;
  /** 'would_escalate' on a dry run, otherwise what really happened. */
  outcome: EscalationOutcome | 'would_escalate';
  fromEmployeeId: number;
  toEmployeeId: number | null;
  minutesLate: number;
}

export interface SlaRunSummary {
  dryRun: boolean;
  /** true when another run was already in progress, so this one did nothing. */
  skipped: boolean;
  startedAt: Date;
  finishedAt: Date;
  followUpsMarkedOverdue: number;
  leadsChecked: number;
  breaches: number;
  flagged: number;
  reassigned: number;
  noEligible: number;
  /** Breach already escalated by an earlier run, or fixed while we were working. */
  alreadyHandled: number;
  errors: number;
  items: SlaRunItem[];
}

interface Candidate {
  leadId: number;
  ownerId: number;
  service: string;
  source: LeadSource;
  priority: LeadPriority;
  estimatedValue: number;
  reference: SlaReference;
}

interface CandidateRow {
  id: number;
  service: string;
  source: LeadSource;
  priority: LeadPriority;
  estimatedValue: string;
  ownerId: number;
  assignmentId: number | null;
  assignmentAt: Date | null;
  activityId: number | null;
  activityAt: Date | null;
}

type Escalated = { kind: 'done'; item: SlaRunItem } | { kind: 'stale' };

@Injectable()
export class SlaProcessorService {
  private readonly logger = new Logger(SlaProcessorService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly policies: SlaPoliciesService,
    private readonly followUps: FollowUpsService,
    private readonly engine: AssignmentEngineService,
    private readonly activities: LeadActivitiesService,
  ) {}

  /**
   * One processor pass:
   *  1. mark late follow-ups as overdue,
   *  2. find open, owned leads whose SLA clock ran out,
   *  3. escalate each one (flag, or flag + reassign) in its own transaction.
   * Running it again right away does nothing new (see lead_escalations' unique key).
   */
  async run(options: { dryRun?: boolean } = {}): Promise<SlaRunSummary> {
    const dryRun = options.dryRun === true;
    const summary = this.emptySummary(dryRun);

    if (this.running) return this.finish({ ...summary, skipped: true });
    this.running = true;

    // A dedicated connection holds the cross-instance lock for the whole run.
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      if (!dryRun) {
        const rows = (await runner.query('SELECT pg_try_advisory_lock($1) AS ok', [
          SLA_RUN_LOCK_KEY,
        ])) as { ok: boolean }[];
        locked = rows[0].ok;
        if (!locked) return this.finish({ ...summary, skipped: true });
      }
      await this.process(summary, dryRun);
      return this.finish(summary);
    } finally {
      if (locked) await runner.query('SELECT pg_advisory_unlock($1)', [SLA_RUN_LOCK_KEY]);
      await runner.release();
      this.running = false;
    }
  }

  private async process(summary: SlaRunSummary, dryRun: boolean) {
    const overdue = await this.followUps.markOverdue(dryRun);
    summary.followUpsMarkedOverdue = overdue.marked;

    const policies = await this.policies.findActiveInOrder();
    if (policies.length === 0) return;
    const minMinutes = Math.min(...policies.map((p) => p.responseMinutes));
    const now = new Date();

    const candidates = await this.findCandidates(this.dataSource.manager, minMinutes);
    for (const c of candidates) {
      const policy = findPolicy(policies, c);
      if (!policy) continue;
      summary.leadsChecked++;
      if (!isBreached(c.reference.at, policy.responseMinutes, now)) continue;
      summary.breaches++;

      if (dryRun) {
        summary.items.push({
          leadId: c.leadId,
          policyId: policy.id,
          policyName: policy.name,
          action: policy.action,
          outcome: 'would_escalate',
          fromEmployeeId: c.ownerId,
          toEmployeeId: null,
          minutesLate: minutesLate(c.reference.at, policy.responseMinutes, now),
        });
        continue;
      }

      try {
        const res = await this.escalate(c.leadId, policies, minMinutes);
        if (res.kind === 'stale') {
          summary.alreadyHandled++;
          continue;
        }
        summary.items.push(res.item);
        if (res.item.outcome === EscalationOutcome.FLAGGED) summary.flagged++;
        if (res.item.outcome === EscalationOutcome.REASSIGNED) summary.reassigned++;
        if (res.item.outcome === EscalationOutcome.NO_ELIGIBLE) summary.noEligible++;
      } catch (err) {
        // One bad lead must never stop the rest. Its transaction was rolled back.
        summary.errors++;
        this.logger.error(
          `SLA escalation failed for lead ${c.leadId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  /** Escalates ONE lead in ONE transaction: all of it happens, or none of it. */
  private async escalate(
    leadId: number,
    policies: SlaPolicyFacts[],
    minMinutes: number,
  ): Promise<Escalated> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.escalateInTransaction(manager, leadId, policies, minMinutes),
      );
    } catch (err) {
      if (err instanceof DuplicateEscalation) return { kind: 'stale' };
      throw err;
    }
  }

  private async escalateInTransaction(
    manager: EntityManager,
    leadId: number,
    policies: SlaPolicyFacts[],
    minMinutes: number,
  ): Promise<Escalated> {
    {
      // Lock order everywhere: assignment lock first, then the lead row.
      await this.engine.lockForAssignment(manager);
      await manager.query('SELECT 1 FROM leads WHERE id = $1 FOR UPDATE', [leadId]);

      // Look again under the locks: the owner may have acted, or another run may have won.
      const [fresh] = await this.findCandidates(manager, minMinutes, leadId);
      if (!fresh) return { kind: 'stale' };
      const policy = findPolicy(policies, fresh);
      const now = new Date();
      if (!policy || !isBreached(fresh.reference.at, policy.responseMinutes, now)) {
        return { kind: 'stale' };
      }
      const late = minutesLate(fresh.reference.at, policy.responseMinutes, now);

      await this.activities.record(manager, {
        leadId,
        type: ActivityType.SLA_BREACHED,
        description: `Response SLA "${policy.name}" breached: no response within ${policy.responseMinutes} minute(s), ${late} minute(s) late`,
        metadata: {
          policyId: policy.id,
          responseMinutes: policy.responseMinutes,
          minutesLate: late,
          referenceType: fresh.reference.type,
          referenceId: fresh.reference.id,
          referenceAt: fresh.reference.at,
          ownerId: fresh.ownerId,
        },
        performedByUserId: null,
      });

      let outcome = EscalationOutcome.FLAGGED;
      let toEmployeeId: number | null = null;
      let toName: string | null = null;
      let reason = `No response within ${policy.responseMinutes} minute(s) (${late} late). Flagged for manager attention`;

      if (policy.action === SlaAction.REASSIGN) {
        const r = await this.engine.reassignForEscalation(manager, leadId, policy.name);
        reason = r.reassigned
          ? `No response within ${policy.responseMinutes} minute(s) (${late} late). ${r.reason}`
          : `No response within ${policy.responseMinutes} minute(s) (${late} late). Owner kept: ${r.reason}`;
        outcome = r.reassigned ? EscalationOutcome.REASSIGNED : EscalationOutcome.NO_ELIGIBLE;
        toEmployeeId = r.employee?.id ?? null;
        toName = r.employee?.fullName ?? null;
      }

      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(LeadEscalation)
        .values({
          leadId,
          policyId: policy.id,
          policyName: policy.name,
          responseMinutes: policy.responseMinutes,
          action: policy.action,
          outcome,
          fromEmployeeId: fresh.ownerId,
          toEmployeeId,
          reason,
          referenceType: fresh.reference.type,
          referenceId: fresh.reference.id,
          referenceAt: fresh.reference.at,
        })
        .orIgnore() // ON CONFLICT DO NOTHING: the unique key makes a second escalation impossible
        .returning('id')
        .execute();
      if ((inserted.raw as unknown[]).length === 0) {
        // Cannot normally happen (we hold the locks), but if it does, undo everything we did.
        throw new DuplicateEscalation(leadId);
      }
      const escalationId = (inserted.raw as { id: number }[])[0].id;

      await this.activities.record(manager, {
        leadId,
        type: ActivityType.ESCALATED,
        description:
          outcome === EscalationOutcome.REASSIGNED
            ? `Escalated: lead moved to ${toName}`
            : outcome === EscalationOutcome.NO_ELIGIBLE
              ? 'Escalated: nobody else is eligible, lead stays with its owner'
              : 'Escalated: flagged for manager attention',
        metadata: { escalationId, policyId: policy.id, outcome, toEmployeeId },
        performedByUserId: null,
      });

      return {
        kind: 'done',
        item: {
          leadId,
          policyId: policy.id,
          policyName: policy.name,
          action: policy.action,
          outcome,
          fromEmployeeId: fresh.ownerId,
          toEmployeeId,
          minutesLate: late,
        },
      };
    }
  }

  /**
   * Open leads that have an owner, no still-upcoming pending follow-up (that counts as "covered"),
   * and whose newest SLA reference is older than `minMinutes`, minus those whose current
   * reference was already escalated. Pass leadId to re-check a single lead.
   */
  private async findCandidates(
    manager: EntityManager,
    minMinutes: number,
    leadId?: number,
  ): Promise<Candidate[]> {
    const params: unknown[] = [minMinutes];
    if (leadId !== undefined) params.push(leadId);
    const rows = await manager.query<CandidateRow[]>(
      `SELECT l.id, l.service, l.source, l.priority,
              l.estimated_value AS "estimatedValue",
              l.assigned_employee_id AS "ownerId",
              a.id AS "assignmentId", a.at AS "assignmentAt",
              n.id AS "activityId", n.at AS "activityAt"
         FROM leads l
         LEFT JOIN LATERAL (
              SELECT h.id, h.created_at AS at FROM assignment_history h
               WHERE h.lead_id = l.id AND h.action IN ('assigned', 'reassigned')
                 AND h.to_employee_id IS NOT NULL
               ORDER BY h.id DESC LIMIT 1) a ON true
         LEFT JOIN LATERAL (
              SELECT x.id, x.created_at AS at FROM lead_activities x
               WHERE x.lead_id = l.id AND x.type IN (${QUALIFYING_ACTIVITIES})
               ORDER BY x.created_at DESC, x.id DESC LIMIT 1) n ON true
        WHERE l.assigned_employee_id IS NOT NULL
          AND l.status IN (${OPEN_STATUS_SQL})
          AND GREATEST(a.at, n.at) < now() - ($1 * interval '1 minute')
          AND NOT EXISTS (SELECT 1 FROM follow_ups f
                           WHERE f.lead_id = l.id AND f.status = 'pending' AND f.due_at >= now())
          ${leadId !== undefined ? 'AND l.id = $2' : ''}
        ORDER BY l.id ASC`,
      params,
    );
    if (rows.length === 0) return [];

    const existing = await manager.query<
      { lead_id: number; reference_type: ReferenceType; reference_id: number }[]
    >(
      `SELECT lead_id, reference_type, reference_id FROM lead_escalations WHERE lead_id = ANY($1)`,
      [rows.map((r) => r.id)],
    );
    const done = new Set(existing.map((e) => `${e.lead_id}:${e.reference_type}:${e.reference_id}`));

    const result: Candidate[] = [];
    for (const r of rows) {
      const reference = pickReference(
        r.assignmentId !== null && r.assignmentAt !== null
          ? { type: ReferenceType.ASSIGNMENT, id: r.assignmentId, at: new Date(r.assignmentAt) }
          : null,
        r.activityId !== null && r.activityAt !== null
          ? { type: ReferenceType.ACTIVITY, id: r.activityId, at: new Date(r.activityAt) }
          : null,
      );
      if (!reference) continue;
      if (done.has(`${r.id}:${reference.type}:${reference.id}`)) continue;
      const c: Candidate = {
        leadId: r.id,
        ownerId: r.ownerId,
        service: r.service,
        source: r.source,
        priority: r.priority,
        estimatedValue: parseFloat(r.estimatedValue),
        reference,
      };
      result.push(c);
    }
    return result;
  }

  private emptySummary(dryRun: boolean): SlaRunSummary {
    const now = new Date();
    return {
      dryRun,
      skipped: false,
      startedAt: now,
      finishedAt: now,
      followUpsMarkedOverdue: 0,
      leadsChecked: 0,
      breaches: 0,
      flagged: 0,
      reassigned: 0,
      noEligible: 0,
      alreadyHandled: 0,
      errors: 0,
      items: [],
    };
  }

  private finish(summary: SlaRunSummary): SlaRunSummary {
    summary.finishedAt = new Date();
    if (
      !summary.dryRun &&
      !summary.skipped &&
      (summary.breaches > 0 || summary.followUpsMarkedOverdue > 0)
    ) {
      this.logger.log(
        `SLA run: ${summary.followUpsMarkedOverdue} follow-up(s) overdue, ${summary.breaches} breach(es) ` +
          `(flagged ${summary.flagged}, reassigned ${summary.reassigned}, no eligible ${summary.noEligible}, errors ${summary.errors})`,
      );
    }
    return summary;
  }
}

class DuplicateEscalation extends Error {
  constructor(leadId: number) {
    super(`Lead ${leadId} was already escalated for this reference`);
  }
}
