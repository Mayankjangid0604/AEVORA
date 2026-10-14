import { Module, forwardRef } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SpatialModule } from '../spatial/spatial.module';

@Module({
  imports: [AuthorizationModule, forwardRef(() => SpatialModule)],
  controllers: [EmployeeController],
  providers: [EmployeeService, PrismaService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
