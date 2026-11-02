import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';

import { CourtsService } from './courts.service';

@Controller('sessions/:sessionId/courts')
export class CourtsController {
  constructor(
    private readonly courtsService: CourtsService,
  ) {}

  @Get()
  findAll(
    @Param('sessionId') sessionId: string,
  ) {
    return this.courtsService.findAll(sessionId);
  }
}