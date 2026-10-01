import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@neirah.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'YourPassword1' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
