import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or whole controller) to the listed roles.
 * Example: @Roles(Role.ADMIN, Role.MANAGER)
 * No @Roles => any logged-in user is allowed.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
