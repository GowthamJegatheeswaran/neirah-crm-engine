import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeadPriority, LeadSource } from '../leads/lead.enums';
import { AssignmentStrategy, TerritoryMode } from './assignment.enums';

const numericTransformer = {
  to: (v?: number | null) => v,
  from: (v: string | null) => (v === null ? null : parseFloat(v)),
};

/**
 * One configurable assignment rule. Rules are evaluated by ascending priority number;
 * the first ACTIVE rule whose conditions match the lead decides how the lead is assigned.
 * Everything that may change (conditions, thresholds, strategy) lives in this table, not in code.
 */
@Entity('assignment_rules')
@Index('idx_assignment_rules_active_priority', ['isActive', 'priority'])
@Index('uq_assignment_rules_name', ['name'], { unique: true })
@Check('"priority" BETWEEN 1 AND 10000')
@Check('"min_value" IS NULL OR "max_value" IS NULL OR "min_value" <= "max_value"')
export class AssignmentRule {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Lower number = evaluated earlier. Equal priorities are ordered by id. */
  @Column({ type: 'int', default: 100 })
  priority!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  // ---- Conditions: a NULL condition means "any". All set conditions must match. ----
  @Column({ name: 'match_service', type: 'varchar', nullable: true })
  matchService!: string | null;

  @Column({ name: 'match_location', type: 'varchar', nullable: true })
  matchLocation!: string | null;

  @Column({ name: 'match_source', type: 'enum', enum: LeadSource, nullable: true })
  matchSource!: LeadSource | null;

  @Column({ name: 'match_priority', type: 'enum', enum: LeadPriority, nullable: true })
  matchPriority!: LeadPriority | null;

  @Column({
    name: 'min_value',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  minValue!: number | null;

  @Column({
    name: 'max_value',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  maxValue!: number | null;

  // ---- Eligibility policy and selection strategy ----
  @Column({ name: 'require_specialization', default: true })
  requireSpecialization!: boolean;

  @Column({
    name: 'territory_mode',
    type: 'enum',
    enum: TerritoryMode,
    default: TerritoryMode.PREFERRED,
  })
  territoryMode!: TerritoryMode;

  /** When true, employees already at their max_workload are skipped. */
  @Column({ name: 'respect_workload_limit', default: true })
  respectWorkloadLimit!: boolean;

  @Column({
    type: 'enum',
    enum: AssignmentStrategy,
    default: AssignmentStrategy.LEAST_WORKLOAD,
  })
  strategy!: AssignmentStrategy;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
