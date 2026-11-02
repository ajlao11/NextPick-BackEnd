import { Injectable } from '@nestjs/common';
import {
  GeneratedMatch, MatchingGameFormat, MatchingPlayer,
  MatchingStrategy, PreviousMatch,
} from './matching-strategy.interface';

type History = Map<string, Map<string, number>>;

@Injectable()
export class RandomRoundRobinStrategy implements MatchingStrategy {

  generateMatches(
    players: MatchingPlayer[],
    gameFormat: MatchingGameFormat,
    previousMatches: PreviousMatch[],
  ): GeneratedMatch[] {
    const size = gameFormat === 'SINGLES' ? 2 : 4;

    if (players.length < size) {
      return [];
    }

    const partner = this.history(previousMatches, true);
    const opponent = this.history(previousMatches, false);

    const completeCount =
      Math.floor(players.length / size) * size;

    // IMPORTANT:
    // Players are already sorted by queue priority
    // in MatchingService.
    // Do not shuffle the entire player pool.
    const selected = players.slice(0, completeCount);

    const matches: GeneratedMatch[] = [];

    // Preserve player grouping by queue order.
    for (let i = 0; i < selected.length; i += size) {
      const group = selected.slice(i, i + size);

      if (gameFormat === 'SINGLES') {
        matches.push({
          team1: { players: [group[0]] },
          team2: { players: [group[1]] },
        });

        continue;
      }

      // Generate all three doubles team combinations.
      const arrangements = this.doublesArrangements(group);

      // Randomize the order so equally scored
      // arrangements don't always pick the same one.
      const randomized = this.shuffle(arrangements);

      let bestMatch = randomized[0];
      let bestScore = Infinity;

      for (const arrangement of randomized) {
        const score = this.score(
          arrangement,
          partner,
          opponent,
        );

        if (score < bestScore) {
          bestScore = score;
          bestMatch = arrangement;
        }
      }

      matches.push(bestMatch);
    }

    return matches;
  }


  private doublesArrangements(p: MatchingPlayer[]): GeneratedMatch[] {
    const [a, b, c, d] = p;
    return [
      { team1: { players: [a, b] }, team2: { players: [c, d] } },
      { team1: { players: [a, c] }, team2: { players: [b, d] } },
      { team1: { players: [a, d] }, team2: { players: [b, c] } },
    ];
  }

  private score(match: GeneratedMatch, partner: History, opponent: History): number {
    const a = match.team1.players;
    const b = match.team2.players;
    let score = 0;
    if (a.length === 2) score += 100 * this.count(partner, a[0].playerId, a[1].playerId);
    if (b.length === 2) score += 100 * this.count(partner, b[0].playerId, b[1].playerId);
    for (const x of a) for (const y of b) {
      score += 10 * this.count(opponent, x.playerId, y.playerId);
    }
    return score;
  }

  private count(history: History, a: string, b: string): number {
    return history.get(a)?.get(b) ?? 0;
  }

  private add(history: History, a: string, b: string): void {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!history.has(x)) history.set(x, new Map());
      const counts = history.get(x)!;
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
  }

  private history(matches: PreviousMatch[], teammates: boolean): History {
    const result: History = new Map();
    for (const match of matches) {
      const groups = new Map<number, string[]>();
      for (const p of match.players) {
        const group = groups.get(p.team) ?? [];
        group.push(p.playerId);
        groups.set(p.team, group);
      }
      if (teammates) {
        for (const group of groups.values()) {
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) this.add(result, group[i], group[j]);
          }
        }
      } else {
        const a = groups.get(1) ?? [];
        const b = groups.get(2) ?? [];
        for (const x of a) for (const y of b) this.add(result, x, y);
      }
    }
    return result;
  }

  private shuffle<T>(values: T[]): T[] {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
