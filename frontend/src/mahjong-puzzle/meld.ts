import { Block, BlockType, type PaiType } from '@/mahjong-calc/types';
import { tileToPai, sortTilesCanonical, countTiles } from './tiles';
import type { QueMiOpenAnswer, TileFeedback } from './types';

export const MELD_TILE_COUNT = 3;
export const MELD_GAP_PX = 10;

export function openHandSlotCount(meldCount: number): number {
  return 14 - meldCount * MELD_TILE_COUNT;
}

export function openDrawSlotIndex(meldCount: number): number {
  return openHandSlotCount(meldCount) - 1;
}

export function meldsToBlocks(melds: string[][]): Block[] {
  return melds.map((m) => {
    const sorted = sortTilesCanonical(m);
    const p0 = tileToPai(sorted[0]!);
    if (sorted[0] === sorted[1] && sorted[1] === sorted[2]) {
      return new Block(BlockType.TRI, p0.type as PaiType, p0.num, true);
    }
    const p = tileToPai(sorted[0]!);
    return new Block(BlockType.SEQ, p.type as PaiType, p.num, true);
  });
}

export function blocksToMelds(blocks: Block[]): string[][] {
  return blocks.map((b) => {
    const tiles = b.getPai().map((p) => `${p.num}${p.type}`);
    return sortTilesCanonical(tiles);
  });
}

function multisetKey(tiles: string[]): string {
  return sortTilesCanonical(tiles).join(',');
}

function countMeldMatches(answer: string[], guess: (string | null)[]): number {
  const a = countTiles(answer);
  const g = countTiles(guess.filter(Boolean) as string[]);
  let n = 0;
  for (const [t, cnt] of Object.entries(a)) {
    n += Math.min(cnt, g[t] ?? 0);
  }
  return n;
}

function meldSlotFeedback(answer: string[], guess: (string | null)[]): TileFeedback[] {
  const slots = guess.length;
  const none = (): TileFeedback[] => Array.from({ length: slots }, () => 'none');
  const matchCount = countMeldMatches(answer, guess);
  if (matchCount <= 1) return none();

  const remaining = countTiles(answer);
  const fb: TileFeedback[] = guess.map(() => 'none');
  const color: TileFeedback = matchCount === 3 ? 'green' : 'yellow';

  for (let i = 0; i < slots; i++) {
    const t = guess[i];
    if (!t || !(remaining[t] ?? 0)) continue;
    fb[i] = color;
    remaining[t]!--;
  }
  return fb;
}

function permutations(n: number): number[][] {
  const arr = Array.from({ length: n }, (_, i) => i);
  const out: number[][] = [];
  const dfs = (k: number) => {
    if (k === n) {
      out.push([...arr]);
      return;
    }
    for (let i = k; i < n; i++) {
      [arr[k], arr[i]] = [arr[i]!, arr[k]!];
      dfs(k + 1);
      [arr[k], arr[i]] = [arr[i]!, arr[k]!];
    }
  };
  dfs(0);
  return out;
}

function meldFeedbackScore(fb: TileFeedback[][]): number {
  let s = 0;
  for (const m of fb) {
    for (const f of m) {
      if (f === 'green') s += 3;
      else if (f === 'yellow') s += 2;
    }
  }
  return s;
}

export function compareMeldFeedback(
  answerMelds: string[][],
  guessMelds: (string | null)[][],
): TileFeedback[][] {
  const n = answerMelds.length;
  if (n === 0) return [];

  const emptyForGuess = (): TileFeedback[][] =>
    guessMelds.map((gm) => Array.from({ length: gm.length }, () => 'none' as TileFeedback));

  let bestFb = emptyForGuess();
  let bestScore = -1;

  for (const perm of permutations(n)) {
    const fbForGuess = emptyForGuess();
    let score = 0;
    for (let ai = 0; ai < n; ai++) {
      const gi = perm[ai]!;
      const slotFb = meldSlotFeedback(answerMelds[ai]!, guessMelds[gi] ?? []);
      fbForGuess[gi] = slotFb;
      score += meldFeedbackScore([slotFb]);
    }
    if (score > bestScore) {
      bestScore = score;
      bestFb = fbForGuess;
    }
  }
  return bestFb;
}

export function compareOpenHandFeedback(
  answer: QueMiOpenAnswer,
  guessHand: (string | null)[],
): TileFeedback[] {
  const closedAnswer = [...sortTilesCanonical(answer.closedHand), answer.draw];
  const fb = compareClosedHandFeedback(closedAnswer, guessHand);

  const meldTileCounts = countTiles(answer.melds.flat());
  for (let i = 0; i < fb.length; i++) {
    if (fb[i] === 'green') continue;
    const t = guessHand[i];
    if (!t || !(meldTileCounts[t] ?? 0)) continue;
    fb[i] = 'yellow';
    meldTileCounts[t]!--;
  }
  return fb;
}

