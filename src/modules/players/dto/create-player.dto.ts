import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePlayerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  skillRating?: number;
}