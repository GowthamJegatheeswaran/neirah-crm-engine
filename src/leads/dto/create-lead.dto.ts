import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { NormalizeEmail, Trim } from '../../common/decorators/transform.decorators';
import { LeadPriority, LeadSource } from '../lead.enums';

export const PHONE_REGEX = /^\+?[0-9][0-9\s\-()]{5,19}$/;

export class CreateLeadDto {
  @ApiProperty({ example: 'Acme Traders' })
  @Trim()
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiPropertyOptional({ example: 'buyer@acme.test' })
  @NormalizeEmail()
  @IsOptional()
  @IsEmail()
  @Length(3, 254)
  email?: string;

  @ApiPropertyOptional({ example: '+94 77 123 4567' })
  @Trim()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'phone must be a valid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Acme Pvt Ltd' })
  @Trim()
  @IsOptional()
  @IsString()
  @Length(2, 150)
  company?: string;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.MANUAL })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiProperty({ example: 'Enterprise', description: 'Service the lead wants' })
  @Trim()
  @IsString()
  @Length(2, 100)
  service!: string;

  @ApiProperty({ example: 'Colombo' })
  @Trim()
  @IsString()
  @Length(2, 100)
  location!: string;

  @ApiPropertyOptional({ example: 25000.5, description: 'Up to 2 decimals' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_LEAD_VALUE)
  estimatedValue?: number;

  @ApiPropertyOptional({ enum: LeadPriority, default: LeadPriority.MEDIUM })
  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;
}
