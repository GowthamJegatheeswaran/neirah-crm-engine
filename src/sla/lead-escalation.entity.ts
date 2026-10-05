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
import { SlaPolicy } from './sla-policy.entity';
import { EscalationOutcome, ReferenceType, SlaAction } from './sla.enums';

/**
 * Append-only record of every SLA escalation.
 *
 * The UNIQUE (lead_id, reference_type, reference_id) key is what makes the processor idempotent:
 * a breach is identified by the event that started the clock (the "reference"). Running the
 * processor a hundred times can insert that row only once. A new assignment or a new qualifying
 * activity is a NEW reference, so it starts a fresh SLA window.
 */
@Entity('lead_escalations')
@Index('uq_lead_escalations_reference', ['leadId', 'referenceType', 'referenceId'], {
  unique: true,
})
@Index('idx_lead_escalations_created', ['createdAt'])
@Index('idx_lead_escalations_lead', ['leadId'])
export class LeadEscalation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Lead, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @Column({ name: 'lead_id', type: 'int' })
  leadId!: number;

  @ManyToOne(() => SlaPolicy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'policy_id' })
  policy?: SlaPolicy | null;

  @Column({ name: 'policy_id', type: 'int', nullable: true })
  policyId!: number | null;

  /** Copy of the policy name at that moment. */
  @Column({ name: 'policy_name', type: 'varchar' })
  policyName!: string;

  @Column({ name: 'response_minutes', type: 'int' })
  responseMinutes!: number;

  /** What the policy asked for. */
  @Column({ type: 'enum', enum: SlaAction })
  action!: SlaAction;

  /** What really happened. */
  @Column({ type: 'enum', enum: EscalationOutcome })
  outcome!: EscalationOutcome;

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

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'reference_type', type: 'enum', enum: ReferenceType })
  referenceType!: ReferenceType;

  @Column({ name: 'reference_id', type: 'int' })
  referenceId!: number;

  /** When the SLA clock started. */
  @Column({ name: 'reference_at', type: 'timestamptz' })
  referenceAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
