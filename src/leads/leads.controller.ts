import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { IdPipe } from '../common/pipes/id.pipe';
import { Role } from '../users/role.enum';
import { AddNoteDto } from './dto/add-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadFilterDto } from './dto/lead-filter.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a lead (status starts as new)' })
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List leads with filters, sorting and pagination (sales: own leads only)',
  })
  findAll(@Query() filter: LeadFilterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.findAll(filter, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one lead' })
  findOne(@Param('id', IdPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead details and/or move its status along the lifecycle' })
  update(
    @Param('id', IdPipe) id: number,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.update(id, dto, user);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to the lead timeline' })
  addNote(
    @Param('id', IdPipe) id: number,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.addNote(id, dto, user);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'Activity timeline of a lead (oldest first)' })
  timeline(
    @Param('id', IdPipe) id: number,
    @Query() query: TimelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.timeline(id, query, user);
  }
}
