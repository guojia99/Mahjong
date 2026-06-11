export type PuzzleType = 'winnable' | 'nonWinnable';

export type PuzzleDifficulty = 'hard' | 'advanced' | 'medium' | 'normal' | 'easy';

export type Wind = 'east' | 'south' | 'west' | 'north';

export type AgariWay = 'tsumo' | 'ron';

export type TileFeedback = 'green' | 'yellow' | 'black' | 'none';

export interface QueMiPuzzle {
  id: string;
  type: PuzzleType;
  difficulty: PuzzleDifficulty;
  maxAttempts: number;
  /** 标准答案：13 张排序手牌 + 摸牌 */
  answer: string[];
  fieldWind: Wind;
  seatWind: Wind;
  agariWay: AgariWay;
  dora: string[];
  /** 不可胡牌型向听数（13 张） */
  shanten?: number;
  createdAt: number;
}

export interface QueMiHistorySubmit {
  attempt: number;
  guess: string[];
  feedback: TileFeedback[];
}

export interface QueMiHistoryEntry {
  id: string;
  puzzleId: string;
  type: PuzzleType;
  difficulty: PuzzleDifficulty;
  won: boolean;
  attemptsUsed: number;
  timestamp: number;
  /** 完整谜题与提交记录，用于历史回看 */
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
