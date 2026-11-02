import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
  ) { }

  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessionsService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Patch(':id/complete')
  completeSession(
    @Param('id') id: string,
  ) {
    return this.sessionsService.completeSession(
      id,
    );
  }

  @Get(':id/results')
  getResults(
    @Param('id') id: string,
  ) {
    return this.sessionsService.getResults(id);
  }
}