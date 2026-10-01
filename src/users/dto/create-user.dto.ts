import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Role } from '../role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'priya@neirah.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass@123', description: 'Min 8 chars with a letter and a number' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt only uses the first 72 bytes
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;

  @ApiProperty({ enum: Role, example: Role.SALES })
  @IsEnum(Role)
  role!: Role;
}
