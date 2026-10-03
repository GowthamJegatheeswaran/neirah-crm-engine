import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { MAX_LEAD_VALUE } from '../../common/constants';
import {
  NormalizeEmail,
  NotNullIfPresent,
  Trim,
} from '../../common/decorators/transform.decorators';
import { LeadPriority, LeadSource, LeadStatus } from '../lead.enums';
import { PHONE_REGEX } from './create-lead.dto';

/**
 * email, phone and company may be set to null (to clear them).
 * Every other field may be left out, but cannot be null.
 */
export class UpdateLeadDto {
  @ApiPropertyOptional()
  @Trim()
  @NotNullIfPresent()
  @IsString()
  @Length(2, 150)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @NormalizeEmail()
  @IsOptional()
  @IsEmail()
  @Length(3, 254)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Trim()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'phone must be a valid phone number' })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @Length(2, 150)
  company?: string | null;

  @ApiPropertyOptional({ enum: LeadSource })
  @NotNullIfPresent()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional()
  @Trim()
  @NotNullIfPresent()
  @IsString()
  @Length(2, 100)
  service?: string;

  @ApiPropertyOptional()
  @Trim()
  @NotNullIfPresent()
  @IsString()
  @Length(2, 100)
  location?: string;

  @ApiPropertyOptional()
  @NotNullIfPresent()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  estimatedValue?: number;

  @ApiPropertyOptional({ enum: LeadPriority })
  @NotNullIfPresent()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @ApiPropertyOptional({ enum: LeadStatus })
  @NotNullIfPresent()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
