import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/role.enum';
import { RolesGuard } from './roles.guard';

function contextWith(user: { role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  it('allows any logged-in user when the route has no @Roles()', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextWith({ role: Role.SALES }))).toBe(true);
  });

  it('allows a user whose role is in the allowed list', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.MANAGER]);
    expect(guard.canActivate(contextWith({ role: Role.MANAGER }))).toBe(true);
  });

  it('blocks a sales user from an admin/manager route with 403', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.MANAGER]);
    expect(() => guard.canActivate(contextWith({ role: Role.SALES }))).toThrow(ForbiddenException);
  });

  it('blocks when there is no user on the request', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});
