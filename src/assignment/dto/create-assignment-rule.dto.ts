import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_LEAD_VALUE } from '../../common/constants';
import { Trim } from '../../common/decorators/transform.decorators';
import { LeadPriority, LeadSource } from '../../leads/lead.enums';
import { AssignmentStrategy, TerritoryMode } from '../assignment.enums';

export class CreateAssignmentRuleDto {
  @ApiProperty({ example: 'High value leads: territory required' })
  @Trim()
  @IsString()
  @Length(3, 100)
  name!: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Lower number runs first (1-10000)',
    default: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Enterprise', description: 'Only leads with this service' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  matchService?: string;

  @ApiPropertyOptional({ example: 'Colombo' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  matchLocation?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  matchSource?: LeadSource;

  @ApiPropertyOptional({ enum: LeadPriority })
  @IsOptional()
  @IsEnum(LeadPriority)
  matchPriority?: LeadPriority;

  @ApiPropertyOptional({ example: 100000, description: 'Minimum estimated value (inclusive)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  minValue?: number;

  @ApiPropertyOptional({ description: 'Maximum estimated value (inclusive)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  maxValue?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Employee must list the lead service as a specialization',
  })
  @IsOptional()
  @IsBoolean()
  requireSpecialization?: boolean;

  @ApiPropertyOptional({ enum: TerritoryMode, default: TerritoryMode.PREFERRED })
  @IsOptional()
  @IsEnum(TerritoryMode)
  territoryMode?: TerritoryMode;

  @ApiPropertyOptional({ default: true, description: 'Skip employees who reached max workload' })
  @IsOptional()
  @IsBoolean()
  respectWorkloadLimit?: boolean;

  @ApiPropertyOptional({ enum: AssignmentStrategy, default: AssignmentStrategy.LEAST_WORKLOAD })
  @IsOptional()
  @IsEnum(AssignmentStrategy)
  strategy?: AssignmentStrategy;
}
