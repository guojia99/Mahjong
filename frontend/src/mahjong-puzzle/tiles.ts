import { Pai, comparePai } from '@/mahjong-calc/types';

/** 谜题用牌序（不含赤宝牌） */
export const PUZZLE_TILE_ORDER = [
  '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
  '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
  '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
  '1z', '2z', '3z', '4z', '5z', '6z', '7z',
] as const;

export const PUZZLE_TILE_ROWS = [
  ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'],
  ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'],
  ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'],
  ['1z', '2z', '3z', '4z', '5z', '6z', '7z'],
] as const;

export type PuzzleTile = (typeof PUZZLE_TILE_ORDER)[number];

export function tileToIndex(tile: string): number {
  const m = tile.match(/^(\d)([mpsz])$/);
  if (!m) return -1;
  const num = parseInt(m[1]!, 10);
  const suit = m[2]!;
  if (suit === 'm') return num - 1;
  if (suit === 'p') return 9 + num - 1;
  if (suit === 's') return 18 + num - 1;
  if (suit === 'z') return 27 + num - 1;
  return -1;
}

export function tileToPai(tile: string): Pai {
  const m = tile.match(/^(\d)([mpsz])$/);
  if (!m) throw new Error(`invalid tile: ${tile}`);
  return new Pai(m[2] as Pai['type'], parseInt(m[1]!, 10));
}

export function paiToTile(pai: Pai): string {
  return `${pai.num}${pai.type}`;
}

export function sortTilesCanonical(tiles: string[]): string[] {
  return [...tiles].sort((a, b) => comparePai(tileToPai(a), tileToPai(b)));
}

/** 标准答案：13 张手牌按默认顺序 + 第 14 格为摸牌 */
export function buildCanonicalAnswer(hand13: string[], draw: string): string[] {
  return [...sortTilesCanonical(hand13), draw];
}

export function countTiles(tiles: string[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of tiles) {
    if (t) c[t] = (c[t] ?? 0) + 1;
  }
  return c;
}

export function tilesToC34(tiles: string[]): number[] {
  const c34 = new Array(34).fill(0);
  for (const t of tiles) {
    const i = tileToIndex(t);
    if (i >= 0) c34[i]++;
  }
  return c34;
}
