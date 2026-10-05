import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [EmployeesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
