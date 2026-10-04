import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Lead } from '../leads/lead.entity';
import { User } from '../users/user.entity';
import { AssignmentRule } from './assignment-rule.entity';
import { AssignmentAction, AssignmentMode } from './assignment.enums';

/**
 * Append-only ownership history. A row is written for every assignment, reassignment and every
 * time the engine found nobody eligible. Rows are never updated or deleted by application code,
 * so previous owners are always preserved.
 */
@Entity('assignment_history')
@Index('idx_assignment_history_lead', ['leadId', 'id'])
@Index('idx_assignment_history_to_employee', ['toEmployeeId', 'action'])
export class AssignmentHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Lead, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @Column({ name: 'lead_id', type: 'int' })
  leadId!: number;

  @Column({ type: 'enum', enum: AssignmentAction })
  action!: AssignmentAction;

  @Column({ type: 'enum', enum: AssignmentMode })
  mode!: AssignmentMode;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'from_employee_id' })
  fromEmployee?: Employee | null;

  @Column({ name: 'from_employee_id', type: 'int', nullable: true })
  fromEmployeeId!: number | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'to_employee_id' })
  toEmployee?: Employee | null;

  @Column({ name: 'to_employee_id', type: 'int', nullable: true })
  toEmployeeId!: number | null;

  @ManyToOne(() => AssignmentRule, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rule_id' })
  rule?: AssignmentRule | null;

  @Column({ name: 'rule_id', type: 'int', nullable: true })
  ruleId!: number | null;

  /** Copy of the rule name at that moment, so history still reads well if the rule is renamed later. */
  @Column({ name: 'rule_name', type: 'varchar', nullable: true })
  ruleName!: string | null;

  /** Human-readable explanation of why this result happened. */
  @Column({ type: 'text' })
  reason!: string;

  /** Structured details, e.g. the candidates considered and their workloads. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  /** NULL = the system acted on its own. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performed_by_user_id' })
  performedBy?: User | null;

  @Column({ name: 'performed_by_user_id', type: 'int', nullable: true })
  performedByUserId!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
