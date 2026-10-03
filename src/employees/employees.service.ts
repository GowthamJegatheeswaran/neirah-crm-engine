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
import { escapeLike } from '../common/utils/escape-like';
import { OPEN_LEAD_STATUSES } from '../leads/lead-status.rules';
import { Role } from '../users/role.enum';
import { User } from '../users/user.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeFilterDto, EmployeeSortBy } from './dto/employee-filter.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeAvailability } from './employee-availability.enum';
import { Employee } from './employee.entity';

export interface EmployeeView {
  id: number;
  fullName: string;
  specializations: string[];
  territory: string;
  availability: EmployeeAvailability;
  isActive: boolean;
  maxWorkload: number;
  openLeads: number;
  user: { id: number; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

// Whitelist: the client sends a name, we choose the SQL. User input never reaches ORDER BY.
const SORT_COLUMNS: Record<EmployeeSortBy, string> = {
  [EmployeeSortBy.FULL_NAME]: 'e.full_name',
  [EmployeeSortBy.TERRITORY]: 'e.territory',
  [EmployeeSortBy.CREATED_AT]: 'e.created_at',
  [EmployeeSortBy.OPEN_LEADS]: '"openLeads"',
};

interface EmployeeRow {
  id: number;
  full_name: string;
  specializations: string[];
  territory: string;
  availability: EmployeeAvailability;
  is_active: boolean;
  max_workload: number;
  open_leads: string;
  user_id: number | null;
  user_email: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<EmployeeView> {
    if (dto.userId !== undefined) await this.assertUserLinkable(dto.userId);
    const saved = await this.employees.save(
      this.employees.create({
        fullName: dto.fullName,
        specializations: dto.specializations,
        territory: dto.territory,
        availability: dto.availability ?? EmployeeAvailability.AVAILABLE,
        maxWorkload: dto.maxWorkload ?? 10,
        userId: dto.userId ?? null,
      }),
    );
    return this.findOne(saved.id);
  }

  async findAll(filter: EmployeeFilterDto) {
    const { page, limit, sortBy, order } = filter;
    const qb = this.baseQuery();

    if (filter.search) {
      const like = `%${escapeLike(filter.search)}%`;
      qb.andWhere('(e.full_name ILIKE :like OR e.territory ILIKE :like)', { like });
    }
    if (filter.territory) {
      qb.andWhere('LOWER(e.territory) = LOWER(:territory)', { territory: filter.territory });
    }
    if (filter.specialization) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM unnest(e.specializations) s WHERE LOWER(s) = LOWER(:spec))',
        { spec: filter.specialization },
      );
    }
    if (filter.availability) qb.andWhere('e.availability = :av', { av: filter.availability });
    if (filter.isActive !== undefined)
      qb.andWhere('e.is_active = :active', { active: filter.isActive });

    const total = await qb.clone().select('e.id').getCount();
    const rows = await qb
      .orderBy(SORT_COLUMNS[sortBy], order.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('e.id', 'ASC')
      .offset(offsetFor(page, limit))
      .limit(limit)
      .getRawMany<EmployeeRow>();

    return buildPage(rows.map(toView), total, page, limit);
  }

  async findOne(id: number): Promise<EmployeeView> {
    const row = await this.baseQuery().andWhere('e.id = :id', { id }).getRawOne<EmployeeRow>();
    if (!row) throw new NotFoundException('Employee not found');
    return toView(row);
  }

  async findProfileByUserId(userId: number): Promise<EmployeeView> {
    const row = await this.baseQuery()
      .andWhere('e.user_id = :userId', { userId })
      .getRawOne<EmployeeRow>();
    if (!row) throw new NotFoundException('No employee profile is linked to this account');
    return toView(row);
  }

  /** Returns just the employee id for a login user, or null (used for lead scoping). */
  async findEmployeeIdByUserId(userId: number): Promise<number | null> {
    const e = await this.employees.findOne({ where: { userId }, select: { id: true } });
    return e?.id ?? null;
  }

  async update(id: number, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    const existing = await this.employees.findOne({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Employee not found');
    const changes = omitUndefined(dto);
    if (Object.keys(changes).length > 0) await this.employees.update(id, changes);
    return this.findOne(id);
  }

  async updateOwnAvailability(userId: number, dto: UpdateAvailabilityDto): Promise<EmployeeView> {
    const profile = await this.employees.findOne({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('No employee profile is linked to this account');
    await this.employees.update(profile.id, { availability: dto.availability });
    return this.findOne(profile.id);
  }

  private baseQuery() {
    return this.employees
      .createQueryBuilder('e')
      .leftJoin(User, 'u', 'u.id = e.user_id')
      .select([
        'e.id AS id',
        'e.full_name AS full_name',
        'e.specializations AS specializations',
        'e.territory AS territory',
        'e.availability AS availability',
        'e.is_active AS is_active',
        'e.max_workload AS max_workload',
        'e.created_at AS created_at',
        'e.updated_at AS updated_at',
        'u.id AS user_id',
        'u.email AS user_email',
      ])
      .addSelect(
        `(SELECT COUNT(*) FROM leads l WHERE l.assigned_employee_id = e.id AND l.status IN (${OPEN_LEAD_STATUSES.map((s) => `'${s}'`).join(',')}))`,
        'openLeads',
      );
  }

  private async assertUserLinkable(userId: number): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnprocessableEntityException('userId does not match any user');
    if (user.role !== Role.SALES) {
      throw new UnprocessableEntityException('Only users with the sales role can be linked');
    }
    if (!user.isActive) throw new UnprocessableEntityException('That user account is inactive');
    const taken = await this.employees.exists({ where: { userId } });
    if (taken) throw new ConflictException('That user is already linked to an employee');
  }
}

function toView(r: EmployeeRow & { openLeads?: string }): EmployeeView {
  return {
    id: r.id,
    fullName: r.full_name,
    specializations: r.specializations,
    territory: r.territory,
    availability: r.availability,
    isActive: r.is_active,
    maxWorkload: r.max_workload,
    openLeads: Number(r.openLeads ?? r.open_leads ?? 0),
    user: r.user_id ? { id: r.user_id, email: r.user_email as string } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
