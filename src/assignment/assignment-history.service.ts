import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { buildPage, offsetFor } from '../common/pagination/paginated';
import { AssignmentHistory } from './assignment-history.entity';

@Injectable()
export class AssignmentHistoryService {
  constructor(
    @InjectRepository(AssignmentHistory) private readonly history: Repository<AssignmentHistory>,
  ) {}

  /** Ownership history of one lead, oldest first. Previous owners are never removed. */
  async listForLead(leadId: number, query: PaginationQueryDto) {
    const { page, limit } = query;
    const [rows, total] = await this.history
      .createQueryBuilder('h')
      .leftJoin('h.fromEmployee', 'fe')
      .leftJoin('h.toEmployee', 'te')
      .leftJoin('h.performedBy', 'u')
      .select(['h', 'fe.id', 'fe.fullName', 'te.id', 'te.fullName', 'u.id', 'u.email'])
      .where('h.leadId = :leadId', { leadId })
      .orderBy('h.id', 'ASC')
      .skip(offsetFor(page, limit))
      .take(limit)
      .getManyAndCount();

    const data = rows.map((h) => ({
      id: h.id,
      leadId: h.leadId,
      action: h.action,
      mode: h.mode,
      fromEmployee: h.fromEmployee
        ? { id: h.fromEmployee.id, fullName: h.fromEmployee.fullName }
        : null,
      toEmployee: h.toEmployee ? { id: h.toEmployee.id, fullName: h.toEmployee.fullName } : null,
      rule: h.ruleName ? { id: h.ruleId, name: h.ruleName } : null,
      reason: h.reason,
      metadata: h.metadata,
      performedBy: h.performedBy ? { id: h.performedBy.id, email: h.performedBy.email } : null,
      createdAt: h.createdAt,
    }));
    return buildPage(data, total, page, limit);
  }
}
