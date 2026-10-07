import type {
  NotificationType,
  PushPlatform,
} from '../../../generated/prisma/enums.js';

export type NotificationData = Record<string, string | number | boolean | null>;

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
  dedupeKey: string | null;
}

export interface NotificationRecord extends NewNotification {
  id: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPage {
  items: NotificationRecord[];
  total: number;
  unreadCount: number;
}

export interface PushTokenRecord {
  token: string;
  platform: PushPlatform;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class NotificationsRepository {
  abstract create(
    notification: NewNotification,
    at: Date,
  ): Promise<NotificationRecord | null>;

  abstract listByUser(
    userId: string,
    page: { skip: number; take: number },
  ): Promise<NotificationPage>;

  abstract markRead(
    userId: string,
    id: string,
    at: Date,
  ): Promise<NotificationRecord | null>;

  abstract markAllRead(userId: string, at: Date): Promise<number>;

  abstract unreadCount(userId: string): Promise<number>;

  abstract tokensOf(userId: string): Promise<string[]>;

  abstract saveToken(
    userId: string,
    token: string,
    platform: PushPlatform,
  ): Promise<PushTokenRecord>;

  abstract removeToken(userId: string, token: string): Promise<void>;

  abstract removeTokens(tokens: string[]): Promise<void>;
}
