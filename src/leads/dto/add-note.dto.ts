import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Trim } from '../../common/decorators/transform.decorators';

export class AddNoteDto {
  @ApiProperty({ example: 'Customer asked for a demo next week' })
  @Trim()
  @IsString()
  @Length(1, 2000)
  note!: string;
}
