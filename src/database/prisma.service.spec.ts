import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: () => 'postgresql://postgres:postgres@localhost:5432/app',
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
  });

  it('disconnects when the module is destroyed', async () => {
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue();

    await prisma.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
