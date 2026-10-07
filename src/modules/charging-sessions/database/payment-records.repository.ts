import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';

export interface PayerProfile {
  email: string;
  name: string;
  stripeCustomerId: string | null;
}

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PaymentRecordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPayer(userId: string): Promise<PayerProfile> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, stripeCustomerId: true },
    });
  }

  async saveCustomerId(userId: string, customerId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    const event = await this.prisma.processedPaymentEvent.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    return event !== null;
  }

  async markEventProcessed(eventId: string, type: string): Promise<void> {
    try {
      await this.prisma.processedPaymentEvent.create({
        data: { id: eventId, type },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        return;
      }
      throw error;
    }
  }
}
