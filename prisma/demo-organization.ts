import type { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  MembershipRole,
  OrganizationType,
} from '../src/generated/prisma/enums.js';

export const DEMO_ORGANIZATION_ID = '7d3f6c2e-9b1a-4c5e-8f2d-1a6b3c9e4d70';

export interface DemoMember {
  email: string;
  role: MembershipRole;
  unitLabel: string | null;
}

export interface DemoOrganization {
  id: string;
  name: string;
  type: OrganizationType;
  members: DemoMember[];
}

export function buildDemoOrganization(emails: {
  managerEmail: string;
  driverEmail: string;
}): DemoOrganization {
  return {
    id: DEMO_ORGANIZATION_ID,
    name: 'Residencial Aclimação',
    type: 'PRIVATE',
    members: [
      { email: emails.managerEmail, role: 'MANAGER', unitLabel: null },
      { email: emails.driverEmail, role: 'DRIVER', unitLabel: 'B · 42' },
    ],
  };
}

export async function upsertDemoOrganization(
  prisma: Pick<PrismaClient, 'organization' | 'membership' | 'user'>,
  organization: DemoOrganization,
): Promise<void> {
  const data = { name: organization.name, type: organization.type };
  await prisma.organization.upsert({
    where: { id: organization.id },
    update: data,
    create: { ...data, id: organization.id },
  });

  for (const member of organization.members) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: member.email },
    });
    const membership = { role: member.role, unitLabel: member.unitLabel };
    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      update: membership,
      create: {
        ...membership,
        userId: user.id,
        organizationId: organization.id,
      },
    });
  }
}
