import { Calculator } from '@/mahjong-calc/calc';
import { Rule } from '@/mahjong-calc/definition';
import {
  State,
  PositionType,
  TSUMO,
  RON,
  comparePai,
} from '@/mahjong-calc/types';
import { buildCanonicalAnswer, tileToPai } from './tiles';
import type { AgariWay, QueMiPuzzle, TileFeedback, Wind } from './types';

const WIND_TO_POS: Record<Wind, PositionType> = {
  east: PositionType.EAST,
  south: PositionType.SOUTH,
  west: PositionType.WEST,
  north: PositionType.NORTH,
};

export function isCompleteGuess(guess: (string | null)[]): guess is string[] {
  return guess.length === 14 && guess.every((t) => t && t.length > 0);
}

export function isWinningHand(
  hand13: string[],
  draw: string,
  field: Wind,
  seat: Wind,
  agariWay: AgariWay,
  dora: string[],
): boolean {
  const hand = hand13.map(tileToPai).sort(comparePai);
  const agariPai = tileToPai(draw);
  const doraPai = dora.map(tileToPai);
  const s = new State(
    WIND_TO_POS[field],
    WIND_TO_POS[seat],
    [],
    agariWay === 'tsumo' ? TSUMO : RON,
    hand,
    [],
    doraPai,
    [],
    agariPai,
    0,
  );
  const res = new Calculator().calculate(s, new Rule());
  return res.isYakuman || res.hanRealYaku > 0;
}

export type ValidateResult =
  | { ok: true; correct: boolean }
  | { ok: false; reason: 'incomplete' | 'notWinning' | 'noYaku' | 'isWinning' };

export function validateGuess(puzzle: QueMiPuzzle, guess: (string | null)[]): ValidateResult {
  if (!isCompleteGuess(guess)) return { ok: false, reason: 'incomplete' };

  const hand13 = guess.slice(0, 13);
  const draw = guess[13]!;
  const winning = isWinningHand(
    hand13,
    draw,
    puzzle.fieldWind,
    puzzle.seatWind,
    puzzle.agariWay,
    puzzle.dora,
  );

  if (puzzle.type === 'winnable') {
    if (!winning) return { ok: false, reason: 'notWinning' };
  } else if (winning) {
    return { ok: false, reason: 'isWinning' };
  }

  const correct = guess.every((t, i) => t === puzzle.answer[i]);
  return { ok: true, correct };
}

export function compareGuessFeedback(answer: string[], guess: string[]): TileFeedback[] {
  const feedback: TileFeedback[] = new Array(14).fill('black');
  const answerRemaining = countMultiset(answer);
  const guessRemaining = countMultiset(guess);

  for (let i = 0; i < 14; i++) {
    if (guess[i] === answer[i]) {
      feedback[i] = 'green';
      answerRemaining[guess[i]!] = (answerRemaining[guess[i]!] ?? 0) - 1;
      guessRemaining[guess[i]!] = (guessRemaining[guess[i]!] ?? 0) - 1;
    }
  }

  for (let i = 0; i < 14; i++) {
    if (feedback[i] === 'green') continue;
    const t = guess[i];
    if (!t) {
      feedback[i] = 'black';
      continue;
    }
    if ((answerRemaining[t] ?? 0) > 0) {
      feedback[i] = 'yellow';
      answerRemaining[t]!--;
    } else {
      feedback[i] = 'black';
    }
  }

  return feedback;
}

function countMultiset(tiles: string[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of tiles) c[t] = (c[t] ?? 0) + 1;
  return c;
}

export function formatAnswerTiles(hand13: string[], draw: string): string[] {
  return buildCanonicalAnswer(hand13, draw);
}
