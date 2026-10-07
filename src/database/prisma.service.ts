import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { createPrismaAdapter } from './prisma-adapter.factory.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: createPrismaAdapter(config.get('DATABASE_URL', { infer: true })),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
