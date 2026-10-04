import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { LeadActivitiesModule } from './lead-activities.module';
import { Lead } from './lead.entity';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead]), EmployeesModule, LeadActivitiesModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [TypeOrmModule, LeadsService, LeadActivitiesModule],
})
export class LeadsModule {}
