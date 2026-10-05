import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { LeadActivitiesModule } from '../leads/lead-activities.module';
import { LeadEscalation } from './lead-escalation.entity';
import { EscalationsService } from './escalations.service';
import { SlaController } from './sla.controller';
import { SlaSchedulerService } from './sla-scheduler.service';
import { SlaPoliciesController } from './sla-policies.controller';
import { SlaPoliciesService } from './sla-policies.service';
import { SlaPolicy } from './sla-policy.entity';
import { SlaProcessorService } from './sla-processor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlaPolicy, LeadEscalation]),
    AssignmentModule,
    FollowUpsModule,
    LeadActivitiesModule,
    EmployeesModule,
  ],
  controllers: [SlaPoliciesController, SlaController],
  providers: [SlaPoliciesService, SlaProcessorService, EscalationsService, SlaSchedulerService],
  exports: [TypeOrmModule, SlaPoliciesService, SlaProcessorService],
})
export class SlaModule {}
