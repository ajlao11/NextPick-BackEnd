export type MatchingGameFormat =
  | 'SINGLES'
  | 'DOUBLES';

export interface MatchingPlayer {
  id: string;
  playerId: string;
  skillRating: number | null;
}

export interface PreviousMatch {
  players: Array<{
    playerId: string;
    team: number;
  }>;
}

export interface GeneratedTeam {
  players: MatchingPlayer[];
}

export interface GeneratedMatch {
  team1: GeneratedTeam;
  team2: GeneratedTeam;
}

export interface MatchingStrategy {
  generateMatches(
    players: MatchingPlayer[],
    gameFormat: MatchingGameFormat,
    previousMatches: PreviousMatch[],
  ): GeneratedMatch[];
}