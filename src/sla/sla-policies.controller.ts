import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdPipe } from '../common/pipes/id.pipe';
import { Role } from '../users/role.enum';
import { CreateSlaPolicyDto } from './dto/create-sla-policy.dto';
import { SlaPolicyFilterDto } from './dto/sla-policy-filter.dto';
import { UpdateSlaPolicyDto } from './dto/update-sla-policy.dto';
import { SlaPoliciesService } from './sla-policies.service';

@ApiTags('SLA policies')
@ApiBearerAuth()
@Controller('sla-policies')
export class SlaPoliciesController {
  constructor(private readonly policies: SlaPoliciesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create an SLA policy (admin only)' })
  create(@Body() dto: CreateSlaPolicyDto) {
    return this.policies.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List SLA policies in evaluation order' })
  findAll(@Query() filter: SlaPolicyFilterDto) {
    return this.policies.findAll(filter);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get one SLA policy' })
  findOne(@Param('id', IdPipe) id: number) {
    return this.policies.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update, activate or deactivate an SLA policy (admin only)' })
  update(@Param('id', IdPipe) id: number, @Body() dto: UpdateSlaPolicyDto) {
    return this.policies.update(id, dto);
  }
}
