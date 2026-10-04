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
import { AssignmentRule } from './assignment-rule.entity';
import { AssignmentStrategy, TerritoryMode } from './assignment.enums';
import { CreateAssignmentRuleDto } from './dto/create-assignment-rule.dto';
import { RuleFilterDto } from './dto/rule-filter.dto';
import { UpdateAssignmentRuleDto } from './dto/update-assignment-rule.dto';

@Injectable()
export class AssignmentRulesService {
  constructor(
    @InjectRepository(AssignmentRule) private readonly rules: Repository<AssignmentRule>,
  ) {}

  async create(dto: CreateAssignmentRuleDto): Promise<AssignmentRule> {
    this.assertValueRange(dto.minValue ?? null, dto.maxValue ?? null);
    await this.assertNameFree(dto.name);
    return this.rules.save(
      this.rules.create({
        name: dto.name,
        description: dto.description ?? null,
        priority: dto.priority ?? 100,
        isActive: dto.isActive ?? true,
        matchService: dto.matchService ?? null,
        matchLocation: dto.matchLocation ?? null,
        matchSource: dto.matchSource ?? null,
        matchPriority: dto.matchPriority ?? null,
        minValue: dto.minValue ?? null,
        maxValue: dto.maxValue ?? null,
        requireSpecialization: dto.requireSpecialization ?? true,
        territoryMode: dto.territoryMode ?? TerritoryMode.PREFERRED,
        respectWorkloadLimit: dto.respectWorkloadLimit ?? true,
        strategy: dto.strategy ?? AssignmentStrategy.LEAST_WORKLOAD,
      }),
    );
  }

  async findAll(filter: RuleFilterDto) {
    const { page, limit, isActive } = filter;
    const qb = this.rules.createQueryBuilder('r');
    if (isActive !== undefined) qb.where('r.isActive = :isActive', { isActive });
    const [rows, total] = await qb
      .orderBy('r.priority', 'ASC')
      .addOrderBy('r.id', 'ASC')
      .skip(offsetFor(page, limit))
      .take(limit)
      .getManyAndCount();
    return buildPage(rows, total, page, limit);
  }

  async findOne(id: number): Promise<AssignmentRule> {
    const rule = await this.rules.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Assignment rule not found');
    return rule;
  }

  /** Active rules in evaluation order. Used by the engine. */
  findActiveInOrder(): Promise<AssignmentRule[]> {
    return this.rules.find({ where: { isActive: true }, order: { priority: 'ASC', id: 'ASC' } });
  }

  async update(id: number, dto: UpdateAssignmentRuleDto): Promise<AssignmentRule> {
    const rule = await this.findOne(id);
    const changes = omitUndefined(dto);
    const min = 'minValue' in changes ? (changes.minValue ?? null) : rule.minValue;
    const max = 'maxValue' in changes ? (changes.maxValue ?? null) : rule.maxValue;
    this.assertValueRange(min, max);
    if (dto.name !== undefined && dto.name.toLowerCase() !== rule.name.toLowerCase()) {
      await this.assertNameFree(dto.name);
    }
    if (Object.keys(changes).length > 0) await this.rules.update(id, changes);
    return this.findOne(id);
  }

  private assertValueRange(min: number | null, max: number | null) {
    if (min !== null && max !== null && min > max) {
      throw new UnprocessableEntityException('minValue cannot be greater than maxValue');
    }
  }

  private async assertNameFree(name: string) {
    const clash = await this.rules
      .createQueryBuilder('r')
      .where('LOWER(r.name) = LOWER(:name)', { name })
      .getExists();
    if (clash) throw new ConflictException('An assignment rule with this name already exists');
  }
}
