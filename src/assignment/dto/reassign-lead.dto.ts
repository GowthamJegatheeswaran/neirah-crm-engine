import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { MAX_INT } from '../../common/constants';
import { Trim } from '../../common/decorators/transform.decorators';

export class ReassignLeadDto {
  @ApiProperty({ example: 3, description: 'Employee who becomes the new owner' })
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  employeeId!: number;

  @ApiProperty({ example: 'Customer asked for a Tamil-speaking rep' })
  @Trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}
