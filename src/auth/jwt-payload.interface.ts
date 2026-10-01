import { Role } from '../users/role.enum';

/** What we store inside the JWT. Keep it small: id, email, role. Never put passwords here. */
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}

/** What request.user contains after the token is verified. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}
