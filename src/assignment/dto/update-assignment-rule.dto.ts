import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { NotNullIfPresent, Trim } from '../../common/decorators/transform.decorators';
import { LeadPriority, LeadSource } from '../../leads/lead.enums';
import { AssignmentStrategy, TerritoryMode } from '../assignment.enums';

/**
 * Every field is optional. Description and the match* / value conditions accept null to clear them;
 * all other fields cannot be null.
 */
export class UpdateAssignmentRuleDto {
  @ApiPropertyOptional()
  @Trim()
  @NotNullIfPresent()
  @IsString()
  @Length(3, 100)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @NotNullIfPresent()
  @IsInt()
  @Min(1)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional()
  @NotNullIfPresent()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  matchService?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  matchLocation?: string | null;

  @ApiPropertyOptional({ enum: LeadSource, nullable: true })
  @IsOptional()
  @IsEnum(LeadSource)
  matchSource?: LeadSource | null;

  @ApiPropertyOptional({ enum: LeadPriority, nullable: true })
  @IsOptional()
  @IsEnum(LeadPriority)
  matchPriority?: LeadPriority | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  minValue?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  maxValue?: number | null;

  @ApiPropertyOptional()
  @NotNullIfPresent()
  @IsBoolean()
  requireSpecialization?: boolean;

  @ApiPropertyOptional({ enum: TerritoryMode })
  @NotNullIfPresent()
  @IsEnum(TerritoryMode)
  territoryMode?: TerritoryMode;

  @ApiPropertyOptional()
  @NotNullIfPresent()
  @IsBoolean()
  respectWorkloadLimit?: boolean;

  @ApiPropertyOptional({ enum: AssignmentStrategy })
  @NotNullIfPresent()
  @IsEnum(AssignmentStrategy)
  strategy?: AssignmentStrategy;
}
