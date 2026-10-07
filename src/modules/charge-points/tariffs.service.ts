import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Tariff } from '../../generated/prisma/client.js';
import { TariffResponseDto } from './dto/tariff.response.dto.js';
import type { UpdateTariffDto } from './dto/update-tariff.dto.js';
import {
  DEFAULT_TARIFF_TERMS,
  effectiveTariff,
  type TariffTerms,
} from './tariff-rules.js';

@Injectable()
export class TariffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async getForOrganization(organizationId: string): Promise<TariffResponseDto> {
    const tariff = await this.findOrganizationTariff(
      organizationId,
      this.clock.now(),
    );
    if (!tariff) {
      throw new NotFoundException('Tariff not configured');
    }
    return TariffResponseDto.fromEntity(tariff);
  }

  async updateForOrganization(
    organizationId: string,
    dto: UpdateTariffDto,
  ): Promise<TariffResponseDto> {
    const now = this.clock.now();
    const current = await this.findOrganizationTariff(organizationId, now);
    const terms: TariffTerms = {
      ...(current ? pickTerms(current) : DEFAULT_TARIFF_TERMS),
      ...definedTerms(dto),
    };
    const tariff = await this.prisma.tariff.create({
      data: { ...terms, organizationId, chargePointId: null, validFrom: now },
    });
    return TariffResponseDto.fromEntity(tariff);
  }

  async findEffective(
    organizationId: string,
    chargePointId: string,
    at: Date,
  ): Promise<Tariff | null> {
    const tariffs = await this.prisma.tariff.findMany({
      where: {
        organizationId,
        OR: [{ chargePointId }, { chargePointId: null }],
        validFrom: { lte: at },
      },
      orderBy: { validFrom: 'desc' },
    });
    return effectiveTariff(tariffs, chargePointId, at);
  }

  private findOrganizationTariff(
    organizationId: string,
    at: Date,
  ): Promise<Tariff | null> {
    return this.prisma.tariff.findFirst({
      where: { organizationId, chargePointId: null, validFrom: { lte: at } },
      orderBy: { validFrom: 'desc' },
    });
  }
}

function pickTerms(tariff: Tariff): TariffTerms {
  return {
    utilityRateCents: tariff.utilityRateCents,
    baseRateCents: tariff.baseRateCents,
    accessFeeCents: tariff.accessFeeCents,
    idleFeeCentsPerMinute: tariff.idleFeeCentsPerMinute,
    idleFeeCapCents: tariff.idleFeeCapCents,
    gracePeriodMinutes: tariff.gracePeriodMinutes,
  };
}

function definedTerms(dto: UpdateTariffDto): Partial<TariffTerms> {
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  );
}
