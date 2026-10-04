import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentRule } from './assignment-rule.entity';
import { AssignmentRulesController } from './assignment-rules.controller';
import { AssignmentRulesService } from './assignment-rules.service';
import { AssignmentHistory } from './assignment-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AssignmentRule, AssignmentHistory])],
  controllers: [AssignmentRulesController],
  providers: [AssignmentRulesService],
  exports: [TypeOrmModule, AssignmentRulesService],
})
export class AssignmentModule {}
