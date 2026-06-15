import { Calculator } from '@/mahjong-calc/calc';
import { Rule } from '@/mahjong-calc/definition';
import {
  State,
  PositionType,
  TSUMO,
  RON,
  comparePai,
  type Block,
} from '@/mahjong-calc/types';
import {
  compareMeldFeedback,
  compareOpenHandFeedback,
  isOpenAnswerCorrect,
  isOpenGuessComplete,
  meldsToBlocks,
} from './meld';
import { computeShanten } from './shanten';
import { buildCanonicalAnswer, tileToPai, tilesToC34 } from './tiles';
import type { AgariWay, QueMiOpenGuess, QueMiPuzzle, QueMiOpenSubmitFeedback, TileFeedback, Wind } from './types';

const WIND_TO_POS: Record<Wind, PositionType> = {
  east: PositionType.EAST,
  south: PositionType.SOUTH,
  west: PositionType.WEST,
  north: PositionType.NORTH,
};

export function isCompleteGuess(guess: (string | null)[]): guess is string[] {
  return guess.length === 14 && guess.every((t) => t && t.length > 0);
}

function buildCalcState(
  hand13: string[],
  draw: string,
  field: Wind,
  seat: Wind,
  agariWay: AgariWay,
  dora: string[],
  furu: Block[] = [],
): State {
  const hand = hand13.map(tileToPai).sort(comparePai);
  const agariPai = tileToPai(draw);
  const doraPai = dora.map(tileToPai);
  return new State(
    WIND_TO_POS[field],
    WIND_TO_POS[seat],
    [],
    agariWay === 'tsumo' ? TSUMO : RON,
    hand,
    furu,
    doraPai,
    [],
    agariPai,
    0,
  );
}

const KOKUSHI_INDICES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** 14 张均为 7 对（每种 2 枚）。七对子本身 2 翻，荣和/自摸均有役。 */
export function isChiitoitsuShape(tiles14: string[]): boolean {
  if (tiles14.length !== 14) return false;
  let pairs = 0;
  for (const c of tilesToC34(tiles14)) {
    if (c !== 0 && c !== 2) return false;
    if (c === 2) pairs++;
  }
  return pairs === 7;
}

/** 13 种幺九牌各至少 1 枚、其中一种 2 枚，共 14 张。国士无双为役满。 */
export function isKokushiShape(tiles14: string[]): boolean {
  if (tiles14.length !== 14) return false;
  const c34 = tilesToC34(tiles14);
  let pairCount = 0;
  for (const i of KOKUSHI_INDICES) {
    const c = c34[i] ?? 0;
    if (c === 0) return false;
    if (c > 2) return false;
    if (c === 2) pairCount++;
  }
  for (let i = 0; i < 34; i++) {
    if (!KOKUSHI_INDICES.includes(i) && (c34[i] ?? 0) > 0) return false;
  }
  return pairCount === 1;
}

export function isWinningHand(
  hand13: string[],
  draw: string,
  field: Wind,
  seat: Wind,
  agariWay: AgariWay,
  dora: string[],
  furu: Block[] = [],
): boolean {
  const res = new Calculator().calculate(buildCalcState(hand13, draw, field, seat, agariWay, dora, furu), new Rule());
  return res.isYakuman || res.hanRealYaku > 0;
}

export type ValidateResult =
  | { ok: true; correct: boolean }
  | { ok: false; reason: 'incomplete' | 'notWinning' | 'noYaku' | 'isWinning' | 'shantenMismatch' };

/** Non-winnable puzzles must not be ron-able; winnable puzzles use the puzzle's agari way. */
function validationAgariWay(puzzle: QueMiPuzzle): AgariWay {
  return puzzle.type === 'nonWinnable' ? 'ron' : puzzle.agariWay;
}

function validateSubmitAgari(
  puzzle: QueMiPuzzle,
  hand13: string[],
  draw: string,
  furu: Block[] = [],
): ValidateResult | null {
  const required = validationAgariWay(puzzle);
  const wins = isWinningHand(hand13, draw, puzzle.fieldWind, puzzle.seatWind, required, puzzle.dora, furu);

  if (puzzle.type === 'winnable') {
    if (wins) return null;
    const alt: AgariWay = required === 'ron' ? 'tsumo' : 'ron';
    if (isWinningHand(hand13, draw, puzzle.fieldWind, puzzle.seatWind, alt, puzzle.dora, furu)) {
      return { ok: false, reason: 'noYaku' };
    }
    return { ok: false, reason: 'notWinning' };
  }

  if (isWinningHand(hand13, draw, puzzle.fieldWind, puzzle.seatWind, 'ron', puzzle.dora, furu)) {
    return { ok: false, reason: 'isWinning' };
  }
  return null;
}

