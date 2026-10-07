import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Notification } from '../../../generated/prisma/client.js';
import type { PushPlatform } from '../../../generated/prisma/enums.js';
import {
  type NewNotification,
  type NotificationData,
  type NotificationPage,
  type NotificationRecord,
  NotificationsRepository,
  type PushTokenRecord,
} from './notifications.repository.port.js';

const TOKEN_SELECT = {
  token: true,
  platform: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toRecord(notification: Notification): NotificationRecord {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data as NotificationData,
    dedupeKey: notification.dedupeKey,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

@Injectable()
export class NotificationsPrismaRepository extends NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    notification: NewNotification,
    at: Date,
  ): Promise<NotificationRecord | null> {
    const [created] = await this.prisma.notification.createManyAndReturn({
      data: [{ ...notification, createdAt: at }],
      skipDuplicates: true,
    });
    return created ? toRecord(created) : null;
  }

  async listByUser(
    userId: string,
    page: { skip: number; take: number },
  ): Promise<NotificationPage> {
    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items: items.map(toRecord), total, unreadCount };
  }

  async markRead(
    userId: string,
    id: string,
    at: Date,
  ): Promise<NotificationRecord | null> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: at },
    });
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    return notification ? toRecord(notification) : null;
  }

  async markAllRead(userId: string, at: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: at },
    });
    return count;
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async tokensOf(userId: string): Promise<string[]> {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
      orderBy: { createdAt: 'asc' },
    });
    return tokens.map((item) => item.token);
  }

  saveToken(
    userId: string,
    token: string,
    platform: PushPlatform,
  ): Promise<PushTokenRecord> {
    return this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
      select: TOKEN_SELECT,
    });
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  async removeTokens(tokens: string[]): Promise<void> {
    await this.prisma.pushToken.deleteMany({
      where: { token: { in: tokens } },
    });
  }
}
