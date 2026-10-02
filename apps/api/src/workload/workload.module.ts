import { Module } from '@nestjs/common';
import { WorkloadService } from './workload.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [WorkloadService, PrismaService],
  exports: [WorkloadService],
})
export class WorkloadModule {}
