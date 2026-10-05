import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/transform.decorators';

/** Body of complete / cancel: an optional note saying what happened or why. */
export class CloseFollowUpDto {
  @ApiPropertyOptional({ example: 'Customer agreed to a demo on Monday' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
