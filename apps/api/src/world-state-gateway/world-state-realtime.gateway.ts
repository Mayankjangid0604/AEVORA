import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { WorldDelta } from './contracts/world-state.contracts';

@WebSocketGateway({ namespace: '/v12/world', cors: { origin: '*' } })
export class WorldStateRealtimeGateway {
  @WebSocketServer() server!: Server;

  publish(delta: WorldDelta) {
    // Clients receive world deltas, never raw Aevora CompanyEvent records.
    this.server.to(`company:${delta.companyId}`).emit('world.delta', delta);
  }

  publishCompany(companyId: string, delta: WorldDelta) {
    this.server.to(`company:${companyId}`).emit('world.delta', delta);
  }
}
