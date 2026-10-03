import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadActivitiesService } from './lead-activities.service';
import { LeadActivity } from './lead-activity.entity';
import { Lead } from './lead.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadActivity])],
  providers: [LeadActivitiesService],
  exports: [TypeOrmModule, LeadActivitiesService],
})
export class LeadsModule {}
