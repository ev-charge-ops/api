import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Membership } from '../../generated/prisma/client.js';
import { MyOrganizationDto } from './dto/my-organization.dto.js';
import { OrganizationMemberDto } from './dto/organization-member.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  findMembership(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    return this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
  }

  async listForUser(userId: string): Promise<MyOrganizationDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { organization: { name: 'asc' } },
    });
    return memberships.map((membership) =>
      MyOrganizationDto.fromMembership(membership),
    );
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
    });
    return memberships.map((membership) =>
      OrganizationMemberDto.fromMembership(membership),
    );
  }
}
