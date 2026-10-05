import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { LeadActivitiesModule } from '../leads/lead-activities.module';
import { FollowUp } from './follow-up.entity';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

/**
 * Deliberately does NOT import LeadsModule or AssignmentModule: they import this module
 * (to cancel / transfer follow-ups), so importing them back would create a circular dependency.
 */
@Module({
  imports: [TypeOrmModule.forFeature([FollowUp]), EmployeesModule, LeadActivitiesModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  exports: [TypeOrmModule, FollowUpsService],
})
export class FollowUpsModule {}
