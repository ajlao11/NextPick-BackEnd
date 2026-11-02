import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlayerDto } from './dto/create-player.dto';

@Injectable()
export class PlayersService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async create(
        sessionId: string,
        dto: CreatePlayerDto,
    ) {
        const session = await this.prisma.session.findUnique({
            where: {
                id: sessionId,
            },
            include: {
                players: true,
            },
        });

        if (!session) {
            throw new NotFoundException('Session not found');
        }

        // Check session capacity
        if (
            session.maxPlayers !== null &&
            session.players.length >= session.maxPlayers
        ) {
            throw new BadRequestException(
                'This session is already full',
            );
        }

        // Prevent duplicate player names in this session
        const existingPlayer =
            await this.prisma.sessionPlayer.findFirst({
                where: {
                    sessionId,
                    player: {
                        name: {
                            equals: dto.name,
                            mode: 'insensitive',
                        },
                    },
                },
                include: {
                    player: true,
                },
            });

        if (existingPlayer) {
            throw new BadRequestException(
                'This player is already registered for the session',
            );
        }

        const player = await this.prisma.player.create({
            data: {
                name: dto.name.trim(),
            },
        });

        return this.prisma.sessionPlayer.create({
            data: {
                sessionId,
                playerId: player.id,
                skillRating: dto.skillRating,
            },
            include: {
                player: true,
            },
        });
    }

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

        const matchCount = new Map<string, number>();

        for (const match of completedMatches) {
            for (const player of match.players) {
                matchCount.set(
                    player.playerId,
                    (matchCount.get(player.playerId) ?? 0) + 1,
                );
            }
        }

        return entries.sort((a, b) => {
            const aGames =
                matchCount.get(a.sessionPlayer.playerId) ?? 0;

            const bGames =
                matchCount.get(b.sessionPlayer.playerId) ?? 0;

            if (aGames !== bGames) {
                return aGames - bGames;
            }

            return a.position - b.position;
        });
    }

    async checkIn(
        sessionId: string,
        playerId: string,
    ) {
        const sessionPlayer =
            await this.prisma.sessionPlayer.findFirst({
                where: {
                    sessionId,
                    playerId,
                },
            });

        if (!sessionPlayer) {
            throw new NotFoundException(
                'Player is not registered for this session',
            );
        }

        // CHECK OUT
        if (sessionPlayer.checkedIn) {
            await this.prisma.sessionPlayer.update({
                where: {
                    id: sessionPlayer.id,
                },
                data: {
                    checkedIn: false,
                },
            });

            await this.prisma.queueEntry.deleteMany({
                where: {
                    sessionPlayerId: sessionPlayer.id,
                    status: 'WAITING',
                },
            });

            return this.prisma.sessionPlayer.findUnique({
                where: {
                    id: sessionPlayer.id,
                },
                include: {
                    player: true,
                    queueEntry: true,
                },
            });
        }

        // CHECK IN
        const lastQueueEntry =
            await this.prisma.queueEntry.findFirst({
                where: {
                    sessionId,
                },
                orderBy: {
                    position: 'desc',
                },
            });

        const nextPosition =
            lastQueueEntry
                ? lastQueueEntry.position + 1
                : 1;

        await this.prisma.sessionPlayer.update({
            where: {
                id: sessionPlayer.id,
            },
            data: {
                checkedIn: true,
            },
        });

        await this.prisma.queueEntry.create({
            data: {
                sessionId,
                sessionPlayerId: sessionPlayer.id,
                position: nextPosition,
                status: 'WAITING',
            },
        });

        return this.prisma.sessionPlayer.findUnique({
            where: {
                id: sessionPlayer.id,
            },
            include: {
                player: true,
                queueEntry: true,
            },
        });
    }

    async remove(
        sessionId: string,
        playerId: string,
    ) {
        const sessionPlayer =
            await this.prisma.sessionPlayer.findFirst({
                where: {
                    sessionId,
                    playerId,
                },
            });

        if (!sessionPlayer) {
            throw new NotFoundException(
                'Player is not registered for this session',
            );
        }

        await this.prisma.sessionPlayer.delete({
            where: {
                id: sessionPlayer.id,
            },
        });

        return {
            message: 'Player removed from session',
        };
    }
}