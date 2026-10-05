import { Module } from '@nestjs/common';
import { OutreachService } from './outreach.service';
import { OutreachController } from './outreach.controller';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [IntegrationModule],
  providers: [OutreachService],
  controllers: [OutreachController],
  exports: [OutreachService],
})
export class OutreachModule {}
