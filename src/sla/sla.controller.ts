import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { IdPipe } from '../common/pipes/id.pipe';
import { Role } from '../users/role.enum';
import { EscalationFilterDto } from './dto/escalation-filter.dto';
import { RunSlaQueryDto } from './dto/run-sla.dto';
import { EscalationsService } from './escalations.service';
import { SlaProcessorService } from './sla-processor.service';

@ApiTags('SLA & escalations')
@ApiBearerAuth()
@Controller()
export class SlaController {
  constructor(
    private readonly processor: SlaProcessorService,
    private readonly escalations: EscalationsService,
  ) {}

  @Post('sla/run')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Run the SLA processor now (the scheduler runs the same code automatically)',
    description:
      'Marks late follow-ups overdue and escalates leads whose response SLA is breached. ' +
      'Safe to call repeatedly: a breach is escalated only once. Use ?dryRun=true to preview.',
  })
  run(@Query() query: RunSlaQueryDto) {
    return this.processor.run({ dryRun: query.dryRun });
  }

  @Get('escalations')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List SLA escalations, newest first, with filters' })
  findAll(@Query() filter: EscalationFilterDto) {
    return this.escalations.findAll(filter);
  }

  @Get('leads/:id/escalations')
  @ApiOperation({ summary: 'Escalation history of one lead (sales: own leads only)' })
  forLead(
    @Param('id', IdPipe) id: number,
    @Query() filter: EscalationFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.escalations.findForLead(id, filter, user);
  }
}
