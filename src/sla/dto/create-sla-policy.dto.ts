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
import { SlaAction } from '../sla.enums';

export class CreateSlaPolicyDto {
  @ApiProperty({ example: 'High priority: respond within 30 minutes' })
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

  @ApiPropertyOptional({ example: 10, description: 'Lower number runs first (1-10000)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: LeadPriority })
  @IsOptional()
  @IsEnum(LeadPriority)
  matchPriority?: LeadPriority;

  @ApiPropertyOptional({ example: 'Enterprise' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  matchService?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  matchSource?: LeadSource;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  minValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  maxValue?: number;

  @ApiProperty({ example: 30, description: 'Minutes the owner has to act (1 - 525600)' })
  @IsInt()
  @Min(1)
  @Max(525_600)
  responseMinutes!: number;

  @ApiPropertyOptional({ enum: SlaAction, default: SlaAction.FLAG })
  @IsOptional()
  @IsEnum(SlaAction)
  action?: SlaAction;
}
