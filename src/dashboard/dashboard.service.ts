import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { buildPage, offsetFor } from '../common/pagination/paginated';
import { EmployeesService } from '../employees/employees.service';
import { effectiveOverdueSql } from '../follow-ups/follow-up.sql';
import { OPEN_FOLLOW_UP_STATUSES } from '../follow-ups/follow-up.enums';
import { LeadPriority, LeadSource, LeadStatus } from '../leads/lead.enums';
import { OPEN_STATUS_SQL } from '../leads/lead-status.rules';

const OPEN_FU_SQL = OPEN_FOLLOW_UP_STATUSES.map((s) => `'${s}'`).join(',');

interface Window {
  from?: string;
  to?: string;
}

/** `AND col >= $1 AND col <= $2` for whichever bounds were given (params always start at $1). */
function range(col: string, w: Window): { sql: string; params: string[] } {
  const params: string[] = [];
  let sql = '';
  if (w.from) {
    params.push(w.from);
    sql += ` AND ${col} >= $${params.length}`;
  }
  if (w.to) {
    params.push(w.to);
    sql += ` AND ${col} <= $${params.length}`;
  }
  return { sql, params };
}

const zeroed = <K extends string>(keys: K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly employees: EmployeesService,
  ) {}

  /** Company-wide numbers for managers and admins. */
  async overview(w: Window) {
    this.assertWindow(w);
    const lr = range('l.created_at', w);
    const fr = range('f.created_at', w);
    const xr = range('x.created_at', w);
    const hr = range('h.created_at', w);

    const [leadRows, followUp, escalation, assignmentRows] = await Promise.all([
      this.dataSource.query<
        {
          status: LeadStatus;
          source: LeadSource;
          priority: LeadPriority;
          owned: boolean;
          n: number;
        }[]
      >(
        `SELECT l.status, l.source, l.priority, (l.assigned_employee_id IS NOT NULL) AS owned, COUNT(*)::int AS n
           FROM leads l WHERE true ${lr.sql}
          GROUP BY l.status, l.source, l.priority, owned`,
        lr.params,
      ),
      this.dataSource.query<Record<string, number>[]>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE f.status = 'pending' AND f.due_at >= now())::int AS pending,
                COUNT(*) FILTER (WHERE ${effectiveOverdueSql('f')})::int AS overdue,
                COUNT(*) FILTER (WHERE f.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE f.status = 'cancelled')::int AS cancelled,
                COUNT(*) FILTER (WHERE f.status IN (${OPEN_FU_SQL})
                                   AND f.due_at >= date_trunc('day', now())
                                   AND f.due_at < date_trunc('day', now()) + interval '1 day')::int AS "dueToday"
           FROM follow_ups f WHERE true ${fr.sql}`,
        fr.params,
      ),
      this.dataSource.query<Record<string, number>[]>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE x.outcome = 'flagged')::int AS flagged,
                COUNT(*) FILTER (WHERE x.outcome = 'reassigned')::int AS reassigned,
                COUNT(*) FILTER (WHERE x.outcome = 'no_eligible')::int AS "noEligible"
           FROM lead_escalations x WHERE true ${xr.sql}`,
        xr.params,
      ),
      this.dataSource.query<{ action: string; mode: string; n: number }[]>(
        `SELECT h.action, h.mode, COUNT(*)::int AS n
           FROM assignment_history h WHERE true ${hr.sql}
          GROUP BY h.action, h.mode`,
        hr.params,
      ),
    ]);

    const byStatus = zeroed(Object.values(LeadStatus));
    const bySource = zeroed(Object.values(LeadSource));
    const byPriority = zeroed(Object.values(LeadPriority));
    let total = 0;
    let unassignedOpen = 0;
    const openStatuses: string[] = [
      LeadStatus.NEW,
      LeadStatus.ASSIGNED,
      LeadStatus.CONTACTED,
      LeadStatus.QUALIFIED,
      LeadStatus.FOLLOW_UP,
    ];
    for (const r of leadRows) {
      byStatus[r.status] += r.n;
      bySource[r.source] += r.n;
      byPriority[r.priority] += r.n;
      total += r.n;
      if (!r.owned && openStatuses.includes(r.status)) unassignedOpen += r.n;
    }
    const converted = byStatus[LeadStatus.CONVERTED];
    const lost = byStatus[LeadStatus.LOST];

    const assignment = { assigned: 0, reassigned: 0, noEligible: 0, automatic: 0, manual: 0 };
    for (const r of assignmentRows) {
      if (r.action === 'assigned') assignment.assigned += r.n;
      if (r.action === 'reassigned') assignment.reassigned += r.n;
      if (r.action === 'no_eligible') {
        assignment.noEligible += r.n;
        continue;
      }
      if (r.mode === 'automatic') assignment.automatic += r.n;
      if (r.mode === 'manual') assignment.manual += r.n;
    }

    return {
      period: { from: w.from ?? null, to: w.to ?? null },
      leads: {
        total,
        open: total - converted - lost,
        unassigned: unassignedOpen,
        byStatus,
        bySource,
        byPriority,
        /** converted / all leads, in percent */
        conversionRate: percent(converted, total),
        /** converted / (converted + lost): of the leads that are decided, how many were won */
        winRate: percent(converted, converted + lost),
      },
      followUps: followUp[0],
      escalations: escalation[0],
      assignment,
    };
  }

  /** Workload and results per employee (managers and admins). */
  async employeeStats(query: Window & { page: number; limit: number }) {
    this.assertWindow(query);
    const [{ n }] = await this.dataSource.query<{ n: number }[]>(
      'SELECT COUNT(*)::int AS n FROM employees',
    );
    const rows = await this.employeeRows(
      query,
      undefined,
      query.limit,
      offsetFor(query.page, query.limit),
    );
    return buildPage(rows, n, query.page, query.limit);
  }

  /** The signed-in sales user's own numbers. */
  async mine(user: AuthenticatedUser, w: Window) {
    this.assertWindow(w);
    const employeeId = await this.employees.findEmployeeIdByUserId(user.id);
    if (employeeId === null) {
      throw new NotFoundException('No employee profile is linked to this account');
    }
    const [stats] = await this.employeeRows(w, employeeId, 1, 0);
    const next = await this.dataSource.query<
      {
        id: number;
        leadId: number;
        leadName: string;
        title: string;
        type: string;
        dueAt: Date;
        overdue: boolean;
      }[]
    >(
      `SELECT f.id, f.lead_id AS "leadId", l.name AS "leadName", f.title, f.type, f.due_at AS "dueAt",
              ${effectiveOverdueSql('f')} AS overdue
         FROM follow_ups f JOIN leads l ON l.id = f.lead_id
        WHERE f.employee_id = $1 AND f.status IN (${OPEN_FU_SQL})
        ORDER BY f.due_at ASC, f.id ASC LIMIT 5`,
      [employeeId],
    );
    return { ...stats, nextFollowUps: next };
  }

  // ------------------------------------------------------------------------------------------

  private async employeeRows(
    w: Window,
    employeeId: number | undefined,
    limit: number,
    offset: number,
  ) {
    // $1/$2 are the optional window bounds; the optional employee filter comes after them.
    const lr = range('l.created_at', w);
    const xr = range('x.created_at', w);
    const params: unknown[] = [...lr.params];
    let where = '';
    if (employeeId !== undefined) {
      params.push(employeeId);
      where = `WHERE e.id = $${params.length}`;
    }
    params.push(limit, offset);
    const limitPos = params.length - 1;
    const rows = await this.dataSource.query<
      {
        id: number;
        fullName: string;
        isActive: boolean;
        availability: string;
        maxWorkload: number;
        openLeads: number;
        convertedLeads: number;
        lostLeads: number;
        pendingFollowUps: number;
        overdueFollowUps: number;
        slaBreaches: number;
      }[]
    >(
      `SELECT e.id, e.full_name AS "fullName", e.is_active AS "isActive", e.availability,
              e.max_workload AS "maxWorkload",
              COUNT(l.id) FILTER (WHERE l.status IN (${OPEN_STATUS_SQL}))::int AS "openLeads",
              COUNT(l.id) FILTER (WHERE l.status = 'converted')::int AS "convertedLeads",
              COUNT(l.id) FILTER (WHERE l.status = 'lost')::int AS "lostLeads",
              (SELECT COUNT(*) FROM follow_ups f
                WHERE f.employee_id = e.id AND f.status = 'pending' AND f.due_at >= now())::int AS "pendingFollowUps",
              (SELECT COUNT(*) FROM follow_ups f
                WHERE f.employee_id = e.id AND ${effectiveOverdueSql('f')})::int AS "overdueFollowUps",
              (SELECT COUNT(*) FROM lead_escalations x
                WHERE x.from_employee_id = e.id ${xr.sql})::int AS "slaBreaches"
         FROM employees e
         LEFT JOIN leads l ON l.assigned_employee_id = e.id ${lr.sql}
         ${where}
        GROUP BY e.id
        ORDER BY "openLeads" DESC, e.id ASC
        LIMIT $${limitPos} OFFSET $${limitPos + 1}`,
      params,
    );
    return rows.map((r) => ({
      ...r,
      utilizationPercent: percent(r.openLeads, r.maxWorkload),
      atCapacity: r.openLeads >= r.maxWorkload,
    }));
  }

  private assertWindow(w: Window) {
    if (w.from && w.to && new Date(w.from).getTime() > new Date(w.to).getTime()) {
      throw new BadRequestException('from must not be after to');
    }
  }
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}
