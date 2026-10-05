import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { NotNullIfPresent, Trim } from '../../common/decorators/transform.decorators';
import { FollowUpType } from '../follow-up.enums';

/** Reschedule or edit a follow-up that is still pending or overdue. */
export class UpdateFollowUpDto {
  @ApiPropertyOptional()
  @Trim()
  @NotNullIfPresent()
  @IsString()
  @Length(3, 200)
  title?: string;

  @ApiPropertyOptional({ enum: FollowUpType })
  @NotNullIfPresent()
  @IsEnum(FollowUpType)
  type?: FollowUpType;

  @ApiPropertyOptional({ description: 'New due time (must be in the future)' })
  @NotNullIfPresent()
  @IsISO8601({ strict: true })
  dueAt?: string;

  @ApiPropertyOptional({ nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Hand the follow-up to another employee (manager/admin)' })
  @NotNullIfPresent()
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  employeeId?: number;
}
