import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { buildTypeOrmOptions } from './database/typeorm.config';
import { AssignmentModule } from './assignment/assignment.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmployeesModule } from './employees/employees.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { SlaModule } from './sla/sla.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // isGlobal: any module can read config without importing ConfigModule again
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    UsersModule,
    EmployeesModule,
    AssignmentModule,
    FollowUpsModule,
    LeadsModule,
    SlaModule,
    DashboardModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
