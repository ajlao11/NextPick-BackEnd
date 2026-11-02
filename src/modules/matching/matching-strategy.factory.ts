import { Injectable } from '@nestjs/common';

import { RandomRoundRobinStrategy } from './strategies/random-round-robin.strategy';
import { MatchingStrategy } from './strategies/matching-strategy.interface';

export type MatchingStyle =
  | 'RANDOM_ROUND_ROBIN'
  | 'WINNERS_LOSERS'
  | 'KING_OF_THE_COURT'
  | 'WINNER_STAYS'
  | 'BALANCED_SKILL';

@Injectable()
export class MatchingStrategyFactory {
  constructor(
    private readonly randomRoundRobinStrategy: RandomRoundRobinStrategy,
  ) {}

  getStrategy(
    matchingStyle: MatchingStyle,
  ): MatchingStrategy {
    switch (matchingStyle) {
      case 'RANDOM_ROUND_ROBIN':
        return this.randomRoundRobinStrategy;

      default:
        throw new Error(
          `Matching style "${matchingStyle}" is not implemented yet`,
        );
    }
  }
}