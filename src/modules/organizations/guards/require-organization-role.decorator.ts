import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import type { MembershipRole } from '../../../generated/prisma/enums.js';
import {
  ORGANIZATION_ROLES_KEY,
  OrganizationRoleGuard,
} from './organization-role.guard.js';

export const RequireOrganizationRole = (...roles: MembershipRole[]) =>
  applyDecorators(
    SetMetadata(ORGANIZATION_ROLES_KEY, roles),
    UseGuards(OrganizationRoleGuard),
    ApiNotFoundResponse({
      description: 'Organization not found or user is not a member',
    }),
    ApiForbiddenResponse({
      description: 'Member without the required organization role',
    }),
  );
