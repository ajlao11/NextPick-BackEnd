import { Module } from '@nestjs/common';

import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MatchingStrategyFactory } from './matching-strategy.factory';

import { RandomRoundRobinStrategy } from './strategies/random-round-robin.strategy';

@Module({
  controllers: [
    MatchingController,
  ],

  providers: [
    MatchingService,
    MatchingStrategyFactory,
    RandomRoundRobinStrategy,
  ],
})
export class MatchingModule {}