function compareClosedHandFeedback(answer: string[], guess: (string | null)[]): TileFeedback[] {
  const feedback: TileFeedback[] = new Array(guess.length).fill('black');
  const answerRemaining = countTiles(answer);
  const guessRemaining = countTiles(guess.filter(Boolean) as string[]);

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) {
      feedback[i] = 'green';
      answerRemaining[guess[i]!] = (answerRemaining[guess[i]!] ?? 0) - 1;
      guessRemaining[guess[i]!] = (guessRemaining[guess[i]!] ?? 0) - 1;
    }
  }

  for (let i = 0; i < guess.length; i++) {
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

  for (let i = 0; i < guess.length; i++) {
    if (feedback[i] === 'black') feedback[i] = 'none';
  }

  return feedback;
}

export function meldGroupsEqual(answerMelds: string[][], guessMelds: (string | null)[][]): boolean {
  const norm = (m: string[]) => multisetKey(m);
  const a = answerMelds.map(norm).sort();
  const g = guessMelds
    .map((m) => norm(m.filter(Boolean) as string[]))
    .filter((k) => k.length > 0)
    .sort();
  if (a.length !== g.length) return false;
  return a.every((v, i) => v === g[i]);
}

export function isOpenAnswerCorrect(answer: QueMiOpenAnswer, guessMelds: (string | null)[][], guessHand: (string | null)[]): boolean {
  if (!meldGroupsEqual(answer.melds, guessMelds)) return false;
  const closedAnswer = [...sortTilesCanonical(answer.closedHand), answer.draw];
  const guessClosed = guessHand.map((t) => t ?? '');
  return closedAnswer.every((t, i) => t === guessClosed[i]);
}

type TileBag = Record<string, number>;

function bagFromTiles(tiles: string[]): TileBag {
  return countTiles(tiles);
}

function bagRemove(bag: TileBag, tiles: string[]): boolean {
  for (const t of tiles) {
    if (!(bag[t] ?? 0)) return false;
    bag[t]!--;
  }
  return true;
}

function bagKeys(bag: TileBag): string[] {
  const out: string[] = [];
  for (const [t, n] of Object.entries(bag)) {
    for (let i = 0; i < n; i++) out.push(t);
  }
  return out;
}

type PeelCandidate = { tiles: string[]; block: Block };

function findPeelCandidate(bag: TileBag): PeelCandidate | null {
  const candidates: PeelCandidate[] = [];
  for (const [tile, cnt] of Object.entries(bag)) {
    if (cnt >= 3) {
      const p = tileToPai(tile);
      candidates.push({
        tiles: [tile, tile, tile],
        block: new Block(BlockType.TRI, p.type as PaiType, p.num, true),
      });
    }
  }
  for (const suit of ['m', 'p', 's'] as const) {
    for (let n = 1; n <= 7; n++) {
      const seq = [`${n}${suit}`, `${n + 1}${suit}`, `${n + 2}${suit}`];
      if (seq.every((t) => (bag[t] ?? 0) > 0)) {
        const p = tileToPai(seq[0]!);
        candidates.push({
          tiles: seq,
          block: new Block(BlockType.SEQ, p.type as PaiType, p.num, true),
        });
      }
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

export function peelOpenMelds(all14: string[], meldCount: number): { melds: string[][]; blocks: Block[]; remaining: string[] } | null {
  if (meldCount < 1 || meldCount > 4) return null;
  const bag = bagFromTiles(all14);
  const melds: string[][] = [];
  const blocks: Block[] = [];
  for (let i = 0; i < meldCount; i++) {
    const peel = findPeelCandidate(bag);
    if (!peel) return null;
    if (!bagRemove(bag, peel.tiles)) return null;
    melds.push(sortTilesCanonical(peel.tiles));
    blocks.push(peel.block);
  }
  return { melds, blocks, remaining: bagKeys(bag) };
}

export function emptyOpenGuess(meldCount: number): { melds: (string | null)[][]; hand: (string | null)[] } {
  const handLen = openHandSlotCount(meldCount);
  return {
    melds: Array.from({ length: meldCount }, () => Array.from({ length: MELD_TILE_COUNT }, () => null)),
    hand: Array.from({ length: handLen }, () => null),
  };
}

export function isOpenGuessComplete(meldCount: number, melds: (string | null)[][], hand: (string | null)[]): boolean {
  if (melds.length !== meldCount) return false;
  if (hand.length !== openHandSlotCount(meldCount)) return false;
  return melds.every((m) => m.length === MELD_TILE_COUNT && m.every(Boolean))
    && hand.every(Boolean);
}

export function collectOpenGuessTiles(openGuess: {
  melds: (string | null)[][];
  hand: (string | null)[];
}): string[] {
  const tiles: string[] = [];
  for (const m of openGuess.melds) {
    for (const t of m) {
      if (t) tiles.push(t);
    }
  }
  for (const t of openGuess.hand) {
    if (t) tiles.push(t);
  }
  return tiles;
}

export function buildOpenAnswerFromGuess(
  meldCount: number,
  openGuess: { melds: (string | null)[][]; hand: (string | null)[] },
): QueMiOpenAnswer | null {
  if (!isOpenGuessComplete(meldCount, openGuess.melds, openGuess.hand)) return null;
  const drawIdx = openDrawSlotIndex(meldCount);
  const draw = openGuess.hand[drawIdx]!;
  const closedHand = openGuess.hand.filter((_, i) => i !== drawIdx) as string[];
  return {
    melds: openGuess.melds.map((m) => sortTilesCanonical(m as string[])),
    closedHand: sortTilesCanonical(closedHand),
    draw,
  };
}
