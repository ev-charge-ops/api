import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MockChargerGateway } from './adapters/mock-charger.adapter.js';
import { SemsChargerGateway } from './adapters/sems-charger.adapter.js';
import { ChargerGateway } from './charger-gateway.port.js';

export function createChargerGateway(
  config: ConfigService<Env, true>,
): ChargerGateway {
  if (config.get('CHARGER_DRIVER', { infer: true }) === 'sems') {
    return new SemsChargerGateway();
  }
  return new MockChargerGateway(
    config.get('SIMULATION_SPEED', { infer: true }),
  );
}

@Module({
  providers: [
    {
      provide: ChargerGateway,
      inject: [ConfigService],
      useFactory: createChargerGateway,
    },
  ],
  exports: [ChargerGateway],
})
export class ChargerGatewayModule {}
