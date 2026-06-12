export type PuzzleType = 'winnable' | 'nonWinnable';

export type HandMode = 'closed' | 'open';

export type OpenMeldCountPref = 1 | 2 | 3 | 4 | 'random';

export const OPEN_MELD_COUNT_PREFS: OpenMeldCountPref[] = [1, 2, 3, 4, 'random'];

export type ShantenPreference = 'random' | 1 | 2 | 3 | 4 | 5;

export const SHANTEN_PREFERENCES: ShantenPreference[] = ['random', 1, 2, 3, 4, 5];

export type PuzzleDifficulty = 'hard' | 'advanced' | 'medium' | 'normal' | 'easy';

export type Wind = 'east' | 'south' | 'west' | 'north';

export type AgariWay = 'tsumo' | 'ron';

export type TileFeedback = 'green' | 'yellow' | 'black' | 'none';

export interface QueMiOpenAnswer {
  melds: string[][];
  closedHand: string[];
  draw: string;
}

export interface QueMiPuzzle {
  id: string;
  type: PuzzleType;
  difficulty: PuzzleDifficulty;
  maxAttempts: number;
  handMode: HandMode;
  /** 副露模式副露组数 1–4 */
  openMeldCount?: number;
  openAnswer?: QueMiOpenAnswer;
  /** 门清标准答案：13 张排序手牌 + 摸牌 */
  answer: string[];
  fieldWind: Wind;
  seatWind: Wind;
  agariWay: AgariWay;
  dora: string[];
  /** 不可胡牌型向听数（13 张） */
  shanten?: number;
  createdAt: number;
}

export interface QueMiOpenSubmitFeedback {
  meldFeedback: TileFeedback[][];
  handFeedback: TileFeedback[];
}

export interface QueMiHistorySubmit {
  attempt: number;
  guess: string[];
  feedback: TileFeedback[];
  openGuess?: {
    melds: string[][];
    hand: string[];
  };
  openFeedback?: QueMiOpenSubmitFeedback;
}

export interface QueMiHistoryEntry {
  id: string;
  puzzleId: string;
  type: PuzzleType;
  difficulty: PuzzleDifficulty;
  won: boolean;
  attemptsUsed: number;
  /** 本局总用时（毫秒） */
  durationMs?: number;
  timestamp: number;
  puzzle?: QueMiPuzzle;
  submits?: QueMiHistorySubmit[];
}

export const ATTEMPTS_BY_DIFFICULTY: Record<PuzzleDifficulty, number> = {
  hard: 4,
  advanced: 5,
  medium: 6,
  normal: 7,
  easy: 8,
};

export const HINT_DIFFICULTIES: PuzzleDifficulty[] = ['normal', 'easy'];

export type QueMiInputMode = 'click' | 'drag';

export interface QueMiOpenGuess {
  melds: (string | null)[][];
  hand: (string | null)[];
}

export interface QueMiSession {
  phase: 'playing';
  puzzle: QueMiPuzzle;
  puzzleType: PuzzleType;
  handMode: HandMode;
  openMeldCountPref: OpenMeldCountPref;
  difficulty: PuzzleDifficulty;
  shantenPreference: ShantenPreference;
  guess: (string | null)[];
  openGuess?: QueMiOpenGuess;
  attemptsLeft: number;
  submitRecords: QueMiHistorySubmit[];
  inputMode: QueMiInputMode;
  yakuHintShown: boolean;
  /** 本局开始时间戳（用于计时） */
  startedAt: number;
}

export interface GeneratePuzzleOptions {
  shanten?: ShantenPreference;
  handMode?: HandMode;
  openMeldCount?: OpenMeldCountPref;
}
