import type {
  AgariWay,
  HandMode,
  PuzzleDifficulty,
  PuzzleType,
  QueMiOpenAnswer,
  QueMiOpenGuess,
  QueMiOpenSubmitFeedback,
  QueMiPuzzle,
  TileFeedback,
  Wind,
} from '@/mahjong-puzzle/types';

export type QueMiAttemptStatus = 'in_progress' | 'won' | 'lost';

export interface QueMiPuzzleListFilters {
  unplayed?: boolean;
  difficulty?: PuzzleDifficulty;
  type?: PuzzleType;
  hand_mode?: HandMode;
}

export interface QueMiPuzzleListItem {
  id: string;
  puzzle: QueMiPuzzle;
  creator_id: number;
  creator_name: string;
  is_disabled: boolean;
  is_mine: boolean;
  play_count: number;
  solve_count: number;
  created_at: string;
  my_attempt_status?: QueMiAttemptStatus;
}

export interface QueMiPuzzleDetail extends QueMiPuzzleListItem {
  my_attempt?: QueMiAttempt;
}

/** Puzzle payload returned when starting or resuming play (answers stripped). */
export interface QueMiPlayPuzzle {
  id: string;
  type: PuzzleType;
  difficulty: PuzzleDifficulty;
  max_attempts: number;
  hand_mode: HandMode;
  open_meld_count?: number;
  field_wind: Wind;
  seat_wind: Wind;
  agari_way: AgariWay;
  dora: string[];
  shanten?: number;
}

export interface QueMiSubmitRecord {
  attempt_no: number;
  guess: { guess?: string[]; open_guess?: QueMiOpenGuess };
  feedback: TileFeedback[] | QueMiOpenSubmitFeedback;
  correct: boolean;
  created_at: string;
}

export interface QueMiAttempt {
  id: string;
  puzzle_id: string;
  status: QueMiAttemptStatus;
  attempts_left: number;
  attempts_used: number;
  won: boolean;
  duration_ms: number;
  started_at: string;
  finished_at?: string | null;
  session_state?: Record<string, unknown>;
  submits?: QueMiSubmitRecord[];
  /** Full puzzle with answer; included when attempt is finished. */
  revealed_puzzle?: QueMiPuzzle;
}

export interface QueMiStartAttemptResponse {
  attempt: QueMiAttempt;
  puzzle: QueMiPlayPuzzle;
}

export interface QueMiSubmitAnswerResponse {
  ok: boolean;
  reason?: string;
  correct?: boolean;
  feedback?: TileFeedback[] | QueMiOpenSubmitFeedback;
  attempts_left?: number;
  status?: QueMiAttemptStatus;
  won?: boolean;
  revealed_puzzle?: QueMiPuzzle;
  attempt?: QueMiAttempt;
}

export interface QueMiGiveUpResponse {
  attempt: QueMiAttempt;
  revealed_puzzle: QueMiPuzzle;
}

export interface QueMiLeaderboardEntry {
  rank: number | null;
  user_id: number;
  player_id: string;
  nickname: string;
  attempts_used: number;
  duration_ms: number;
  finished_at: string;
  won: boolean;
}

export interface QueMiMyAttemptItem {
  attempt: QueMiAttempt;
  puzzle: {
    id: string;
    type?: PuzzleType;
    difficulty?: PuzzleDifficulty;
    hand_mode?: HandMode;
  };
}

export interface QueMiBlacklistEntry {
  user_id: number;
  username: string;
  nickname: string;
  created_at: string;
}

export type { QueMiOpenAnswer, QueMiOpenGuess, QueMiPuzzle };
