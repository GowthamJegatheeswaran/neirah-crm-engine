import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { Role } from '../users/role.enum';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto, EmployeeDashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Company-wide numbers: leads, follow-ups, escalations, assignments',
    description:
      'from/to filter by creation time. Follow-up "overdue" counts late follow-ups even before the processor ran.',
  })
  overview(@Query() query: DashboardQueryDto) {
    return this.dashboard.overview(query);
  }

  @Get('employees')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Workload, results and overdue follow-ups per employee' })
  employees(@Query() query: EmployeeDashboardQueryDto) {
    return this.dashboard.employeeStats(query);
  }

  @Get('me')
  @Roles(Role.SALES)
  @ApiOperation({ summary: 'My own numbers and my next follow-ups (sales users)' })
  mine(@Query() query: DashboardQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.mine(user, query);
  }
}
