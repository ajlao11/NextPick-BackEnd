import {
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class CompleteMatchDto {
  @IsInt()
  @Min(0)
  team1Score!: number;

  @IsInt()
  @Min(0)
  team2Score!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  winningTeam?: number;
}