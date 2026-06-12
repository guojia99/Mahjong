import { Pai, comparePai, randInt } from '@/mahjong-calc/types';
import { buildCanonicalAnswer, paiToTile, sortTilesCanonical } from './tiles';
import { peelOpenMelds } from './meld';
import {
  ATTEMPTS_BY_DIFFICULTY,
  type AgariWay,
  type GeneratePuzzleOptions,
  type HandMode,
  type OpenMeldCountPref,
  type PuzzleDifficulty,
  type PuzzleType,
  type QueMiPuzzle,
  type ShantenPreference,
  type Wind,
} from './types';
import { computeShanten } from './shanten';
import { isKokushiWin, isWinningHand } from './validate';

const WINDS: Wind[] = ['east', 'south', 'west', 'north'];

class TilePool {
  paiLeft: Record<string, number[]> = {};

  constructor() {
    for (const t of 'mspz') this.paiLeft[t] = new Array(12).fill(4);
  }

  canGet(tp: string, n: number, cnt = 1) {
    return (this.paiLeft[tp]?.[n] ?? 0) >= cnt;
  }

  getPai(type: Pai['type'], num: number): Pai {
    this.paiLeft[type]![num]!--;
    return new Pai(type, num);
  }

  getRandomPai(): Pai {
    for (;;) {
      const tp = 'mspz'[randInt(0, 4)] as Pai['type'];
      const n = randInt(1, tp === 'z' ? 8 : 10);
      if (this.canGet(tp, n)) return this.getPai(tp, n);
    }
  }

  private genBlock(wantTanyao: boolean): Pai[] {
    for (let tries = 0; tries < 80; tries++) {
      const tp = (wantTanyao ? 'msp' : 'mspz')[randInt(0, wantTanyao ? 3 : 4)] as Pai['type'];
      if (Math.random() < 0.15 || tp === 'z') {
        const n = randInt(wantTanyao ? 2 : 1, tp === 'z' ? 8 : 10);
        if (wantTanyao && tp !== 'z' && (n === 1 || n === 9)) continue;
        if (this.canGet(tp, n, 3)) {
          return [this.getPai(tp, n), this.getPai(tp, n), this.getPai(tp, n)];
        }
      } else {
        const n = randInt(wantTanyao ? 2 : 1, wantTanyao ? 7 : 8);
        if (this.canGet(tp, n) && this.canGet(tp, n + 1) && this.canGet(tp, n + 2)) {
          return [this.getPai(tp, n), this.getPai(tp, n + 1), this.getPai(tp, n + 2)];
        }
      }
    }
    return this.genBlock(false);
  }

  private genPair(wantTanyao: boolean): Pai[] {
    for (let tries = 0; tries < 80; tries++) {
      const tp = (wantTanyao ? 'msp' : 'mspz')[randInt(0, wantTanyao ? 3 : 4)] as Pai['type'];
      const n = randInt(wantTanyao ? 2 : 1, tp === 'z' ? 8 : 10);
      if (wantTanyao && tp !== 'z' && (n === 1 || n === 9)) continue;
      if (this.canGet(tp, n, 2)) return [this.getPai(tp, n), this.getPai(tp, n)];
    }
    return this.genPair(false);
  }

