import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { MembershipRole } from '../../../generated/prisma/enums.js';
import { OrganizationsService } from '../organizations.service.js';

export const ORGANIZATION_ROLES_KEY = 'organizationRoles';
export const ORGANIZATION_ID_PARAM = 'organizationId';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrganizationRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly organizations: OrganizationsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles =
      this.reflector.getAllAndOverride<MembershipRole[] | undefined>(
        ORGANIZATION_ROLES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new UnauthorizedException();
    }

    const organizationId = request.params[ORGANIZATION_ID_PARAM];
    const membership =
      typeof organizationId === 'string' && UUID_PATTERN.test(organizationId)
        ? await this.organizations.findMembership(
            request.user.id,
            organizationId,
          )
        : null;
    if (!membership) {
      throw new NotFoundException('Organization not found');
    }
    if (roles.length > 0 && !roles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role in this organization');
    }
    return true;
  }
}
