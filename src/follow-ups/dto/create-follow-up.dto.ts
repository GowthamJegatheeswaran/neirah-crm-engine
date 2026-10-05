import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_INT } from '../../common/constants';
import { Trim } from '../../common/decorators/transform.decorators';
import { FollowUpType } from '../follow-up.enums';

export class CreateFollowUpDto {
  @ApiProperty({ example: 'Call back about the proposal' })
  @Trim()
  @IsString()
  @Length(3, 200)
  title!: string;

  @ApiPropertyOptional({ enum: FollowUpType, default: FollowUpType.CALL })
  @IsOptional()
  @IsEnum(FollowUpType)
  type?: FollowUpType;

  @ApiProperty({ example: '2026-12-01T10:00:00Z', description: 'Must be in the future' })
  @IsISO8601({ strict: true })
  dueAt!: string;

  @ApiPropertyOptional()
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Responsible employee (manager/admin only). Defaults to the lead owner.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  employeeId?: number;
}
