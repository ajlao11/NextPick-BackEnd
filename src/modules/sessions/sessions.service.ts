import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateSessionDto) {
    return this.prisma.session.create({
      data: {
        name: dto.name,
        date: new Date(dto.date),
        startTime: dto.startTime,
        endTime: dto.endTime,
        courtCount: dto.courtCount,
        maxPlayers: dto.maxPlayers ?? null,
      },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.session.findUnique({
      where: {
        id,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  async findAll() {
    return this.prisma.session.findMany({
      orderBy: {
        date: 'desc',
      },
    });
  }

  async completeSession(sessionId: string) {
    const session =
      await this.prisma.session.findUnique({
        where: {
          id: sessionId,
        },
      });

    if (!session) {
      throw new NotFoundException(
        'Session not found',
      );
    }

    if (session.status === 'COMPLETED') {
      throw new BadRequestException(
        'Session is already completed',
      );
    }

    const liveMatches =
      await this.prisma.match.count({
        where: {
          sessionId,
          status: 'LIVE',
        },
      });

    if (liveMatches > 0) {
      throw new BadRequestException(
        'Cannot end session while matches are still live',
      );
    }

    return this.prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        status: 'COMPLETED',
      },
    });
  }

  async getResults(sessionId: string) {
    const session =
      await this.prisma.session.findUnique({
        where: {
          id: sessionId,
        },
        include: {
          courts: {
            orderBy: {
              number: 'asc',
            },
          },
          players: {
            include: {
              player: true,
            },
          },
          matches: {
            where: {
              status: 'COMPLETED',
            },
            orderBy: [
              {
                round: 'desc',
              },
              {
                createdAt: 'desc',
              },
            ],
            include: {
              court: true,

              players: {
                orderBy: [
                  {
                    team: 'asc',
                  },
                  {
                    position: 'asc',
                  },
                ],
                include: {
                  player: true,
                },
              },
            },
          },
        },
      });

    if (!session) {
      throw new NotFoundException(
        'Session not found',
      );
    }

    // --------------------------------------------------
    // Session statistics
    // --------------------------------------------------

    const totalPlayers =
      session.players.length;

    const completedMatches =
      session.matches;

    const totalGames =
      completedMatches.length;

    const totalRounds =
      new Set(
        completedMatches.map(
          (match) => match.round,
        ),
      ).size;

    // --------------------------------------------------
    // Build player statistics
    // --------------------------------------------------

    type PlayerStanding = {
      playerId: string;
      playerName: string;
      gamesPlayed: number;
      wins: number;
      losses: number;
      pointsFor: number;
      pointsAgainst: number;
      pointDifferential: number;
      winPercentage: number;
    };

    const standings =
      new Map<
        string,
        PlayerStanding
      >();

    // Initialize every session player
    // so players with zero completed
    // games still appear in results.
    for (const sessionPlayer of session.players) {
      standings.set(
        sessionPlayer.playerId,
        {
          playerId:
            sessionPlayer.playerId,

          playerName:
            sessionPlayer.player.name,

          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDifferential: 0,
          winPercentage: 0,
        },
      );
    }

    // --------------------------------------------------
    // Calculate statistics from matches
    // --------------------------------------------------

    for (const match of completedMatches) {
      const team1Score =
        match.team1Score ?? 0;

      const team2Score =
        match.team2Score ?? 0;

      const team1Won =
        match.winningTeam === 1;

      const team2Won =
        match.winningTeam === 2;

      const team1Players =
        match.players.filter(
          (player) =>
            player.team === 1,
        );

      const team2Players =
        match.players.filter(
          (player) =>
            player.team === 2,
        );

      // Team 1
      for (const matchPlayer of team1Players) {
        const standing =
          standings.get(
            matchPlayer.playerId,
          );

        if (!standing) {
          continue;
        }

        standing.gamesPlayed += 1;

        standing.pointsFor +=
          team1Score;

        standing.pointsAgainst +=
          team2Score;

        if (team1Won) {
          standing.wins += 1;
        } else if (team2Won) {
          standing.losses += 1;
        }
      }

      // Team 2
      for (const matchPlayer of team2Players) {
        const standing =
          standings.get(
            matchPlayer.playerId,
          );

        if (!standing) {
          continue;
        }

        standing.gamesPlayed += 1;

        standing.pointsFor +=
          team2Score;

        standing.pointsAgainst +=
          team1Score;

        if (team2Won) {
          standing.wins += 1;
        } else if (team1Won) {
          standing.losses += 1;
        }
      }
    }

    // --------------------------------------------------
    // Calculate differential + win percentage
    // --------------------------------------------------

    for (const standing of standings.values()) {
      standing.pointDifferential =
        standing.pointsFor -
        standing.pointsAgainst;

      standing.winPercentage =
        standing.gamesPlayed > 0
          ? Number(
            (
              standing.wins /
              standing.gamesPlayed
            ).toFixed(3),
          )
          : 0;
    }

    // --------------------------------------------------
    // Sort standings
    //
    // 1. Wins
    // 2. Point differential
    // 3. Points for
    // --------------------------------------------------

    const sortedStandings =
      Array.from(
        standings.values(),
      ).sort((a, b) => {
        if (
          a.wins !== b.wins
        ) {
          return (
            b.wins -
            a.wins
          );
        }

        if (
          a.pointDifferential !==
          b.pointDifferential
        ) {
          return (
            b.pointDifferential -
            a.pointDifferential
          );
        }

        if (
          a.pointsFor !==
          b.pointsFor
        ) {
          return (
            b.pointsFor -
            a.pointsFor
          );
        }

        return a.playerName.localeCompare(
          b.playerName,
        );
      });

    // --------------------------------------------------
    // Add ranking
    // --------------------------------------------------

    const rankedStandings =
      sortedStandings.map(
        (standing, index) => ({
          rank: index + 1,
          ...standing,
        }),
      );

    // --------------------------------------------------
    // Format match logs
    // --------------------------------------------------

    const matchLogs =
      completedMatches.map(
        (match) => ({
          id: match.id,
          round: match.round,

          court: match.court
            ? {
              id: match.court.id,
              number:
                match.court
                  .number,
              name:
                match.court
                  .name,
            }
            : null,

          team1: match.players
            .filter(
              (player) =>
                player.team ===
                1,
            )
            .map(
              (player) => ({
                playerId:
                  player.playerId,
                name:
                  player.player
                    .name,
              }),
            ),

          team2: match.players
            .filter(
              (player) =>
                player.team ===
                2,
            )
            .map(
              (player) => ({
                playerId:
                  player.playerId,
                name:
                  player.player
                    .name,
              }),
            ),

          team1Score:
            match.team1Score,

          team2Score:
            match.team2Score,

          winningTeam:
            match.winningTeam,

          startedAt:
            match.startedAt,

          completedAt:
            match.completedAt,
        }),
      );

    return {
      session: {
        id: session.id,
        name: session.name,
        date: session.date,
        startTime:
          session.startTime,
        endTime:
          session.endTime,
        gameFormat:
          session.gameFormat,
        matchingStyle:
          session.matchingStyle,
        status: session.status,
      },

      summary: {
        totalPlayers,
        totalGames,
        totalRounds,
        totalCourts:
          session.courts.length,
      },

      standings:
        rankedStandings,

      matchLogs,
    };
  }
}