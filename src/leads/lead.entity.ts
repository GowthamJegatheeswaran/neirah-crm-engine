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
import { LeadPriority, LeadSource, LeadStatus } from './lead.enums';

@Entity('leads')
@Index('idx_leads_status', ['status'])
@Index('idx_leads_assigned_employee', ['assignedEmployeeId'])
@Index('idx_leads_service_location', ['service', 'location'])
@Index('idx_leads_priority', ['priority'])
@Index('idx_leads_created_at', ['createdAt'])
@Check('"estimated_value" >= 0')
export class Lead {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  company!: string | null;

  @Column({ type: 'enum', enum: LeadSource, default: LeadSource.MANUAL })
  source!: LeadSource;

  /** Service/category the lead wants, e.g. 'Enterprise'. Matched against employee.specializations. */
  @Column()
  service!: string;

  /** Lead location, e.g. 'Colombo'. Matched against employee.territory. */
  @Column()
  location!: string;

  @Column({
    name: 'estimated_value',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    // Postgres returns numeric as string; convert to a JS number for the API.
    transformer: {
      to: (v?: number) => v,
      from: (v: string | null) => (v === null ? v : parseFloat(v)),
    },
  })
  estimatedValue!: number;

  @Column({ type: 'enum', enum: LeadPriority, default: LeadPriority.MEDIUM })
  priority!: LeadPriority;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
  status!: LeadStatus;

  /** Current owner. Every ownership change will also be written to assignment history (Day 3). */
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_employee_id' })
  assignedEmployee?: Employee | null;

  @Column({ name: 'assigned_employee_id', type: 'int', nullable: true })
  assignedEmployeeId!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
