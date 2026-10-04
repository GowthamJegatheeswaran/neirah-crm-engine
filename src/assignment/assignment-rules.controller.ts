import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdPipe } from '../common/pipes/id.pipe';
import { Role } from '../users/role.enum';
import { AssignmentRulesService } from './assignment-rules.service';
import { CreateAssignmentRuleDto } from './dto/create-assignment-rule.dto';
import { RuleFilterDto } from './dto/rule-filter.dto';
import { UpdateAssignmentRuleDto } from './dto/update-assignment-rule.dto';

@ApiTags('Assignment rules')
@ApiBearerAuth()
@Controller('assignment-rules')
export class AssignmentRulesController {
  constructor(private readonly rulesService: AssignmentRulesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create an assignment rule (admin only)' })
  create(@Body() dto: CreateAssignmentRuleDto) {
    return this.rulesService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List rules in evaluation order (priority, then id)' })
  findAll(@Query() filter: RuleFilterDto) {
    return this.rulesService.findAll(filter);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get one rule' })
  findOne(@Param('id', IdPipe) id: number) {
    return this.rulesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update, activate or deactivate a rule (admin only)' })
  update(@Param('id', IdPipe) id: number, @Body() dto: UpdateAssignmentRuleDto) {
    return this.rulesService.update(id, dto);
  }
}
