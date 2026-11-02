import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Patch,
    Delete,
} from '@nestjs/common';

import { CreatePlayerDto } from './dto/create-player.dto';
import { PlayersService } from './players.service';

@Controller('sessions/:sessionId/players')
export class PlayersController {
    constructor(
        private readonly playersService: PlayersService,
    ) { }

    @Post()
    create(
        @Param('sessionId') sessionId: string,
        @Body() dto: CreatePlayerDto,
    ) {
        return this.playersService.create(
            sessionId,
            dto,
        );
    }

    @Get()
    findAll(
        @Param('sessionId') sessionId: string,
    ) {
        return this.playersService.findAll(sessionId);
    }

    @Patch(':playerId/check-in')
    checkIn(
        @Param('sessionId') sessionId: string,
        @Param('playerId') playerId: string,
    ) {
        return this.playersService.checkIn(
            sessionId,
            playerId,
        );
    }

    @Delete(':playerId')
    remove(
        @Param('sessionId') sessionId: string,
        @Param('playerId') playerId: string,
    ) {
        return this.playersService.remove(
            sessionId,
            playerId,
        );
    }
}