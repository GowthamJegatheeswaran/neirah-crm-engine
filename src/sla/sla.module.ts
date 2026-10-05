import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentModule } from '../assignment/assignment.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { LeadActivitiesModule } from '../leads/lead-activities.module';
import { LeadEscalation } from './lead-escalation.entity';
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
  ],
  controllers: [SlaPoliciesController],
  providers: [SlaPoliciesService, SlaProcessorService],
  exports: [TypeOrmModule, SlaPoliciesService, SlaProcessorService],
})
export class SlaModule {}
