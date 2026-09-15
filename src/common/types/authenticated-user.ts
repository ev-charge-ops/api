import type { Role } from '../../generated/prisma/enums.js';

export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}
