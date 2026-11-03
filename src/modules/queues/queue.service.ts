
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const [entries, completedMatches] = await Promise.all([
      this.prisma.queueEntry.findMany({
        where: {
          sessionId,
          status: 'WAITING',
          sessionPlayer: {
            checkedIn: true,
          },
        },
        include: {
          sessionPlayer: {
            include: {
              player: true,
            },
          },
        },
      }),

      this.prisma.match.findMany({
        where: {
          sessionId,
          status: 'COMPLETED',
        },
        select: {
          players: {
            select: {
              playerId: true,
            },
          },
        },
      }),
    ]);

    // Count completed games for each player.
    const matchCount = new Map<string, number>();

    for (const match of completedMatches) {
      for (const player of match.players) {
        matchCount.set(
          player.playerId,
          (matchCount.get(player.playerId) ?? 0) + 1,
        );
      }
    }

    // Preserve the existing fair queue priority.
    const sortedEntries = entries.sort((a, b) => {
      const aGames =
        matchCount.get(a.sessionPlayer.playerId) ?? 0;

      const bGames =
        matchCount.get(b.sessionPlayer.playerId) ?? 0;

      if (aGames !== bGames) {
        return aGames - bGames;
      }

      return a.position - b.position;
    });

    // Include games played in the API response.
    return sortedEntries.map((entry) => ({
      ...entry,
      gamesPlayed:
        matchCount.get(entry.sessionPlayer.playerId) ?? 0,
    }));
  }
}
