import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPage, offsetFor } from '../common/pagination/paginated';
import { omitUndefined } from '../common/utils/omit-undefined';
import { CreateSlaPolicyDto } from './dto/create-sla-policy.dto';
import { SlaPolicyFilterDto } from './dto/sla-policy-filter.dto';
import { UpdateSlaPolicyDto } from './dto/update-sla-policy.dto';
import { SlaPolicy } from './sla-policy.entity';
import { SlaAction } from './sla.enums';

@Injectable()
export class SlaPoliciesService {
  constructor(@InjectRepository(SlaPolicy) private readonly policies: Repository<SlaPolicy>) {}

  async create(dto: CreateSlaPolicyDto): Promise<SlaPolicy> {
    this.assertValueRange(dto.minValue ?? null, dto.maxValue ?? null);
    await this.assertNameFree(dto.name);
    return this.policies.save(
      this.policies.create({
        name: dto.name,
        description: dto.description ?? null,
        priority: dto.priority ?? 100,
        isActive: dto.isActive ?? true,
        matchPriority: dto.matchPriority ?? null,
        matchService: dto.matchService ?? null,
        matchSource: dto.matchSource ?? null,
        minValue: dto.minValue ?? null,
        maxValue: dto.maxValue ?? null,
        responseMinutes: dto.responseMinutes,
        action: dto.action ?? SlaAction.FLAG,
      }),
    );
  }

  async findAll(filter: SlaPolicyFilterDto) {
    const { page, limit, isActive } = filter;
    const qb = this.policies.createQueryBuilder('p');
    if (isActive !== undefined) qb.where('p.isActive = :isActive', { isActive });
    const [rows, total] = await qb
      .orderBy('p.priority', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .skip(offsetFor(page, limit))
      .take(limit)
      .getManyAndCount();
    return buildPage(rows, total, page, limit);
  }

  async findOne(id: number): Promise<SlaPolicy> {
    const policy = await this.policies.findOne({ where: { id } });
    if (!policy) throw new NotFoundException('SLA policy not found');
    return policy;
  }

  /** Active policies in evaluation order. Used by the processor. */
  findActiveInOrder(): Promise<SlaPolicy[]> {
    return this.policies.find({ where: { isActive: true }, order: { priority: 'ASC', id: 'ASC' } });
  }

  async update(id: number, dto: UpdateSlaPolicyDto): Promise<SlaPolicy> {
    const policy = await this.findOne(id);
    const changes = omitUndefined(dto);
    const min = 'minValue' in changes ? (changes.minValue ?? null) : policy.minValue;
    const max = 'maxValue' in changes ? (changes.maxValue ?? null) : policy.maxValue;
    this.assertValueRange(min, max);
    if (dto.name !== undefined && dto.name.toLowerCase() !== policy.name.toLowerCase()) {
      await this.assertNameFree(dto.name);
    }
    if (Object.keys(changes).length > 0) await this.policies.update(id, changes);
    return this.findOne(id);
  }

  private assertValueRange(min: number | null, max: number | null) {
    if (min !== null && max !== null && min > max) {
      throw new UnprocessableEntityException('minValue cannot be greater than maxValue');
    }
  }

  private async assertNameFree(name: string) {
    const clash = await this.policies
      .createQueryBuilder('p')
      .where('LOWER(p.name) = LOWER(:name)', { name })
      .getExists();
    if (clash) throw new ConflictException('An SLA policy with this name already exists');
  }
}
