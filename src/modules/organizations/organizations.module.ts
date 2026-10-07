import { Module } from '@nestjs/common';
import { OrganizationRoleGuard } from './guards/organization-role.guard.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationRoleGuard],
  exports: [OrganizationsService, OrganizationRoleGuard],
})
export class OrganizationsModule {}
