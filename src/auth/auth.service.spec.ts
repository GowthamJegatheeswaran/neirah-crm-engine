import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '../users/role.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), verifyPassword: jest.fn() };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
  const config = { getOrThrow: jest.fn().mockReturnValue('1h') };
  const activeUser = {
    id: 7,
    email: 'priya@neirah.test',
    role: Role.SALES,
    isActive: true,
    passwordHash: 'hash',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('returns a token and a safe user on valid credentials', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(activeUser);
    usersService.verifyPassword.mockResolvedValue(true);

    const result = await service.login({ email: activeUser.email, password: 'Secret123' });

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 7,
      email: 'priya@neirah.test',
      role: Role.SALES,
    });
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).toEqual({ id: 7, email: 'priya@neirah.test', role: Role.SALES });
    expect(JSON.stringify(result)).not.toContain('hash');
  });

  it('rejects an unknown email with the same error as a wrong password', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(null);
    usersService.verifyPassword.mockResolvedValue(false);
    await expect(service.login({ email: 'nobody@x.test', password: 'x' })).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
    // still compared against a dummy hash so the response time does not reveal the email exists
    expect(usersService.verifyPassword).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong password', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(activeUser);
    usersService.verifyPassword.mockResolvedValue(false);
    await expect(service.login({ email: activeUser.email, password: 'bad' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an inactive user even with the right password', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue({ ...activeUser, isActive: false });
    usersService.verifyPassword.mockResolvedValue(true);
    await expect(service.login({ email: activeUser.email, password: 'Secret123' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
