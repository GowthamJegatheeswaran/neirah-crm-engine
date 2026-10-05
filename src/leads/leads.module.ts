import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentModule } from '../assignment/assignment.module';
import { EmployeesModule } from '../employees/employees.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { LeadActivitiesModule } from './lead-activities.module';
import { Lead } from './lead.entity';
import { LeadAssignmentController } from './lead-assignment.controller';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead]),
    EmployeesModule,
    LeadActivitiesModule,
    AssignmentModule,
    FollowUpsModule,
  ],
  controllers: [LeadsController, LeadAssignmentController],
  providers: [LeadsService],
  exports: [TypeOrmModule, LeadsService, LeadActivitiesModule],
})
export class LeadsModule {}
