import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Employee } from './employee.entity';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, User])],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [TypeOrmModule, EmployeesService],
})
export class EmployeesModule {}
