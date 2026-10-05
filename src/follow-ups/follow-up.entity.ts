import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Lead } from '../leads/lead.entity';
import { User } from '../users/user.entity';
import { FollowUpStatus, FollowUpType } from './follow-up.enums';

/**
 * A scheduled follow-up action (call, meeting, email...) on a lead, owned by one employee.
 * Final states (completed / cancelled) are never changed again; the lead timeline keeps the story.
 */
@Entity('follow_ups')
@Index('idx_follow_ups_lead', ['leadId'])
@Index('idx_follow_ups_employee_status', ['employeeId', 'status'])
@Index('idx_follow_ups_status_due', ['status', 'dueAt'])
@Check('"status" <> \'completed\' OR "completed_at" IS NOT NULL')
@Check('"status" <> \'cancelled\' OR "cancelled_at" IS NOT NULL')
export class FollowUp {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Lead, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @Column({ name: 'lead_id', type: 'int' })
  leadId!: number;

  /** Who must do it. Follows the lead when the lead is reassigned. */
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId!: number | null;

  @Column({ type: 'enum', enum: FollowUpType, default: FollowUpType.CALL })
  type!: FollowUpType;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt!: Date;

  @Column({ type: 'enum', enum: FollowUpStatus, default: FollowUpStatus.PENDING })
  status!: FollowUpStatus;

  /** When the processor first noticed it was late. */
  @Column({ name: 'overdue_at', type: 'timestamptz', nullable: true })
  overdueAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  /** What happened (on complete) or why it was cancelled. */
  @Column({ name: 'outcome_note', type: 'text', nullable: true })
  outcomeNote!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy?: User | null;

  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
