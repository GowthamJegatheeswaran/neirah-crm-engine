import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Lead } from './lead.entity';
import { ActivityType } from './lead.enums';

/**
 * Append-only timeline / audit log of everything that happens to a lead.
 * Rows are only inserted, never updated or deleted by application code.
 */
@Entity('lead_activities')
@Index('idx_lead_activities_lead_created', ['leadId', 'createdAt'])
export class LeadActivity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Lead, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @Column({ name: 'lead_id', type: 'int' })
  leadId!: number;

  @Column({ type: 'enum', enum: ActivityType })
  type!: ActivityType;

  @Column({ type: 'text' })
  description!: string;

  /** Extra structured details, e.g. { from: 'new', to: 'assigned' }. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  /** Who did it. NULL means the system did it (auto-assignment, SLA scheduler). */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performed_by_user_id' })
  performedBy?: User | null;

  @Column({ name: 'performed_by_user_id', type: 'int', nullable: true })
  performedByUserId!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
