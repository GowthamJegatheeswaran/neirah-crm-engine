import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadEscalation } from './lead-escalation.entity';
import { SlaPoliciesController } from './sla-policies.controller';
import { SlaPoliciesService } from './sla-policies.service';
import { SlaPolicy } from './sla-policy.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SlaPolicy, LeadEscalation])],
  controllers: [SlaPoliciesController],
  providers: [SlaPoliciesService],
  exports: [TypeOrmModule, SlaPoliciesService],
})
export class SlaModule {}
