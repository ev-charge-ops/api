import { Module } from '@nestjs/common';
import { DemandFactorProvider } from './demand-factor/demand-factor.provider.js';
import { RuleDemandFactorProvider } from './demand-factor/rule-demand-factor.provider.js';

@Module({
  providers: [
    { provide: DemandFactorProvider, useClass: RuleDemandFactorProvider },
  ],
  exports: [DemandFactorProvider],
})
export class IntelligenceModule {}
