import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { IdPipe } from '../common/pipes/id.pipe';
import { CloseFollowUpDto } from './dto/close-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { FollowUpFilterDto } from './dto/follow-up-filter.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { FollowUpsService } from './follow-ups.service';

@ApiTags('Follow-ups')
@ApiBearerAuth()
@Controller()
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Post('leads/:id/follow-ups')
  @ApiOperation({
    summary: 'Schedule a follow-up on a lead',
    description: 'Responsible employee defaults to the lead owner. dueAt must be in the future.',
  })
  create(
    @Param('id', IdPipe) leadId: number,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.followUps.create(leadId, dto, user);
  }

  @Get('leads/:id/follow-ups')
  @ApiOperation({ summary: 'Follow-ups of one lead (sales: own leads only)' })
  forLead(
    @Param('id', IdPipe) leadId: number,
    @Query() filter: FollowUpFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.followUps.findForLead(leadId, filter, user);
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'List follow-ups with filters (sales: own follow-ups only)' })
  findAll(@Query() filter: FollowUpFilterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.followUps.findAll(filter, user);
  }

  @Get('follow-ups/:id')
  @ApiOperation({ summary: 'Get one follow-up' })
  findOne(@Param('id', IdPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.followUps.findOne(id, user);
  }

  @Patch('follow-ups/:id')
  @ApiOperation({ summary: 'Edit or reschedule a pending/overdue follow-up' })
  update(
    @Param('id', IdPipe) id: number,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.followUps.update(id, dto, user);
  }

  @Post('follow-ups/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a follow-up as completed (409 if already completed/cancelled)' })
  complete(
    @Param('id', IdPipe) id: number,
    @Body() dto: CloseFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.followUps.complete(id, dto, user);
  }

  @Post('follow-ups/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a follow-up (409 if already completed/cancelled)' })
  cancel(
    @Param('id', IdPipe) id: number,
    @Body() dto: CloseFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.followUps.cancel(id, dto, user);
  }
}
