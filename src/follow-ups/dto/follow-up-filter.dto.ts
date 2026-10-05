import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_INT } from '../../common/constants';
import { ToBoolean } from '../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { FollowUpStatus, FollowUpType } from '../follow-up.enums';

export class FollowUpFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  @ApiPropertyOptional({ enum: FollowUpType })
  @IsOptional()
  @IsEnum(FollowUpType)
  type?: FollowUpType;

  @ApiPropertyOptional({ description: 'Responsible employee (ignored for sales users)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  employeeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  leadId?: number;

  @ApiPropertyOptional({
    description: 'true = open follow-ups whose due time has passed, false = open and not yet late',
  })
  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueTo?: string;
}
