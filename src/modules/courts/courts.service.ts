import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CourtsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.ensureCourts(sessionId, session.courtCount);

    return this.prisma.court.findMany({
      where: {
        sessionId,
      },
      orderBy: {
        number: 'asc',
      },
    });
  }

  private async ensureCourts(
    sessionId: string,
    courtCount: number,
  ) {
    const existingCourts =
      await this.prisma.court.count({
        where: {
          sessionId,
        },
      });

    if (existingCourts >= courtCount) {
      return;
    }

    const courts = Array.from(
      { length: courtCount - existingCourts },
      (_, index) => {
        const number = existingCourts + index + 1;

        return {
          sessionId,
          number,
          name: `Court ${number}`,
        };
      },
    );

    await this.prisma.court.createMany({
      data: courts,
    });
  }
}