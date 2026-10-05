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
import { SlaAction } from './sla.enums';

const numericTransformer = {
  to: (v?: number | null) => v,
  from: (v: string | null) => (v === null ? null : parseFloat(v)),
};

/**
 * One configurable SLA policy: "leads like THIS must get a response within N minutes, otherwise DO X".
 * Evaluated by ascending priority number; the first ACTIVE policy whose conditions match the lead
 * applies. Everything that may change lives in this table, not in code.
 */
@Entity('sla_policies')
@Index('uq_sla_policies_name', ['name'], { unique: true })
@Index('idx_sla_policies_active_priority', ['isActive', 'priority'])
@Check('"priority" BETWEEN 1 AND 10000')
@Check('"response_minutes" BETWEEN 1 AND 525600')
@Check('"min_value" IS NULL OR "max_value" IS NULL OR "min_value" <= "max_value"')
export class SlaPolicy {
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

  // ---- Conditions: NULL means "any". All set conditions must match. ----
  @Column({ name: 'match_priority', type: 'enum', enum: LeadPriority, nullable: true })
  matchPriority!: LeadPriority | null;

  @Column({ name: 'match_service', type: 'varchar', nullable: true })
  matchService!: string | null;

  @Column({ name: 'match_source', type: 'enum', enum: LeadSource, nullable: true })
  matchSource!: LeadSource | null;

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

  // ---- The promise and the consequence ----
  /** Minutes the owner has to act (status change, note, follow-up) after assignment / last action. */
  @Column({ name: 'response_minutes', type: 'int' })
  responseMinutes!: number;

  @Column({ type: 'enum', enum: SlaAction, default: SlaAction.FLAG })
  action!: SlaAction;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