  genWinningHand(): Pai[] | null {
    const hand: Pai[] = [];
    const wantTanyao = Math.random() < 0.45;
    const wantYakuhai = !wantTanyao && Math.random() < 0.25;
    for (let i = 0; i < 4; i++) {
      if (wantYakuhai && i === 0) {
        const ys = [1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
        let block: Pai[] | null = null;
        for (const n of ys) {
          if (this.canGet('z', n, 3)) {
            block = [this.getPai('z', n), this.getPai('z', n), this.getPai('z', n)];
            break;
          }
        }
        hand.push(...(block ?? this.genBlock(wantTanyao)));
      } else {
        hand.push(...this.genBlock(wantTanyao));
      }
    }
    hand.push(...this.genPair(wantTanyao));

    if (hand.length !== 14) return null;
    return hand;
  }

  draw14(): Pai[] {
    const tiles: Pai[] = [];
    for (let i = 0; i < 14; i++) tiles.push(this.getRandomPai());
    return tiles;
  }
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function pickWind(): Wind {
  return WINDS[randInt(0, 4)]!;
}

function pickAgariWay(): AgariWay {
  return Math.random() < 0.5 ? 'tsumo' : 'ron';
}

function resolveOpenMeldCount(pref: OpenMeldCountPref): number {
  if (pref === 'random') return randInt(1, 5);
  return pref;
}

function tryGenerateWinnableClosed(): Omit<QueMiPuzzle, 'id' | 'difficulty' | 'maxAttempts' | 'createdAt' | 'type'> | null {
  for (let i = 0; i < 120; i++) {
    const pool = new TilePool();
    const all = pool.genWinningHand();
    if (!all || all.length !== 14) continue;

    const sorted = [...all].sort(comparePai);
    const agariIdx = randInt(0, sorted.length);
    const agariPai = sorted.splice(agariIdx, 1)[0]!;
    const hand13s = sorted.map(paiToTile);
    const draw = paiToTile(agariPai);

    const fieldWind = pickWind();
    const seatWind = pickWind();
    const agariWay = pickAgariWay();
    const doraTile = paiToTile(pool.getRandomPai());

    if (!isWinningHand(hand13s, draw, fieldWind, seatWind, agariWay, [doraTile])) continue;
    if (isKokushiWin(hand13s, draw, fieldWind, seatWind, agariWay, [doraTile])) continue;

    return {
      handMode: 'closed',
      answer: buildCanonicalAnswer(hand13s, draw),
      fieldWind,
      seatWind,
      agariWay,
      dora: [doraTile],
    };
  }
  return null;
}

function tryGenerateWinnableOpen(meldCountPref: OpenMeldCountPref): Omit<QueMiPuzzle, 'id' | 'difficulty' | 'maxAttempts' | 'createdAt' | 'type'> | null {
  const meldCount = resolveOpenMeldCount(meldCountPref);
  for (let i = 0; i < 200; i++) {
    const pool = new TilePool();
    const all = pool.genWinningHand();
    if (!all || all.length !== 14) continue;

    const allTiles = all.map(paiToTile);
    const peeled = peelOpenMelds(allTiles, meldCount);
    if (!peeled) continue;

    const sorted = sortTilesCanonical(peeled.remaining);
    if (sorted.length < 2) continue;
    const agariIdx = randInt(0, sorted.length);
    const agariPai = sorted[agariIdx]!;
    const closedHand = sorted.filter((_, idx) => idx !== agariIdx);
    const draw = agariPai;

    const fieldWind = pickWind();
    const seatWind = pickWind();
    const agariWay = pickAgariWay();
    const doraTile = paiToTile(pool.getRandomPai());

    if (!isWinningHand(closedHand, draw, fieldWind, seatWind, agariWay, [doraTile], peeled.blocks)) continue;
    if (isKokushiWin(closedHand, draw, fieldWind, seatWind, agariWay, [doraTile], peeled.blocks)) continue;

    return {
      handMode: 'open',
      openMeldCount: meldCount,
      openAnswer: {
        melds: peeled.melds,
        closedHand: sortTilesCanonical(closedHand),
        draw,
      },
      answer: buildCanonicalAnswer(closedHand, draw),
      fieldWind,
      seatWind,
      agariWay,
      dora: [doraTile],
    };
  }
  return null;
}

function matchesShantenPreference(sh: number, pref: ShantenPreference): boolean {
  if (pref === 'random') return sh >= 1 && sh <= 5;
  return sh === pref;
}

function tryGenerateNonWinnable(
  shantenPref: ShantenPreference = 'random',
): Omit<QueMiPuzzle, 'id' | 'difficulty' | 'maxAttempts' | 'createdAt' | 'type'> | null {
  const maxTries = shantenPref === 'random' ? 200 : 500;
  for (let i = 0; i < maxTries; i++) {
    const pool = new TilePool();
    const sorted = [...pool.draw14()].sort(comparePai);
    const drawPai = sorted.pop()!;
    const hand13s = sorted.map(paiToTile);
    const draw = paiToTile(drawPai);
    const sh = computeShanten(hand13s);
    if (!matchesShantenPreference(sh, shantenPref)) continue;

    const fieldWind = pickWind();
    const seatWind = pickWind();
    const agariWay = pickAgariWay();
    const doraTile = paiToTile(pool.getRandomPai());

    if (isWinningHand(hand13s, draw, fieldWind, seatWind, agariWay, [doraTile])) continue;

    return {
      handMode: 'closed',
      answer: buildCanonicalAnswer(hand13s, draw),
      fieldWind,
      seatWind,
      agariWay,
      dora: [doraTile],
      shanten: sh,
    };
  }
  return null;
}

export function generatePuzzle(
  type: PuzzleType,
  difficulty: PuzzleDifficulty,
  options?: GeneratePuzzleOptions,
): QueMiPuzzle {
  const handMode: HandMode = options?.handMode ?? 'closed';
  let base: Omit<QueMiPuzzle, 'id' | 'difficulty' | 'maxAttempts' | 'createdAt' | 'type'> | null = null;

  if (type === 'winnable') {
    base = handMode === 'open'
      ? tryGenerateWinnableOpen(options?.openMeldCount ?? 'random')
      : tryGenerateWinnableClosed();
  } else {
    base = tryGenerateNonWinnable(options?.shanten ?? 'random');
  }

  if (!base) {
    throw new Error('failed to generate puzzle');
  }
  return {
    id: randomId(),
    type,
    difficulty,
    maxAttempts: ATTEMPTS_BY_DIFFICULTY[difficulty],
    createdAt: Date.now(),
    ...base,
  };
}

/** 输入器可用枚数：每牌最多 4 枚，宝牌指示牌占用 1 枚 */
export function buildTileAvailability(dora: string[]): Record<string, number> {
  const avail: Record<string, number> = {};
  for (let t = 1; t <= 9; t++) {
    avail[`${t}m`] = 4;
    avail[`${t}p`] = 4;
    avail[`${t}s`] = 4;
  }
  for (let t = 1; t <= 7; t++) avail[`${t}z`] = 4;
  for (const d of dora) {
    if (avail[d] != null) avail[d] = Math.max(0, avail[d]! - 1);
  }
  return avail;
}