export function getAnswerYaku(puzzle: QueMiPuzzle): string[] {
  if (puzzle.handMode === 'open' && puzzle.openAnswer) {
    const { closedHand, draw, melds } = puzzle.openAnswer;
    const furu = meldsToBlocks(melds);
    const res = new Calculator().calculate(
      buildCalcState(closedHand, draw, puzzle.fieldWind, puzzle.seatWind, puzzle.agariWay, puzzle.dora, furu),
      new Rule(),
    );
    return res.yaku;
  }
  const hand13 = puzzle.answer.slice(0, 13);
  const draw = puzzle.answer[13]!;
  const res = new Calculator().calculate(
    buildCalcState(hand13, draw, puzzle.fieldWind, puzzle.seatWind, puzzle.agariWay, puzzle.dora),
    new Rule(),
  );
  return res.yaku;
}

/** 提示用役种（不含宝牌） */
export function getAnswerYakuHint(puzzle: QueMiPuzzle): string[] {
  return getAnswerYaku(puzzle).filter((y) => !y.includes('宝牌'));
}

export function isKokushiWin(
  hand13: string[],
  draw: string,
  field: Wind,
  seat: Wind,
  agariWay: AgariWay,
  dora: string[],
  furu: Block[] = [],
): boolean {
  const res = new Calculator().calculate(buildCalcState(hand13, draw, field, seat, agariWay, dora, furu), new Rule());
  return res.isYakuman && res.yaku.some((y) => y.includes('国士'));
}

export function validateGuess(puzzle: QueMiPuzzle, guess: (string | null)[]): ValidateResult {
  if (puzzle.handMode === 'open') {
    return { ok: false, reason: 'incomplete' };
  }
  if (!isCompleteGuess(guess)) return { ok: false, reason: 'incomplete' };

  const hand13 = guess.slice(0, 13);
  const draw = guess[13]!;
  const agariErr = validateSubmitAgari(puzzle, hand13, draw);
  if (agariErr) return agariErr;

  if (puzzle.type === 'nonWinnable') {
    if (puzzle.shanten != null && computeShanten(hand13) !== puzzle.shanten) {
      return { ok: false, reason: 'shantenMismatch' };
    }
  }

  const correct = guess.every((t, i) => t === puzzle.answer[i]);
  return { ok: true, correct };
}

export function validateOpenGuess(puzzle: QueMiPuzzle, openGuess: QueMiOpenGuess): ValidateResult {
  if (puzzle.handMode !== 'open' || puzzle.openMeldCount == null) {
    return { ok: false, reason: 'incomplete' };
  }
  if (!isOpenGuessComplete(puzzle.openMeldCount, openGuess.melds, openGuess.hand)) {
    return { ok: false, reason: 'incomplete' };
  }

  const guessMelds = openGuess.melds as string[][];
  const guessHand = openGuess.hand as string[];
  const furu = meldsToBlocks(guessMelds);
  const draw = guessHand[guessHand.length - 1]!;
  const hand13 = guessHand.slice(0, -1) as string[];

  const agariErr = validateSubmitAgari(puzzle, hand13, draw, furu);
  if (agariErr) return agariErr;

  if (puzzle.type === 'nonWinnable') {
    if (puzzle.shanten != null && computeShanten(hand13) !== puzzle.shanten) {
      return { ok: false, reason: 'shantenMismatch' };
    }
  }

  const correct = puzzle.openAnswer
    ? isOpenAnswerCorrect(puzzle.openAnswer, openGuess.melds, openGuess.hand)
    : false;
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

export function compareOpenGuessFeedback(puzzle: QueMiPuzzle, openGuess: QueMiOpenGuess): QueMiOpenSubmitFeedback {
  const answer = puzzle.openAnswer!;
  return {
    meldFeedback: compareMeldFeedback(answer.melds, openGuess.melds),
    handFeedback: compareOpenHandFeedback(answer, openGuess.hand),
  };
}

function countMultiset(tiles: string[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of tiles) c[t] = (c[t] ?? 0) + 1;
  return c;
}

export function formatAnswerTiles(hand13: string[], draw: string): string[] {
  return buildCanonicalAnswer(hand13, draw);
}
