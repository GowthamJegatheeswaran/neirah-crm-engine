import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt-payload.interface';

// A valid bcrypt hash of a random string. Compared against when the email does not exist,
// so "unknown email" and "wrong password" take about the same time (prevents user enumeration).
const DUMMY_HASH = '$2b$10$OmKE0b5k.MvWp.MvplH1QOTebYCsOxO6pZRUfwcsenOe0pAKb8yru';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    const passwordOk = await this.usersService.verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    // Same message for every failure on purpose: do not reveal which part was wrong.
    if (!user || !user.isActive || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN'),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
