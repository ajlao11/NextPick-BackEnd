import {
  Controller,
  Param,
  Post,
} from '@nestjs/common';

import { MatchingService } from './matching.service';

@Controller('sessions/:sessionId/matching')
export class MatchingController {
  constructor(
    private readonly matchingService: MatchingService,
  ) {}

  @Post('generate')
  generate(
    @Param('sessionId') sessionId: string,
  ) {
    return this.matchingService.generateRound(
      sessionId,
    );
  }
}