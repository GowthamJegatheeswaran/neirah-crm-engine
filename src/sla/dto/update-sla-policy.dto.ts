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
import { SlaAction } from '../sla.enums';

/** Every field optional. Description, match fields and value bounds accept null to clear them. */
export class UpdateSlaPolicyDto {
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

  @ApiPropertyOptional({ enum: LeadPriority, nullable: true })
  @IsOptional()
  @IsEnum(LeadPriority)
  matchPriority?: LeadPriority | null;

  @ApiPropertyOptional({ nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  matchService?: string | null;

  @ApiPropertyOptional({ enum: LeadSource, nullable: true })
  @IsOptional()
  @IsEnum(LeadSource)
  matchSource?: LeadSource | null;

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
  @IsInt()
  @Min(1)
  @Max(525_600)
  responseMinutes?: number;

  @ApiPropertyOptional({ enum: SlaAction })
  @NotNullIfPresent()
  @IsEnum(SlaAction)
  action?: SlaAction;
}
