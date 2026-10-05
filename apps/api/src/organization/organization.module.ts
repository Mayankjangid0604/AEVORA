import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { EmployeeModule } from '../employee/employee.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { WorkforceModule } from '../workforce/workforce.module';

@Module({
  imports: [PrismaModule, AuthorizationModule, EmployeeModule, WorkforceModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
