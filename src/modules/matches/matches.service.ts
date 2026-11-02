import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MatchesService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findAll(sessionId: string) {
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

        return this.prisma.match.findMany({
            where: {
                sessionId,
            },
            orderBy: [
                {
                    round: 'asc',
                },
                {
                    createdAt: 'asc',
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
        });
    }

    async start(matchId: string) {
        const match = await this.prisma.match.findUnique({
            where: {
                id: matchId,
            },
            include: {
                players: true,
                session: {
                    select: {
                        gameFormat: true,
                    },
                },
            },
        });

        if (!match) {
            throw new NotFoundException(
                'Match not found',
            );
        }

        if (match.status !== 'PENDING') {
            throw new BadRequestException(
                'Only pending matches can be started',
            );
        }

        if (!match.courtId) {
            throw new BadRequestException(
                'Match does not have a court assigned',
            );
        }

        // Validate required players
        const playersPerTeam =
            match.session.gameFormat === 'SINGLES' ? 1 : 2;

        const team1Count = match.players.filter(
            (player) => player.team === 1,
        ).length;

        const team2Count = match.players.filter(
            (player) => player.team === 2,
        ).length;

        if (
            team1Count !== playersPerTeam ||
            team2Count !== playersPerTeam
        ) {
            throw new BadRequestException(
                `Both teams must have ${playersPerTeam} player(s) before starting`,
            );
        }

        return this.prisma.$transaction(async (tx) => {
            // Verify that the assigned court is reserved.
            const court = await tx.court.findFirst({
                where: {
                    id: match.courtId!,
                    sessionId: match.sessionId,
                },
            });

            if (!court) {
                throw new NotFoundException(
                    'Court not found',
                );
            }

            if (court.status !== 'PLAYING') {
                throw new BadRequestException(
                    'Court is not reserved for this match',
                );
            }

            // Ensure no other active match uses the court.
            const conflictingMatch = await tx.match.findFirst({
                where: {
                    courtId: match.courtId!,
                    id: {
                        not: matchId,
                    },
                    status: {
                        in: ['PENDING', 'LIVE'],
                    },
                },
            });

            if (conflictingMatch) {
                throw new BadRequestException(
                    'Court is assigned to another active match',
                );
            }

            // Ensure all assigned players are reserved.
            const playerIds = match.players.map(
                (player) => player.playerId,
            );

            const reservedPlayers = await tx.queueEntry.count({
                where: {
                    sessionId: match.sessionId,
                    status: 'PLAYING',
                    sessionPlayer: {
                        checkedIn: true,
                        playerId: {
                            in: playerIds,
                        },
                    },
                },
            });

            if (reservedPlayers !== match.players.length) {
                throw new BadRequestException(
                    'Not all match players are reserved',
                );
            }

            // Start the pending match.
            const updated = await tx.match.updateMany({
                where: {
                    id: matchId,
                    status: 'PENDING',
                },
                data: {
                    status: 'LIVE',
                    startedAt: new Date(),
                },
            });

            if (updated.count !== 1) {
                throw new BadRequestException(
                    'Match is no longer pending',
                );
            }

            return tx.match.findUniqueOrThrow({
                where: {
                    id: matchId,
                },
                include: {
                    court: true,
                    players: {
                        orderBy: [
                            { team: 'asc' },
                            { position: 'asc' },
                        ],
                        include: {
                            player: true,
                        },
                    },
                },
            });
        });
    }

    async complete(
        matchId: string,
        team1Score: number,
        team2Score: number,
        winningTeam?: number,
    ) {
        const match = await this.prisma.match.findUnique({
            where: {
                id: matchId,
            },
            include: {
                players: true,
            },
        });

        if (!match) {
            throw new NotFoundException('Match not found');
        }

        if (match.status !== 'LIVE') {
            throw new BadRequestException(
                'Only live matches can be completed',
            );
        }

        if (team1Score === team2Score) {
            throw new BadRequestException(
                'A completed match cannot have a tie',
            );
        }

        const calculatedWinner =
            team1Score > team2Score ? 1 : 2;

        if (
            winningTeam !== undefined &&
            winningTeam !== calculatedWinner
        ) {
            throw new BadRequestException(
                'Winning team does not match the score',
            );
        }

        return this.prisma.$transaction(
            async (tx) => {
                const updatedMatch =
                    await tx.match.update({
                        where: {
                            id: matchId,
                        },
                        data: {
                            status: 'COMPLETED',
                            team1Score,
                            team2Score,
                            winningTeam: calculatedWinner,
                            completedAt: new Date(),
                        },
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
                    });

                // Return players to the waiting queue
                await tx.queueEntry.updateMany({
                    where: {
                        sessionId: match.sessionId,
                        sessionPlayer: {
                            playerId: {
                                in: match.players.map(
                                    (player) => player.playerId,
                                ),
                            },
                        },
                        status: 'PLAYING',
                    },
                    data: {
                        status: 'WAITING',
                    },
                });

                // Free the court
                if (match.courtId) {
                    await tx.court.update({
                        where: {
                            id: match.courtId,
                        },
                        data: {
                            status: 'AVAILABLE',
                        },
                    });
                }

                return updatedMatch;
            },
        );
    }

    async removePlayer(
        matchId: string,
        matchPlayerId: string,
    ) {
        const match =
            await this.prisma.match.findUnique({
                where: {
                    id: matchId,
                },
                include: {
                    players: true,
                },
            });

        if (!match) {
            throw new NotFoundException(
                'Match not found',
            );
        }

        if (match.status !== 'PENDING') {
            throw new BadRequestException(
                'Players can only be changed before the match starts',
            );
        }

        const matchPlayer =
            match.players.find(
                (player) =>
                    player.id === matchPlayerId,
            );

        if (!matchPlayer) {
            throw new NotFoundException(
                'Player is not part of this match',
            );
        }

        return this.prisma.$transaction(
            async (tx) => {
                await tx.matchPlayer.delete({
                    where: {
                        id: matchPlayerId,
                    },
                });

                await tx.queueEntry.updateMany({
                    where: {
                        sessionId: match.sessionId,
                        sessionPlayer: {
                            playerId:
                                matchPlayer.playerId,
                        },
                    },
                    data: {
                        status: 'WAITING',
                    },
                });

                return tx.match.findUnique({
                    where: {
                        id: matchId,
                    },
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
                });
            },
        );
    }

    async addPlayer(
        matchId: string,
        playerId: string,
        team: number,
        position: number,
    ) {
        const match =
            await this.prisma.match.findUnique({
                where: {
                    id: matchId,
                },
                include: {
                    players: true,
                },
            });

        if (!match) {
            throw new NotFoundException(
                'Match not found',
            );
        }

        if (match.status !== 'PENDING') {
            throw new BadRequestException(
                'Players can only be changed before the match starts',
            );
        }

        if (![1, 2].includes(team)) {
            throw new BadRequestException(
                'Invalid team',
            );
        }

        if (position < 1) {
            throw new BadRequestException(
                'Invalid position',
            );
        }

        const existingSlot =
            match.players.find(
                (player) =>
                    player.team === team &&
                    player.position === position,
            );

        if (existingSlot) {
            throw new BadRequestException(
                'This player slot is already occupied',
            );
        }

        const alreadyInMatch =
            match.players.some(
                (player) =>
                    player.playerId === playerId,
            );

        if (alreadyInMatch) {
            throw new BadRequestException(
                'Player is already in this match',
            );
        }

        const sessionPlayer =
            await this.prisma.sessionPlayer.findUnique({
                where: {
                    sessionId_playerId: {
                        sessionId: match.sessionId,
                        playerId,
                    },
                },
            });

        if (!sessionPlayer) {
            throw new BadRequestException(
                'Player is not registered for this session',
            );
        }

        if (!sessionPlayer.checkedIn) {
            throw new BadRequestException(
                'Player is not checked in',
            );
        }

        const queueEntry =
            await this.prisma.queueEntry.findUnique({
                where: {
                    sessionPlayerId:
                        sessionPlayer.id,
                },
            });

        if (!queueEntry) {
            throw new BadRequestException(
                'Player is not in the queue',
            );
        }

        if (queueEntry.status !== 'WAITING') {
            throw new BadRequestException(
                'Player is not available',
            );
        }

        return this.prisma.$transaction(
            async (tx) => {
                await tx.matchPlayer.create({
                    data: {
                        matchId,
                        playerId,
                        team,
                        position,
                    },
                });

                await tx.queueEntry.update({
                    where: {
                        id: queueEntry.id,
                    },
                    data: {
                        status: 'PLAYING',
                    },
                });

                return tx.match.findUnique({
                    where: {
                        id: matchId,
                    },
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
                });
            },
        );
    }
}