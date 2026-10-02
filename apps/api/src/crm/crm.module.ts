import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerService } from './customer.service';
import { ContractService } from './contract.service';
import { ProductionModule } from '../production/production.module';
@Module({
  imports: [ProductionModule],
  providers: [PrismaService, CustomerService, ContractService],
  exports: [CustomerService, ContractService],
})
export class CrmModule {}
