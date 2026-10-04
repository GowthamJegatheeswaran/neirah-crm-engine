import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssignmentEngineService } from '../assignment/assignment-engine.service';
import { ReassignLeadDto } from '../assignment/dto/reassign-lead.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { IdPipe } from '../common/pipes/id.pipe';
import { Role } from '../users/role.enum';
import { LeadsService } from './leads.service';

@ApiTags('Lead assignment')
@ApiBearerAuth()
@Controller('leads')
export class LeadAssignmentController {
  constructor(
    private readonly engine: AssignmentEngineService,
    private readonly leadsService: LeadsService,
  ) {}

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Run the assignment rules for an unassigned lead',
    description:
      'Returns assigned=false (and records why) when no eligible employee exists. Nothing invalid is ever assigned.',
  })
  assign(@Param('id', IdPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.engine.autoAssign(id, { userId: user.id });
  }

  @Get(':id/assignment-preview')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Dry run: who would the rules choose? Nothing is saved' })
  preview(@Param('id', IdPipe) id: number) {
    return this.engine.preview(id);
  }

  @Post(':id/reassign')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Manually assign or reassign a lead (previous owner stays in the history)',
  })
  reassign(
    @Param('id', IdPipe) id: number,
    @Body() dto: ReassignLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.engine.reassign(id, dto, { userId: user.id });
  }

  @Get(':id/assignment-history')
  @ApiOperation({ summary: 'Ownership history of a lead, oldest first (sales: own leads only)' })
  history(
    @Param('id', IdPipe) id: number,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.history(id, query, user);
  }
}
