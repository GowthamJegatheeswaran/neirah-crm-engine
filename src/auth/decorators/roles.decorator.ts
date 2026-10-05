import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import { Role } from '../../users/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or whole controller) to the listed roles.
 * Example: @Roles(Role.ADMIN, Role.MANAGER)
 * No @Roles => any logged-in user is allowed.
 * Also documents the 403 response in Swagger, so the docs can never disagree with the guard.
 */
export const Roles = (...roles: Role[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiForbiddenResponse({
      description: `Allowed roles: ${roles.join(', ')}. Any other role gets 403.`,
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    }),
  );
