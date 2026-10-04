import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadActivitiesService } from './lead-activities.service';
import { LeadActivity } from './lead-activity.entity';

/** Kept separate so both the leads and assignment modules can write activities without a circular import. */
@Module({
  imports: [TypeOrmModule.forFeature([LeadActivity])],
  providers: [LeadActivitiesService],
  exports: [LeadActivitiesService],
})
export class LeadActivitiesModule {}
