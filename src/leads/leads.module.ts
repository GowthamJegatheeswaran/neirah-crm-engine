import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadActivity } from './lead-activity.entity';
import { Lead } from './lead.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadActivity])],
  exports: [TypeOrmModule],
})
export class LeadsModule {}
