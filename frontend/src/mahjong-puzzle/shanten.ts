import { tilesToC34 } from './tiles';

function sum9(counts: number[]): number {
  let s = 0;
  for (let i = 0; i < 9; i++) s += counts[i] ?? 0;
  return s;
}

function suitOptionsFn(counts: number[]): Map<string, boolean> {
  const results = new Map<string, boolean>();
  const key = (m: number, p: number) => `${m},${p}`;

  if (sum9(counts) === 0) {
    results.set(key(0, 0), true);
    return results;
  }

  let i = 0;
  while (i < 9 && (counts[i] ?? 0) === 0) i++;
  if (i === 9) {
    results.set(key(0, 0), true);
    return results;
  }

  const cc = [...counts];
  cc[i] = (cc[i] ?? 0) - 1;
  for (const k of suitOptionsFn(cc).keys()) results.set(k, true);
  cc[i] = (cc[i] ?? 0) + 1;

  if ((counts[i] ?? 0) >= 3) {
    cc[i] = (cc[i] ?? 0) - 3;
    for (const k of suitOptionsFn(cc).keys()) {
      const [m, p] = k.split(',').map(Number);
      results.set(key(m! + 1, p!), true);
    }
    cc[i] = (cc[i] ?? 0) + 3;
  }

  if (i <= 6 && (counts[i + 1] ?? 0) > 0 && (counts[i + 2] ?? 0) > 0) {
    cc[i] = (cc[i] ?? 0) - 1;
    cc[i + 1] = (cc[i + 1] ?? 0) - 1;
    cc[i + 2] = (cc[i + 2] ?? 0) - 1;
    for (const k of suitOptionsFn(cc).keys()) {
      const [m, p] = k.split(',').map(Number);
      results.set(key(m! + 1, p!), true);
    }
    cc[i] = (cc[i] ?? 0) + 1;
    cc[i + 1] = (cc[i + 1] ?? 0) + 1;
    cc[i + 2] = (cc[i + 2] ?? 0) + 1;
  }

  if ((counts[i] ?? 0) >= 2) {
    cc[i] = (cc[i] ?? 0) - 2;
    for (const k of suitOptionsFn(cc).keys()) {
      const [m, p] = k.split(',').map(Number);
      results.set(key(m!, p! + 1), true);
    }
    cc[i] = (cc[i] ?? 0) + 2;
  }

  if (i <= 7 && (counts[i + 1] ?? 0) > 0) {
    cc[i] = (cc[i] ?? 0) - 1;
    cc[i + 1] = (cc[i + 1] ?? 0) - 1;
    for (const k of suitOptionsFn(cc).keys()) {
      const [m, p] = k.split(',').map(Number);
      results.set(key(m!, p! + 1), true);
    }
    cc[i] = (cc[i] ?? 0) + 1;
    cc[i + 1] = (cc[i + 1] ?? 0) + 1;
  }

  if (i <= 6 && (counts[i + 2] ?? 0) > 0) {
    cc[i] = (cc[i] ?? 0) - 1;
    cc[i + 2] = (cc[i + 2] ?? 0) - 1;
    for (const k of suitOptionsFn(cc).keys()) {
      const [m, p] = k.split(',').map(Number);
      results.set(key(m!, p! + 1), true);
    }
    cc[i] = (cc[i] ?? 0) + 1;
    cc[i + 2] = (cc[i + 2] ?? 0) + 1;
  }

  return results;
}

function honorOptions(counts: number[]): [number, number] {
  let melds = 0;
  let partials = 0;
  for (const c of counts) {
    if (c >= 3) melds++;
    else if (c === 2) partials++;
  }
  return [melds, partials];
}

function shantenGeneral(c34: number[]): number {
  let best = 8;
  for (let hasPair = 0; hasPair <= 1; hasPair++) {
    const hand = [...c34];
    if (hasPair === 1) {
      let found = false;
      for (let i = 0; i < 34; i++) {
        if (hand[i]! >= 2) {
          hand[i]! -= 2;
          found = true;
          break;
        }
      }
      if (!found) continue;
    }

    const mOpts = suitOptionsFn(hand.slice(0, 9));
    const pOpts = suitOptionsFn(hand.slice(9, 18));
    const sOpts = suitOptionsFn(hand.slice(18, 27));
    const [zm, zp] = honorOptions(hand.slice(27, 34));

    let maxScore = 0;
    for (const mk of mOpts.keys()) {
      const [mm, mp] = mk.split(',').map(Number);
      for (const pk of pOpts.keys()) {
        const [pm, pp] = pk.split(',').map(Number);
        for (const sk of sOpts.keys()) {
          const [sm, sp] = sk.split(',').map(Number);
          let M = mm! + pm! + sm! + zm;
          let P = mp! + pp! + sp! + zp;
          if (M > 4) M = 4;
          let cap = 4 - M;
          if (cap < 0) cap = 0;
          let usedP = P;
          if (usedP > cap) usedP = cap;
          const score = 2 * M + usedP;
          if (score > maxScore) maxScore = score;
        }
      }
    }
    const sh = 8 - maxScore - hasPair;
    if (sh < best) best = sh;
  }
  return best;
}

function shanten7Pairs(c34: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (const x of c34) {
    if (x >= 2) pairs++;
    if (x >= 1) kinds++;
  }
  if (pairs > 7) pairs = 7;
  return 6 - pairs + Math.max(0, 7 - kinds);
}

const YAOCHU_INDICES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function shantenKokushi(c34: number[]): number {
  let kinds = 0;
  let hasPair = false;
  for (const i of YAOCHU_INDICES) {
    if (c34[i]! >= 1) kinds++;
    if (c34[i]! >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

export function computeShanten(tiles: string[]): number {
  const c34 = tilesToC34(tiles);
  return Math.min(shantenGeneral(c34), shanten7Pairs(c34), shantenKokushi(c34));
}
