import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';

import { QueueService } from './queue.service';

@Controller('sessions/:sessionId/queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
  ) {}

  @Get()
  findAll(
    @Param('sessionId') sessionId: string,
  ) {
    return this.queueService.findAll(sessionId);
  }
}