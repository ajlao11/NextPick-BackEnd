import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min, Matches } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime?: string;

  @IsInt()
  @Min(1)
  courtCount!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPlayers?: number;
}