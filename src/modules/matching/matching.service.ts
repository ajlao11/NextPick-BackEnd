import {
    BadRequestException,
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingStrategyFactory } from './matching-strategy.factory';

@Injectable()
export class MatchingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly matchingStrategyFactory: MatchingStrategyFactory,
    ) { }

    async generateRound(sessionId: string) {
        // --------------------------------------------------
        // 1. Get session
        // --------------------------------------------------

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

        // --------------------------------------------------
        // 2. Get available courts
        // --------------------------------------------------

        const availableCourts =
            await this.prisma.court.findMany({
                where: {
                    sessionId,
                    status: 'AVAILABLE',
                },
                orderBy: {
                    number: 'asc',
                },
            });

        if (availableCourts.length === 0) {
            throw new BadRequestException(
                'No available courts',
            );
        }

        // --------------------------------------------------
        // 3. Get previous matches
        // --------------------------------------------------

        const previousMatches =
            await this.prisma.match.findMany({
                where: {
                    sessionId,
                    status: 'COMPLETED', // Adjust to your actual completed status enum.
                },
                include: {
                    players: {
                        select: {
                            playerId: true,
                            team: true,
                        },
                    },
                },
            });

        // --------------------------------------------------
        // 4. Get waiting players
        // --------------------------------------------------

        const players = await this.prisma.sessionPlayer.findMany({
            where: {
                sessionId,
                checkedIn: true,
                queueEntry: {
                    is: {
                        status: 'WAITING',
                    },
                },
            },
            include: {
                player: true,
                queueEntry: true,
            },
        });

        // --------------------------------------------------
        // 5. Determine players required per match
        // --------------------------------------------------

        const playersPerMatch =
            session.gameFormat === 'SINGLES'
                ? 2
                : 4;

        const maxPlayers =
            availableCourts.length *
            playersPerMatch;

        // --------------------------------------------------
        // 6. Count previous matches per player
        // --------------------------------------------------

        const matchCount =
            new Map<string, number>();

        for (const match of previousMatches) {
            for (const matchPlayer of match.players) {
                const currentCount =
                    matchCount.get(
                        matchPlayer.playerId,
                    ) ?? 0;

                matchCount.set(
                    matchPlayer.playerId,
                    currentCount + 1,
                );
            }
        }

        // --------------------------------------------------
        // 7. Sort waiting players by match count
        //
        // Players with fewer games played
        // get priority.
        //
        // If they have the same number of games,
        // use their session registration time.
        // --------------------------------------------------

        players.sort((a, b) => {
            const aMatchCount = matchCount.get(a.playerId) ?? 0;
            const bMatchCount = matchCount.get(b.playerId) ?? 0;

            // Priority 1: Fewer games played
            if (aMatchCount !== bMatchCount) {
                return aMatchCount - bMatchCount;
            }

            // Priority 2: Check-in queue position
            const aPosition =
                a.queueEntry?.position ?? Number.MAX_SAFE_INTEGER;

            const bPosition =
                b.queueEntry?.position ?? Number.MAX_SAFE_INTEGER;

            if (aPosition !== bPosition) {
                return aPosition - bPosition;
            }

            // Fallback: Registration order
            return a.createdAt.getTime() - b.createdAt.getTime();
        });

        // --------------------------------------------------
        // 8. Select players for this round
        // --------------------------------------------------

        const selectedCount = Math.floor(
            Math.min(players.length, maxPlayers) / playersPerMatch,
        ) * playersPerMatch;

        const eligiblePlayers = players.slice(0, selectedCount);
        
        if (
            eligiblePlayers.length <
            playersPerMatch
        ) {
            throw new BadRequestException(
                `Not enough players for a ${session.gameFormat.toLowerCase()} match`,
            );
        }

        // --------------------------------------------------
        // 9. Generate matches using selected strategy
        // --------------------------------------------------

        const strategy =
            this.matchingStrategyFactory.getStrategy(
                session.matchingStyle,
            );

        const generatedMatches =
            strategy.generateMatches(
                eligiblePlayers.map(
                    (player) => ({
                        id: player.id,
                        playerId:
                            player.playerId,
                        skillRating:
                            player.skillRating,
                    }),
                ),
                session.gameFormat,
                previousMatches,
            );
        console.log(
            'GENERATED MATCHES:',
            generatedMatches.map((match) => ({
                team1: match.team1.players.map((p) => p.playerId),
                team2: match.team2.players.map((p) => p.playerId),
            })),
        );

        if (
            generatedMatches.length === 0
        ) {
            throw new BadRequestException(
                'Unable to generate matches',
            );
        }

        // Validate strategy output before writing anything.
        if (generatedMatches.length > availableCourts.length ||
            generatedMatches.length !== selectedCount / playersPerMatch) {
            throw new BadRequestException('Strategy returned an invalid number of matches');
        }
        const selectedIds = new Set(eligiblePlayers.map(p => p.playerId));
        const assignedIds = generatedMatches.flatMap(m => [
            ...m.team1.players, ...m.team2.players,
        ].map(p => p.playerId));
        if (assignedIds.length !== selectedCount ||
            new Set(assignedIds).size !== selectedCount ||
            assignedIds.some(id => !selectedIds.has(id)) ||
            generatedMatches.some(m =>
                m.team1.players.length !== playersPerMatch / 2 ||
                m.team2.players.length !== playersPerMatch / 2)) {
            throw new BadRequestException('Strategy returned invalid player assignments');
        }

        // --------------------------------------------------
        // 10. Determine round number
        // --------------------------------------------------

        const lastMatch =
            await this.prisma.match.findFirst({
                where: {
                    sessionId,
                },
                orderBy: {
                    round: 'desc',
                },
            });

        const round =
            lastMatch
                ? lastMatch.round + 1
                : 1;

        // --------------------------------------------------
        // 11. Create matches inside transaction
        // --------------------------------------------------

        return this.prisma.$transaction(
            async (tx) => {
                type CreatedMatch = Prisma.MatchGetPayload<{
                    include: {
                        court: true;
                        players: {
                            include: {
                                player: true;
                            };
                        };
                    };
                }>;

                const createdMatches: CreatedMatch[] = [];
                for (let index = 0; index < generatedMatches.length; index++) {
                    const generated = generatedMatches[index];
                    const court = availableCourts[index];
                    const assigned = [...generated.team1.players, ...generated.team2.players];

                    // Conditional reservation: only one request can claim this court.
                    const reserved = await tx.court.updateMany({
                        where: { id: court.id, sessionId, status: 'AVAILABLE' },
                        data: { status: 'PLAYING' }, // Adjust to your court status enum.
                    });
                    if (reserved.count !== 1) {
                        throw new ConflictException('Court was claimed by another request');
                    }

                    // Conditional queue transition: fail the whole transaction if
                    // any selected player is no longer waiting.
                    const moved = await tx.queueEntry.updateMany({
                        where: {
                            sessionPlayerId: { in: assigned.map(p => p.id) },
                            status: 'WAITING',
                        },
                        data: { status: 'PLAYING' },
                    });
                    if (moved.count !== playersPerMatch) {
                        throw new ConflictException('A selected player is no longer waiting');
                    }

                    const match = await tx.match.create({
                        data: {
                            sessionId,
                            courtId: court.id,
                            round,
                            status: 'PENDING',
                            players: {
                                create: [
                                    ...generated.team1.players.map((p, position) => ({
                                        playerId: p.playerId, team: 1, position: position + 1,
                                    })),
                                    ...generated.team2.players.map((p, position) => ({
                                        playerId: p.playerId, team: 2, position: position + 1,
                                    })),
                                ],
                            },
                        },
                        include: {
                            court: true,
                            players: {
                                orderBy: [{ team: 'asc' }, { position: 'asc' }],
                                include: { player: true },
                            },
                        },
                    });
                    createdMatches.push(match);
                }
                return createdMatches;
            },
        );
    }
}