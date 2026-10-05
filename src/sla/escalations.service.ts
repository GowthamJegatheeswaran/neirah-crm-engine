import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { buildPage, offsetFor } from '../common/pagination/paginated';
import { EmployeesService } from '../employees/employees.service';
import { Lead } from '../leads/lead.entity';
import { Role } from '../users/role.enum';
import { EscalationFilterDto } from './dto/escalation-filter.dto';
import { LeadEscalation } from './lead-escalation.entity';

@Injectable()
export class EscalationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly employees: EmployeesService,
  ) {}

  /** Everything, newest first (managers and admins). */
  async findAll(filter: EscalationFilterDto) {
    return this.page(this.baseQuery(), filter);
  }

  /** One lead's escalations, newest first. Sales users only for their own leads. */
  async findForLead(leadId: number, filter: EscalationFilterDto, user: AuthenticatedUser) {
    const lead = await this.dataSource.getRepository(Lead).findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (user.role === Role.SALES) {
      const mine = await this.employees.findEmployeeIdByUserId(user.id);
      if (mine === null || lead.assignedEmployeeId !== mine) {
        throw new NotFoundException('Lead not found');
      }
    }
    const qb = this.baseQuery().where('x.lead_id = :leadId', { leadId });
    return this.page(qb, { ...filter, leadId: undefined });
  }

  private baseQuery(): SelectQueryBuilder<LeadEscalation> {
    return this.dataSource
      .getRepository(LeadEscalation)
      .createQueryBuilder('x')
      .leftJoin('x.lead', 'l')
      .addSelect(['l.id', 'l.name'])
      .leftJoin('x.fromEmployee', 'fe')
      .addSelect(['fe.id', 'fe.fullName'])
      .leftJoin('x.toEmployee', 'te')
      .addSelect(['te.id', 'te.fullName']);
  }

  private async page(qb: SelectQueryBuilder<LeadEscalation>, f: EscalationFilterDto) {
    if (f.leadId !== undefined) qb.andWhere('x.lead_id = :leadId', { leadId: f.leadId });
    if (f.policyId !== undefined) qb.andWhere('x.policy_id = :policyId', { policyId: f.policyId });
    if (f.outcome) qb.andWhere('x.outcome = :outcome', { outcome: f.outcome });
    if (f.employeeId !== undefined) {
      qb.andWhere('(x.from_employee_id = :emp OR x.to_employee_id = :emp)', { emp: f.employeeId });
    }
    if (f.from) qb.andWhere('x.created_at >= :from', { from: f.from });
    if (f.to) qb.andWhere('x.created_at <= :to', { to: f.to });

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('x.created_at', 'DESC')
      .addOrderBy('x.id', 'DESC')
      .offset(offsetFor(f.page, f.limit))
      .limit(f.limit)
      .getMany();
    return buildPage(rows.map(toView), total, f.page, f.limit);
  }
}

function toView(x: LeadEscalation) {
  return {
    id: x.id,
    leadId: x.leadId,
    lead: x.lead ? { id: x.lead.id, name: x.lead.name } : null,
    policyId: x.policyId,
    policyName: x.policyName,
    responseMinutes: x.responseMinutes,
    action: x.action,
    outcome: x.outcome,
    fromEmployee: x.fromEmployee
      ? { id: x.fromEmployee.id, fullName: x.fromEmployee.fullName }
      : null,
    toEmployee: x.toEmployee ? { id: x.toEmployee.id, fullName: x.toEmployee.fullName } : null,
    reason: x.reason,
    referenceType: x.referenceType,
    referenceId: x.referenceId,
    slaClockStartedAt: x.referenceAt,
    createdAt: x.createdAt,
  };
}
