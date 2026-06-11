import { Pai, comparePai, randInt } from '@/mahjong-calc/types';
import { buildCanonicalAnswer, paiToTile } from './tiles';
import {
  ATTEMPTS_BY_DIFFICULTY,
  type AgariWay,
  type PuzzleDifficulty,
  type PuzzleType,
  type QueMiPuzzle,
  type Wind,
} from './types';
import { computeShanten } from './shanten';
import { isWinningHand } from './validate';

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

    if (Math.random() < 0.05) {
      for (let tuiCnt = 0; tuiCnt < 7;) {
        const tp = 'msp'[randInt(0, 3)] as Pai['type'];
        const num = randInt(2, 9);
        if (this.canGet(tp, num, 2)) {
          tuiCnt++;
          hand.push(this.getPai(tp, num), this.getPai(tp, num));
        }
      }
    } else {
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
    }

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

function tryGenerateWinnable(): Omit<QueMiPuzzle, 'id' | 'difficulty' | 'maxAttempts' | 'createdAt' | 'type'> | null {
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

    return {
      answer: buildCanonicalAnswer(hand13s, draw),
      fieldWind,
      seatWind,
      agariWay,
      dora: [doraTile],
    };
  }
  return null;
}

function tryGenerateNonWinnable(): Omit<QueMiPuzzle, 'id' | 'difficulty' | 'maxAttempts' | 'createdAt' | 'type'> | null {
  for (let i = 0; i < 200; i++) {
    const pool = new TilePool();
    const sorted = [...pool.draw14()].sort(comparePai);
    const drawPai = sorted.pop()!;
    const hand13s = sorted.map(paiToTile);
    const draw = paiToTile(drawPai);
    const sh = computeShanten(hand13s);
    if (sh < 1) continue;

    const fieldWind = pickWind();
    const seatWind = pickWind();
    const agariWay = pickAgariWay();
    const doraTile = paiToTile(pool.getRandomPai());

    if (isWinningHand(hand13s, draw, fieldWind, seatWind, agariWay, [doraTile])) continue;

    return {
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

export function generatePuzzle(type: PuzzleType, difficulty: PuzzleDifficulty): QueMiPuzzle {
  const base = type === 'winnable' ? tryGenerateWinnable() : tryGenerateNonWinnable();
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
