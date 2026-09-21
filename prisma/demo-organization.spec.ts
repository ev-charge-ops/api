import {
  buildDemoOrganization,
  DEMO_ORGANIZATION_ID,
  upsertDemoOrganization,
} from './demo-organization.js';

describe('upsertDemoOrganization', () => {
  it('upserts the demo organization with the manager and the driver', async () => {
    const organizationUpsert = vi.fn().mockResolvedValue({});
    const membershipUpsert = vi.fn().mockResolvedValue({});
    const findUniqueOrThrow = vi.fn(({ where }: { where: { email: string } }) =>
      Promise.resolve({ id: `id-of-${where.email}` }),
    );
    const organization = buildDemoOrganization({
      managerEmail: 'manager@evchargeops.dev',
      driverEmail: 'driver@evchargeops.dev',
    });

    await upsertDemoOrganization(
      {
        organization: { upsert: organizationUpsert },
        membership: { upsert: membershipUpsert },
        user: { findUniqueOrThrow },
      } as never,
      organization,
    );

    expect(organizationUpsert).toHaveBeenCalledWith({
      where: { id: DEMO_ORGANIZATION_ID },
      update: { name: 'Residencial Aclimação', type: 'PRIVATE' },
      create: {
        id: DEMO_ORGANIZATION_ID,
        name: 'Residencial Aclimação',
        type: 'PRIVATE',
      },
    });
    const [managerCall, driverCall] = membershipUpsert.mock.calls.map(
      ([args]) => args,
    );
    expect(managerCall.where).toEqual({
      userId_organizationId: {
        userId: 'id-of-manager@evchargeops.dev',
        organizationId: DEMO_ORGANIZATION_ID,
      },
    });
    expect(managerCall.create).toMatchObject({
      role: 'MANAGER',
      unitLabel: null,
    });
    expect(driverCall.create).toMatchObject({
      userId: 'id-of-driver@evchargeops.dev',
      role: 'DRIVER',
      unitLabel: 'B · 42',
    });
    expect(driverCall.update).toEqual({ role: 'DRIVER', unitLabel: 'B · 42' });
  });
});
