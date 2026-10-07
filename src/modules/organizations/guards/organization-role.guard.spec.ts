import { randomUUID } from 'node:crypto';
import {
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Membership } from '../../../generated/prisma/client.js';
import type { MembershipRole } from '../../../generated/prisma/enums.js';
import type { OrganizationsService } from '../organizations.service.js';
import { OrganizationRoleGuard } from './organization-role.guard.js';
import { RequireOrganizationRole } from './require-organization-role.decorator.js';

class ManagersOnly {
  @RequireOrganizationRole('MANAGER')
  handle(): void {}
}

class AnyMember {
  @RequireOrganizationRole()
  handle(): void {}
}

describe('OrganizationRoleGuard', () => {
  const userId = randomUUID();
  const organizationId = randomUUID();
  let memberships: Membership[];
  let guard: OrganizationRoleGuard;

  function contextFor(
    target: typeof ManagersOnly | typeof AnyMember,
    request: Record<string, unknown>,
  ): ExecutionContext {
    return {
      getHandler: () => target.prototype.handle,
      getClass: () => target,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function addMembership(role: MembershipRole): void {
    memberships.push({
      id: randomUUID(),
      userId,
      organizationId,
      role,
      unitLabel: null,
      createdAt: new Date(),
    });
  }

  function request(params: Record<string, string> = { organizationId }) {
    return { user: { id: userId, role: 'DRIVER' }, params };
  }

  beforeEach(() => {
    memberships = [];
    const organizations = {
      findMembership: (user: string, organization: string) =>
        Promise.resolve(
          memberships.find(
            (membership) =>
              membership.userId === user &&
              membership.organizationId === organization,
          ) ?? null,
        ),
    } as unknown as OrganizationsService;
    guard = new OrganizationRoleGuard(new Reflector(), organizations);
  });

  it('allows a member with the required role', async () => {
    addMembership('MANAGER');

    await expect(
      guard.canActivate(contextFor(ManagersOnly, request())),
    ).resolves.toBe(true);
  });

  it('forbids a member without the required role', async () => {
    addMembership('DRIVER');

    await expect(
      guard.canActivate(contextFor(ManagersOnly, request())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides organizations the user does not belong to', async () => {
    await expect(
      guard.canActivate(contextFor(ManagersOnly, request())),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('treats malformed organization ids as not found', async () => {
    addMembership('MANAGER');

    await expect(
      guard.canActivate(
        contextFor(ManagersOnly, request({ organizationId: 'not-a-uuid' })),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts any member when no role is required', async () => {
    addMembership('DRIVER');

    await expect(
      guard.canActivate(contextFor(AnyMember, request())),
    ).resolves.toBe(true);
  });

  it('requires an authenticated user', async () => {
    await expect(
      guard.canActivate(contextFor(ManagersOnly, { params: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
