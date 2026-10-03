import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { NormalizeList, Trim } from '../../common/decorators/transform.decorators';
import { MAX_INT } from '../../common/constants';
import { EmployeeAvailability } from '../employee-availability.enum';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @Trim()
  @IsString()
  @Length(2, 100)
  fullName!: string;

  @ApiProperty({ example: ['Enterprise', 'SMB'], description: 'Services this employee can handle' })
  @NormalizeList()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  specializations!: string[];

  @ApiProperty({ example: 'Colombo' })
  @Trim()
  @IsString()
  @Length(2, 100)
  territory!: string;

  @ApiPropertyOptional({ enum: EmployeeAvailability, default: EmployeeAvailability.AVAILABLE })
  @IsOptional()
  @IsEnum(EmployeeAvailability)
  availability?: EmployeeAvailability;

  @ApiPropertyOptional({ example: 10, description: 'Maximum open leads (1-1000)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxWorkload?: number;

  @ApiPropertyOptional({ description: 'Link to an existing sales user account' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  userId?: number;
}
