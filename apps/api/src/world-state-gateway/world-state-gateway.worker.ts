import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WorldStateGatewayService } from './world-state-gateway.service';
import { WorldStateRealtimeGateway } from './world-state-realtime.gateway';

@Injectable()
export class WorldStateGatewayWorker {
  private readonly logger = new Logger(WorldStateGatewayWorker.name);
  constructor(private readonly gateway: WorldStateGatewayService, private readonly realtime: WorldStateRealtimeGateway) {}

  @Cron('*/1 * * * * *')
  async consume() {
    try {
      const companies = await this.gateway.listCompanyIds();
      for (const companyId of companies) {
        const deltas = await this.gateway.consumeAuthoritativeEvents(companyId, 100);
        for (const delta of deltas) this.realtime.publish(delta);
      }
    } catch (error: any) {
      this.logger.error(`World-State propagation failed: ${error?.message ?? error}`);
    }
  }
}
