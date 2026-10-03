import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { buildPage, offsetFor } from '../common/pagination/paginated';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { LeadActivity } from './lead-activity.entity';
import { ActivityType } from './lead.enums';

export interface RecordActivityInput {
  leadId: number;
  type: ActivityType;
  description: string;
  metadata?: Record<string, unknown>;
  performedByUserId?: number | null;
}

@Injectable()
export class LeadActivitiesService {
  constructor(@InjectRepository(LeadActivity) private readonly repo: Repository<LeadActivity>) {}

  /**
   * Takes the caller's EntityManager so the activity is written in the same transaction as the
   * change it describes: either both are saved or neither is.
   */
  async record(manager: EntityManager, input: RecordActivityInput): Promise<LeadActivity> {
    return manager.getRepository(LeadActivity).save({
      leadId: input.leadId,
      type: input.type,
      description: input.description,
      metadata: input.metadata ?? null,
      performedByUserId: input.performedByUserId ?? null,
    });
  }

  async timeline(leadId: number, query: TimelineQueryDto) {
    const { page, limit, type } = query;
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoin('a.performedBy', 'u')
      .select([
        'a.id',
        'a.leadId',
        'a.type',
        'a.description',
        'a.metadata',
        'a.createdAt',
        'u.id',
        'u.email',
      ])
      .where('a.leadId = :leadId', { leadId });
    if (type) qb.andWhere('a.type = :type', { type });

    const [rows, total] = await qb
      .orderBy('a.createdAt', 'ASC')
      .addOrderBy('a.id', 'ASC')
      .skip(offsetFor(page, limit))
      .take(limit)
      .getManyAndCount();

    const data = rows.map((a) => ({
      id: a.id,
      leadId: a.leadId,
      type: a.type,
      description: a.description,
      metadata: a.metadata,
      performedBy: a.performedBy ? { id: a.performedBy.id, email: a.performedBy.email } : null,
      createdAt: a.createdAt,
    }));
    return buildPage(data, total, page, limit);
  }
}
