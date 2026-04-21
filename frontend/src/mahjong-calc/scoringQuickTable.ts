import { Rule } from './definition';
import { ManType, PointType } from './types';

/** 速查表符列（与维基教科书常用表一致） */
export const QUICK_TABLE_FU = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110] as const;

const pow2 = (() => {
  const p: number[] = [1];
  for (let i = 1; i <= 20; i++) p.push(p[i - 1] << 1);
  return p;
})();

function round100(n: number): number {
  return Math.floor((n + 100) / 100) * 100;
}

/** 与 Calculator._calculatePoint 中非役满分支一致的基本点 */
export function quickBasePoint(han: number, fu: number, rule = new Rule()): { base: number; manType: ManType } {
  if (han === 0) return { base: 0, manType: ManType.NOMANGAN };
  /* 满贯：3 翻 70 符起、4 翻 40 符起、或 5 翻起（与 calc._calculatePoint 一致） */
  if ((han === 3 && fu >= 70) || (han === 4 && fu >= 40) || han === 5) {
    return { base: 2000, manType: ManType.MANGAN };
  }
  if (han === 6 || han === 7) return { base: 3000, manType: ManType.HANEMAN };
  if (han >= 8 && han <= 10) return { base: 4000, manType: ManType.BAIMAN };
  if ((han >= 11 && han <= 12) || (han >= 13 && !rule.allowLeiMan)) {
    return { base: 6000, manType: ManType.SANBAIMAN };
  }
  if (han >= 13 && rule.allowLeiMan) return { base: 8000, manType: ManType.KAZOEYAKUMAN };
  return { base: fu * pow2[han + 2], manType: ManType.NOMANGAN };
}

function payFromBase(base: number, pointType: PointType): { ron: number; a: number; b: number } {
  let ron = 0, a = 0, b = 0;
  switch (pointType) {
    case PointType.OYATSUMO:
      a = round100(2 * base);
      b = a;
      break;
    case PointType.OYARON:
      ron = round100(6 * base);
      break;
    case PointType.KOTSUMO:
      a = round100(base);
      b = round100(2 * base);
      break;
    case PointType.KORON:
      ron = round100(4 * base);
      break;
  }
  return { ron, a, b };
}

/**
 * 亲家和了：荣和为 ron；自摸括号内为每名闲家支付（三人相同）。
 * 子家和了：荣和为 ron；自摸括号为 (每名闲家, 庄家)。
 */
export function quickCell(
  han: number,
  fu: number,
  dealerWins: boolean,
  rule = new Rule(),
): { ron: number | null; tsumoLabel: string | null } {
  if (han <= 0) return { ron: null, tsumoLabel: null };

  const { base } = quickBasePoint(han, fu, rule);
  if (base <= 0) return { ron: null, tsumoLabel: null };

  const oyaRon = dealerWins ? PointType.OYARON : PointType.KORON;
  const oyaTsumo = dealerWins ? PointType.OYATSUMO : PointType.KOTSUMO;

  if (han === 1 && (fu === 20 || fu === 25)) {
    return { ron: null, tsumoLabel: null };
  }

  const pr = payFromBase(base, oyaRon);
  const pt = payFromBase(base, oyaTsumo);

  let ron: number | null = pr.ron;
  const tsumoLabel = dealerWins ? `${pt.a}` : `${pt.a},${pt.b}`;

  if (han >= 2 && han <= 4 && fu === 20) ron = null;

  return { ron, tsumoLabel };
}

export function formatQuickCell(dealerWins: boolean, han: number, fu: number, rule = new Rule()): string | null {
  const c = quickCell(han, fu, dealerWins, rule);
  if (c.tsumoLabel === null && c.ron === null) return null;
  if (c.ron === null) return `—(${c.tsumoLabel})`;
  if (c.tsumoLabel === null) return String(c.ron);
  return `${c.ron}(${c.tsumoLabel})`;
}

/** 速查表单元格结构化展示（子家荣和 + 自摸两行；亲家可两行） */
export type QuickCellParts =
  | { kind: 'empty' }
  | { kind: 'plain'; text: string }
  | { kind: 'twoLine'; top: string; bottom: string; badge?: string };

/** 满贯（基本点 2000）在表中的统一展示，与下方「5番」满贯行点数一致 */
export function quickManganTableParts(dealerWins: boolean): QuickCellParts {
  if (dealerWins) {
    return { kind: 'twoLine', top: '12000', bottom: '4000', badge: '满贯' };
  }
  return { kind: 'twoLine', top: '8000', bottom: '2000/4000', badge: '满贯' };
}

export function quickCellParts(dealerWins: boolean, han: number, fu: number, rule = new Rule()): QuickCellParts {
  if (quickBasePoint(han, fu, rule).manType === ManType.MANGAN) {
    return quickManganTableParts(dealerWins);
  }

  const c = quickCell(han, fu, dealerWins, rule);
  if (c.tsumoLabel === null && c.ron === null) return { kind: 'empty' };

  if (!dealerWins && c.tsumoLabel !== null && c.tsumoLabel.includes(',')) {
    const [a, b] = c.tsumoLabel.split(',').map(s => s.replace(/\s+/g, '').trim());
    const bottom = `${a}/${b}`;
    const top = c.ron !== null ? String(c.ron).replace(/\s+/g, '') : '—';
    return { kind: 'twoLine', top, bottom };
  }

  if (dealerWins && c.tsumoLabel !== null && !c.tsumoLabel.includes(',')) {
    const top = c.ron !== null ? String(c.ron).replace(/\s+/g, '') : '—';
    const bottom = c.tsumoLabel.replace(/\s+/g, '').trim();
    if (bottom.length > 0) return { kind: 'twoLine', top, bottom };
  }

  const text = formatQuickCell(dealerWins, han, fu, rule);
  return text === null ? { kind: 'empty' } : { kind: 'plain', text };
}

export type FuRowSegment =
  | { type: 'single'; fu: number }
  | { type: 'mangan'; colSpan: number };

/** 将某一行从「首个满贯符」起至最右合并为一块（与维基速查表一致） */
export function buildFuRowSegments(han: number, rule = new Rule()): FuRowSegment[] {
  const fus = [...QUICK_TABLE_FU];
  const i = fus.findIndex(fu => quickBasePoint(han, fu, rule).manType === ManType.MANGAN);
  if (i < 0) return fus.map(fu => ({ type: 'single', fu }));
  const row: FuRowSegment[] = [];
  for (let j = 0; j < i; j++) row.push({ type: 'single', fu: fus[j] });
  row.push({ type: 'mangan', colSpan: fus.length - i });
  return row;
}

/** 满贯以上固定行（亲家 / 子家），与维基表一致 */
export const MANGAN_ROW_LABELS = ['5番', '6–7番', '8–10番', '11–12番', '13番以上'] as const;

export const MANGAN_ROWS_OYA: string[] = [
  '满贯 12000(4000)',
  '跳满 18000(6000)',
  '倍满 24000(8000)',
  '三倍满 36000(12000)',
  '累计役满/役满 48000(16000)',
];

export const MANGAN_ROWS_KO: string[] = [
  '满贯 8000(2000,4000)',
  '跳满 12000(3000,6000)',
  '倍满 16000(4000,8000)',
  '三倍满 24000(6000,12000)',
  '累计役满/役满 32000(8000,16000)',
];

export const WIKI_SOURCE =
  'https://zh.wikibooks.org/wiki/%E6%97%A5%E6%9C%AC%E9%BA%BB%E5%B0%87/%E9%BB%9E%E6%95%B8%E8%A8%88%E7%AE%97%E8%A6%8F%E5%89%87';
