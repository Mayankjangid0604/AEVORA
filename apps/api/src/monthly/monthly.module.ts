import { Module } from '@nestjs/common';
import { MonthlyService } from './monthly.service';

@Module({ providers: [MonthlyService], exports: [MonthlyService] })
export class MonthlyModule {}
