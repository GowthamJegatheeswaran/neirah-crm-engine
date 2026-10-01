import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Role } from './role.enum';
import { User } from './user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const repo = {
    exists: jest.fn(),
    create: jest.fn((data: Partial<User>) => data),
    save: jest.fn((data: Partial<User>) => Promise.resolve({ id: 1, isActive: true, ...data })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: repo }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    repo.exists.mockResolvedValue(false);
    await service.create({ email: 'New@Neirah.test', password: 'Secret123', role: Role.SALES });

    const savedArg = repo.create.mock.calls[0][0] as Partial<User>;
    expect(savedArg.passwordHash).toBeDefined();
    expect(savedArg.passwordHash).not.toBe('Secret123');
    expect(await bcrypt.compare('Secret123', savedArg.passwordHash as string)).toBe(true);
  });

  it('normalizes the email to lower case', async () => {
    repo.exists.mockResolvedValue(false);
    await service.create({ email: ' New@Neirah.TEST ', password: 'Secret123', role: Role.SALES });
    expect((repo.create.mock.calls[0][0] as Partial<User>).email).toBe('new@neirah.test');
  });

  it('never returns passwordHash in the created user', async () => {
    repo.exists.mockResolvedValue(false);
    const result = await service.create({
      email: 'a@neirah.test',
      password: 'Secret123',
      role: Role.MANAGER,
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.role).toBe(Role.MANAGER);
  });

  it('rejects a duplicate email with 409 Conflict', async () => {
    repo.exists.mockResolvedValue(true);
    await expect(
      service.create({ email: 'dup@neirah.test', password: 'Secret123', role: Role.SALES }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
