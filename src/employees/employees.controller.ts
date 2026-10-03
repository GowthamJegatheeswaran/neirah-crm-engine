import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { IdPipe } from '../common/pipes/id.pipe';
import { Role } from '../users/role.enum';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeFilterDto } from './dto/employee-filter.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a sales employee profile' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List employees with filters, sorting and pagination' })
  findAll(@Query() filter: EmployeeFilterDto) {
    return this.employeesService.findAll(filter);
  }

  // /me routes are declared before /:id so "me" is never read as an id
  @Get('me')
  @ApiOperation({ summary: 'My own employee profile (sales)' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.findProfileByUserId(user.id);
  }

  @Patch('me/availability')
  @ApiOperation({ summary: 'Set my own availability (sales)' })
  updateMyAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAvailabilityDto) {
    return this.employeesService.updateOwnAvailability(user.id, dto);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get one employee' })
  findOne(@Param('id', IdPipe) id: number) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update an employee profile' })
  update(@Param('id', IdPipe) id: number, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }
}
