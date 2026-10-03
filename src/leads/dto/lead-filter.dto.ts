import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_INT, MAX_LEAD_VALUE } from '../../common/constants';
import { ToBoolean, Trim } from '../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SortOrder } from '../../common/pagination/sort-order.enum';
import { LeadPriority, LeadSource, LeadStatus } from '../lead.enums';

export enum LeadSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  ESTIMATED_VALUE = 'estimatedValue',
  NAME = 'name',
  STATUS = 'status',
  PRIORITY = 'priority',
}

export class LeadFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches name, email, company or phone' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadPriority })
  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  assignedEmployeeId?: number;

  @ApiPropertyOptional({ description: 'true = only leads with no owner' })
  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  unassigned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  minValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  maxValue?: number;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdTo?: string;

  @ApiPropertyOptional({ enum: LeadSortBy, default: LeadSortBy.CREATED_AT })
  @IsOptional()
  @IsEnum(LeadSortBy)
  sortBy: LeadSortBy = LeadSortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.DESC;
}
