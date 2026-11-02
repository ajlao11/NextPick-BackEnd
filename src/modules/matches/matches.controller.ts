import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Delete,
    Post,
} from '@nestjs/common';

import { MatchesService } from './matches.service';
import { CompleteMatchDto } from './dto/complete-match.dto';

@Controller('sessions/:sessionId/matches')
export class MatchesController {
    constructor(
        private readonly matchesService: MatchesService,
    ) { }

    @Get()
    findAll(
        @Param('sessionId') sessionId: string,
    ) {
        return this.matchesService.findAll(sessionId);
    }

    @Patch(':matchId/start')
    start(
        @Param('matchId') matchId: string,
    ) {

        return this.matchesService.start(matchId);
    }

    @Patch(':matchId/complete')
    complete(
        @Param('matchId') matchId: string,
        @Body() dto: CompleteMatchDto,
    ) {
        return this.matchesService.complete(
            matchId,
            dto.team1Score,
            dto.team2Score,
            dto.winningTeam,
        );
    }

    @Delete(
        ':matchId/players/:matchPlayerId',
    )
    removePlayer(
        @Param('matchId') matchId: string,
        @Param('matchPlayerId')
        matchPlayerId: string,
    ) {
        return this.matchesService.removePlayer(
            matchId,
            matchPlayerId,
        );
    }

    @Post(':matchId/players')
    addPlayer(
        @Param('matchId') matchId: string,
        @Body()
        body: {
            playerId: string;
            team: number;
            position: number;
        },
    ) {
        return this.matchesService.addPlayer(
            matchId,
            body.playerId,
            body.team,
            body.position,
        );
    }
}