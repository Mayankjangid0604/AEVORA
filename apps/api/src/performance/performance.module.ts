import { Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [PerformanceService, PrismaService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
