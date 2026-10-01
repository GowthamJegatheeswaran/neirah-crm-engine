import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { EmployeeAvailability } from './employee-availability.enum';

@Entity('employees')
@Index('idx_employees_territory', ['territory'])
@Index('idx_employees_availability', ['availability', 'isActive'])
@Check('"max_workload" > 0')
export class Employee {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Optional login account for this sales employee (one user <-> one employee). */
  @OneToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'user_id', type: 'int', nullable: true, unique: true })
  userId!: number | null;

  @Column({ name: 'full_name' })
  fullName!: string;

  /** Services this employee can handle, e.g. ['Enterprise', 'SMB']. Matched against lead.service. */
  @Column('text', { array: true, default: () => "'{}'" })
  specializations!: string[];

  /** Territory/location, e.g. 'Colombo'. Matched against lead.location. */
  @Column()
  territory!: string;

  @Column({ type: 'enum', enum: EmployeeAvailability, default: EmployeeAvailability.AVAILABLE })
  availability!: EmployeeAvailability;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /**
   * Upper limit of open leads. The assignment engine skips employees at/over this limit.
   * Stored per employee (not hard-coded) so it can change without a code change.
   * Current workload is NOT stored; it is counted from assigned open leads (no stale numbers).
   */
  @Column({ name: 'max_workload', type: 'int', default: 10 })
  maxWorkload!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
