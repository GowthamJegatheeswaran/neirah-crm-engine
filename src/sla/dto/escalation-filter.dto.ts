import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { MAX_INT } from '../../common/constants';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { EscalationOutcome } from '../sla.enums';

export class EscalationFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  leadId?: number;

  @ApiPropertyOptional({
    description: 'Escalations that took the lead FROM or gave it TO this employee',
  })
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
  policyId?: number;

  @ApiPropertyOptional({ enum: EscalationOutcome })
  @IsOptional()
  @IsEnum(EscalationOutcome)
  outcome?: EscalationOutcome;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
