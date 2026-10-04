import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Subject } from 'rxjs';

export interface DatabaseEvent {
  model: string;
  action: string;
  data: any;
}

@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {

  public readonly databaseEvents = new Subject<DatabaseEvent>();

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
    });

    this.$use(async (params, next) => {
      const result = await next(params);
      if (params.model && (params.action === 'create' || params.action === 'update' || params.action === 'delete')) {
        this.databaseEvents.next({
          model: params.model,
          action: params.action,
          data: result,
        });
      }
      return result;
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
