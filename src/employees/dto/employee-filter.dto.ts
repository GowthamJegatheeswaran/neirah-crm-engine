import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToBoolean, Trim } from '../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SortOrder } from '../../common/pagination/sort-order.enum';
import { EmployeeAvailability } from '../employee-availability.enum';

export enum EmployeeSortBy {
  FULL_NAME = 'fullName',
  TERRITORY = 'territory',
  CREATED_AT = 'createdAt',
  OPEN_LEADS = 'openLeads',
}

export class EmployeeFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches name or territory (case-insensitive)' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  territory?: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  specialization?: string;

  @ApiPropertyOptional({ enum: EmployeeAvailability })
  @IsOptional()
  @IsEnum(EmployeeAvailability)
  availability?: EmployeeAvailability;

  @ApiPropertyOptional()
  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: EmployeeSortBy, default: EmployeeSortBy.CREATED_AT })
  @IsOptional()
  @IsEnum(EmployeeSortBy)
  sortBy: EmployeeSortBy = EmployeeSortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.DESC;
}
