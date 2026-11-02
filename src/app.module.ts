import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';

import { SessionsModule } from './modules/sessions/sessions.module';
import { PlayersModule } from './modules/players/players.module';
import { QueueModule } from './modules/queues/queue.module';
import { CourtsModule } from './modules/courts/courts.module';
import { MatchesModule } from './modules/matches/matches.module';
import { MatchingModule } from './modules/matching/matching.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SessionsModule,
    PlayersModule,
    QueueModule,
    CourtsModule,
    MatchesModule,
    MatchingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
