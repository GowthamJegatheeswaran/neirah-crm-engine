import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EmployeeAvailability } from '../employee-availability.enum';

export class UpdateAvailabilityDto {
  @ApiProperty({ enum: EmployeeAvailability })
  @IsEnum(EmployeeAvailability)
  availability!: EmployeeAvailability;
}
