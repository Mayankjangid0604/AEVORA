import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { chairmanMailer } from '../notifications/chairman-mailer';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedClients = new Map<string, { deviceId?: string; userId?: string }>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** Clients must send `auth: { token }` (the API JWT); unauthenticated sockets are dropped. */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ?? client.handshake.headers.authorization?.replace(/^Bearer /, '');
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
      client.data.userId = payload.actorId;
      client.join(`user:${payload.actorId}`);
      this.connectedClients.set(client.id, { userId: payload.actorId });
      this.logger.log(`Client connected: ${client.id} (user ${payload.actorId})`);
    } catch (e: any) {
      this.logger.warn(`Rejected unauthenticated socket ${client.id}: ${e.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('device:identify')
  async handleIdentify(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deviceId: string },
  ) {
    const userId = client.data.userId; // from the verified JWT, never from the message
    if (!userId) return { status: 'unauthenticated' };
    const deviceId = typeof data?.deviceId === 'string' ? data.deviceId : '';
    const device = deviceId
      ? await this.prisma.connectedDevice.findUnique({ where: { id: deviceId }, select: { userId: true } })
      : null;
    if (!device || device.userId !== userId) {
      this.logger.warn(`Rejected device:identify for ${deviceId || '(none)'} from user ${userId}: not owned`);
      return { status: 'forbidden' };
    }
    this.connectedClients.set(client.id, { deviceId: data.deviceId, userId });
    client.join(`device:${data.deviceId}`);
    this.logger.log(`Device ${data.deviceId} identified for user ${userId}`);
    return { status: 'identified' };
  }

  /** Only the Chairman receives user broadcasts; important ones are also emailed (see EMAIL_EVENTS). */
  broadcastToUser(userId: string, event: string, data: any) {
    this.server?.to(`user:${userId}`).emit(event, data);
    chairmanMailer.notifyEvent(event, data, userId);
  }

  broadcastToDevice(deviceId: string, event: string, data: any) {
    this.server.to(`device:${deviceId}`).emit(event, data);
  }

  broadcastAll(event: string, data: any) {
    this.server.emit(event, data);
  }
}
