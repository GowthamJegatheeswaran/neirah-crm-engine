import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { LeadActivitiesService } from './lead-activities.service';
import { LeadActivity } from './lead-activity.entity';
import { Lead } from './lead.entity';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadActivity]), EmployeesModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadActivitiesService],
  exports: [TypeOrmModule, LeadActivitiesService, LeadsService],
})
export class LeadsModule {}
