import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { LeadActivitiesModule } from '../leads/lead-activities.module';
import { AssignmentEngineService } from './assignment-engine.service';
import { AssignmentHistory } from './assignment-history.entity';
import { AssignmentHistoryService } from './assignment-history.service';
import { AssignmentRule } from './assignment-rule.entity';
import { AssignmentRulesController } from './assignment-rules.controller';
import { AssignmentRulesService } from './assignment-rules.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssignmentRule, AssignmentHistory]),
    LeadActivitiesModule,
    FollowUpsModule,
  ],
  controllers: [AssignmentRulesController],
  providers: [AssignmentRulesService, AssignmentEngineService, AssignmentHistoryService],
  exports: [
    TypeOrmModule,
    AssignmentRulesService,
    AssignmentEngineService,
    AssignmentHistoryService,
  ],
})
export class AssignmentModule {}
