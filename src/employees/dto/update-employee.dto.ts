import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  NormalizeList,
  NotNullIfPresent,
  Trim,
} from '../../common/decorators/transform.decorators';
import { EmployeeAvailability } from '../employee-availability.enum';

/** Every field is optional, but a field that is sent can never be null. */
export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @Trim()
  @NotNullIfPresent()
  @IsString()
  @Length(2, 100)
  fullName?: string;

  @ApiPropertyOptional({ type: [String] })
  @NormalizeList()
  @NotNullIfPresent()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  specializations?: string[];

  @ApiPropertyOptional()
  @Trim()
  @NotNullIfPresent()
  @IsString()
  @Length(2, 100)
  territory?: string;

  @ApiPropertyOptional({ enum: EmployeeAvailability })
  @NotNullIfPresent()
  @IsEnum(EmployeeAvailability)
  availability?: EmployeeAvailability;

  @ApiPropertyOptional()
  @NotNullIfPresent()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxWorkload?: number;

  @ApiPropertyOptional()
  @NotNullIfPresent()
  @IsBoolean()
  isActive?: boolean;
}
