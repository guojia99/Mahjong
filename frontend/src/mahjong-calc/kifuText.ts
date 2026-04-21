import { Calculator } from './calc';
import { Rule } from './definition';
import type { Problem } from './problem';
import type { YakuProblem } from './yakuPracticeGenerator';
import {
  Block,
  BlockType,
  CHANKAN,
  CHIIHOU,
  DOUBLE_RIICHI,
  HAITEI_RAOYUE,
  HOUTEI_RAOYUI,
  IPPATSU,
  PositionType,
  Pai,
  RIICHI,
  RINNSHANN_KAIHOU,
  RON,
  State,
  TENHOU,
  TSUMO,
  type PaiType,
} from './types';

/** 与 CalculatorPage 副露条目一致 */
export type KifuFuroItem = { type: string; name: string; red?: boolean };

export type KifuSnapshot = {
  field: 'east' | 'south' | 'west' | 'north';
  seat: 'east' | 'south' | 'west' | 'north';
  agariWay: 'tsumo' | 'ron';
  /** Calculator 中 yakus 的 value，如 riichi、ippatsu */
  yakus: string[];
  /** 门前 13 张 + 最后 1 张和了牌，与计算器手牌一致 */
  hand14: string[];
  furo: KifuFuroItem[];
  dora: string[];
  ura: string[];
  ponba: number;
};

const YAKU_TAG_TO_KEY: [string, string][] = [
  ['双立直', 'double-riichi'],
  ['立直', 'riichi'],
  ['一发', 'ippatsu'],
  ['海底捞月', 'haite'],
  ['河底摸鱼', 'houte'],
  ['岭上开花', 'rinnshann'],
  ['抢杠', 'chankan'],
  ['天和', 'tenhou'],
  ['地和', 'chiihou'],
];

function cvtWind(s: KifuSnapshot['field']): PositionType {
  return { east: PositionType.EAST, south: PositionType.SOUTH, west: PositionType.WEST, north: PositionType.NORTH }[s];
}

/** Calculator YAKU_OPTIONS value -> flag bit */
function yakuKeyToFlag(k: string): number {
  const m: Record<string, number> = {
    riichi: RIICHI,
    'double-riichi': DOUBLE_RIICHI,
    ippatsu: IPPATSU,
    haite: HAITEI_RAOYUE,
    houte: HOUTEI_RAOYUI,
    rinnshann: RINNSHANN_KAIHOU,
    chankan: CHANKAN,
    tenhou: TENHOU,
    chiihou: CHIIHOU,
  };
  return m[k] || 0;
}

function parseFieldSeatTag(tag: string): Partial<Pick<KifuSnapshot, 'field' | 'seat'>> {
  const t = tag.trim();
  const out: Partial<Pick<KifuSnapshot, 'field' | 'seat'>> = {};
  if (t === '东一局' || t === '东场') out.field = 'east';
  else if (t === '南一局' || t === '南场') out.field = 'south';
  else if (t === '西一局') out.field = 'west';
  else if (t === '北一局') out.field = 'north';
  else if (t === '东家') out.seat = 'east';
  else if (t === '南家') out.seat = 'south';
  else if (t === '西家') out.seat = 'west';
  else if (t === '北家') out.seat = 'north';
  return out;
}

function riichiLineFromFlag(flag: number): string {
  if (flag & DOUBLE_RIICHI) return '双立直';
  if (flag & RIICHI) return '立直';
  return '未立直';
}

function flagTagsToYakuKeys(flag: number): string[] {
  const keys: string[] = [];
  for (const [, key] of YAKU_TAG_TO_KEY) {
    const f = yakuKeyToFlag(key);
    if (f && (flag & f) === f) keys.push(key);
  }
  return keys;
}

/** 从对局标志位还原手牌以外、场况相关展示用标签（含立直状态） */
export function formatBaSceneTags(flag: number): string[] {
  const tags: string[] = [];
  tags.push(riichiLineFromFlag(flag));
  const rnd: [number, string][] = [
    [1 << 0, '东一局'],
    [1 << 1, '南一局'],
    [1 << 2, '西一局'],
    [1 << 3, '北一局'],
  ];
  const seat: [number, string][] = [
    [1 << 4, '东家'],
    [1 << 5, '南家'],
    [1 << 6, '西家'],
    [1 << 7, '北家'],
  ];
  for (const [f, name] of rnd) if ((flag & f) === f) tags.push(name);
  for (const [f, name] of seat) if ((flag & f) === f) tags.push(name);
  if ((flag & TSUMO) === TSUMO) tags.push('自摸');
  else if ((flag & RON) === RON) tags.push('荣和');
  if ((flag & IPPATSU) === IPPATSU && ((flag & RIICHI) === RIICHI || (flag & DOUBLE_RIICHI) === DOUBLE_RIICHI)) tags.push('一发');
  const extra: [number, string][] = [
    [HAITEI_RAOYUE, '海底捞月'],
    [HOUTEI_RAOYUI, '河底摸鱼'],
    [RINNSHANN_KAIHOU, '岭上开花'],
    [CHANKAN, '抢杠'],
    [TENHOU, '天和'],
    [CHIIHOU, '地和'],
  ];
  for (const [f, name] of extra) if ((flag & f) === f) tags.push(name);
  return tags;
}

function parseTileTokens(s: string): string[] {
  const out: string[] = [];
  const t = s.replace(/\s/g, '');
  for (let i = 0; i < t.length; ) {
    if (t[i] === '0' && i + 1 < t.length && 'msp'.includes(t[i + 1])) {
      out.push(t.slice(i, i + 2));
      i += 2;
    } else if (t[i] >= '1' && t[i] <= '9' && i + 1 < t.length && 'mspz'.includes(t[i + 1])) {
      out.push(t.slice(i, i + 2));
      i += 2;
    } else {
      throw new Error(`无法解析牌串位置 ${i} 附近：${t.slice(i)}`);
    }
  }
  return out;
}

function tileNumForSeq(s: string): number {
  return s.startsWith('0') ? 5 : parseInt(s[0]!, 10);
}

function blockToKifuGroup(b: Block): string {
  const n = b.num;
  const tp = b.pType;
  if (b.bType === BlockType.SEQ) {
    const parts = [`${n}${tp}`, `${n + 1}${tp}`, `${n + 2}${tp}`];
    if (b.redCnt > 0) {
      const idx = parts.findIndex(p => p.startsWith('5'));
      if (idx >= 0) parts[idx] = `0${tp}`;
    }
    return parts.join('');
  }
  if (b.bType === BlockType.TRI) {
    const x = `${n}${tp}`;
    return x + x + x;
  }
  if (b.bType === BlockType.QUAD) {
    const x = `${n}${tp}`;
    if (b.isOpen) return x + x + x + x;
    return `暗${n}${tp}`;
  }
  return '';
}

function parseFuroGroup(g: string): KifuFuroItem {
  const raw = g.trim();
  if (!raw) throw new Error('空的副露段落');

  if (raw.startsWith('暗') && raw.length >= 3) {
    const rest = raw.slice(1);
    const tiles = parseTileTokens(rest);
    if (tiles.length !== 1) throw new Error('暗杠应为「暗」+ 一张牌，如 暗1m');
    return { type: 'ankan', name: tiles[0]!.startsWith('0') ? '5' + tiles[0]![1] : tiles[0]! };
  }

  const tiles = parseTileTokens(raw);
  if (tiles.length === 3) {
    const a = tiles[0]!;
    const b = tiles[1]!;
    const c = tiles[2]!;
    if (a === b && b === c) return { type: 'pon', name: a.startsWith('0') ? '5' + a[1] : a };
    const suit = a[1]!;
    if (suit === b[1] && suit === c[1] && 'msp'.includes(suit)) {
      const na = tileNumForSeq(a), nb = tileNumForSeq(b), nc = tileNumForSeq(c);
      const sorted = [na, nb, nc].sort((x, y) => x - y);
      if (sorted[0]! + 1 === sorted[1]! && sorted[1]! + 1 === sorted[2]!) {
        const hasRed = a.startsWith('0') || b.startsWith('0') || c.startsWith('0');
        return { type: 'chi', name: `${sorted[0]}${suit}`, red: hasRed };
      }
    }
    throw new Error(`无法识别副露: ${raw}`);
  }

  if (tiles.length === 4) {
    if (tiles.every(t => t === tiles[0])) {
      const x = tiles[0]!;
      return { type: 'kan', name: x.startsWith('0') ? '5' + x[1] : x };
    }
  }

  throw new Error(`无法识别副露: ${raw}`);
}

function parseBaLine(val: string, base: KifuSnapshot): void {
  const parts = val.split(/[\/／、,，]/).map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (p === '荣胡' || p === '荣和') {
      base.agariWay = 'ron';
      continue;
    }
    if (p === '自摸') {
      base.agariWay = 'tsumo';
      continue;
    }
    if (p === '未立直') continue;
    const fs = parseFieldSeatTag(p);
    if (fs.field) base.field = fs.field;
    if (fs.seat) base.seat = fs.seat;
    for (const [zh, key] of YAKU_TAG_TO_KEY) {
      if (p === zh) {
        if (!base.yakus.includes(key)) base.yakus.push(key);
        break;
      }
    }
  }
}

/**
 * 解析牌谱文本。支持「手牌」为 13+1（共 14 张连续）或「手牌」13 张 +「和牌」1 张。
 */
export function parseKifuText(text: string): KifuSnapshot {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const kv = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^([^:：]+)[:：]\s*(.*)$/);
    if (m) kv.set(m[1]!.trim(), m[2]!.trim());
  }

  const snap: KifuSnapshot = {
    field: 'east',
    seat: 'east',
    agariWay: 'ron',
    yakus: [],
    hand14: [],
    furo: [],
    dora: [],
    ura: [],
    ponba: 0,
  };

  const ba = kv.get('场型');
  if (ba) parseBaLine(ba, snap);

  let handTok: string[] = [];
  const shou = kv.get('手牌');
  const ag = kv.get('和牌');
  if (shou) {
    handTok = parseTileTokens(shou);
    if (ag) {
      const agTok = parseTileTokens(ag);
      if (agTok.length !== 1) throw new Error('和牌只能指定一张');
      handTok = [...handTok, agTok[0]!];
    }
  }

  if (handTok.length !== 14) {
    throw new Error(
      handTok.length === 0
        ? '请提供「手牌」（以及可选的「和牌」）'
        : `手牌（含和了牌）须共 14 张，当前为 ${handTok.length} 张`,
    );
  }
  snap.hand14 = handTok;

  const doraStr = kv.get('宝牌');
  if (doraStr) snap.dora = parseTileTokens(doraStr);

  const uraStr = kv.get('里宝') ?? kv.get('里宝牌');
  if (uraStr) snap.ura = parseTileTokens(uraStr);

  const fu = kv.get('副露');
  if (fu) {
    const groups = fu.split('/').map(s => s.trim()).filter(Boolean);
    for (const g of groups) snap.furo.push(parseFuroGroup(g));
  }

  const honba = kv.get('本场');
  if (honba !== undefined && honba !== '') {
    snap.ponba = Math.max(0, parseInt(honba, 10) || 0);
  }

  return snap;
}

function cvtPaiStr(s: string): Pai {
  if (s.startsWith('0') && 'msp'.includes(s[1]!)) {
    const p = new Pai(s[1] as PaiType, 5);
    p.redCnt = 1;
    return p;
  }
  return new Pai(s[1] as PaiType, parseInt(s[0]!, 10));
}

function cvtFuroItem(it: KifuFuroItem): Block {
  let open = true, bt = BlockType.TRI;
  if (it.type === 'ankan') open = false;
  if (it.type === 'chi') bt = BlockType.SEQ;
  else if (it.type === 'kan' || it.type === 'ankan') bt = BlockType.QUAD;
  const b = new Block(bt, it.name.slice(1) as PaiType, parseInt(it.name[0]!, 10), open);
  if (it.red) b.redCnt = 1;
  return b;
}

/** 根据牌谱构建综合练习用 Problem（含计算结果） */
export function problemFromKifuSnapshot(snap: KifuSnapshot, rule = new Rule()): Problem {
  const closed = snap.hand14.slice(0, 13).map(cvtPaiStr);
  const agari = cvtPaiStr(snap.hand14[13]!);
  const furu = snap.furo.map(cvtFuroItem);
  const dora = snap.dora.map(cvtPaiStr);
  const ura = snap.ura.map(cvtPaiStr);
  const yakus = snap.yakus.map(yakuKeyToFlag).filter(Boolean);
  const agariWay = snap.agariWay === 'tsumo' ? TSUMO : RON;

  const s = new State(
    cvtWind(snap.field),
    cvtWind(snap.seat),
    yakus,
    agariWay,
    closed,
    furu,
    dora,
    ura,
    agari,
    closed.reduce((n, p) => n + p.redCnt, 0) + furu.reduce((n, b) => n + b.redCnt, 0) + agari.redCnt,
  );
  const ans = new Calculator().calculate(s, rule);
  return { hand: closed, agariPai: agari, furu, dora, ura, flag: s.flag, ans };
}

/** 役种练习单题 */
export function yakuProblemFromKifuSnapshot(snap: KifuSnapshot, rule = new Rule()): YakuProblem {
  const p = problemFromKifuSnapshot(snap, rule);
  return { ...p, yakuName: '' };
}

function cvtPaiToStr(p: Pai): string {
  if (p.redCnt > 0) return '0' + p.type;
  return p.num + p.type;
}

function blockToFuroItem(b: Block): KifuFuroItem {
  if (b.bType === BlockType.SEQ) return { type: 'chi', name: `${b.num}${b.pType}`, red: b.redCnt > 0 };
  if (b.bType === BlockType.TRI) return { type: 'pon', name: `${b.num}${b.pType}`, red: b.redCnt > 0 };
  if (b.bType === BlockType.QUAD) {
    if (b.isOpen) return { type: 'kan', name: `${b.num}${b.pType}`, red: b.redCnt > 0 };
    return { type: 'ankan', name: `${b.num}${b.pType}` };
  }
  return { type: 'pon', name: `${b.num}${b.pType}` };
}

function yakuKeysFromFlag(flag: number): string[] {
  return flagTagsToYakuKeys(flag);
}

export function snapshotFromProblem(problem: Problem, ponba = 0): KifuSnapshot {
  const field = [0, 1, 2, 3].find(b => (problem.flag & (1 << b)) !== 0) ?? 0;
  const seat = [4, 5, 6, 7].find(b => (problem.flag & (1 << b)) !== 0) ?? 4;
  const fieldId = (['east', 'south', 'west', 'north'] as const)[field]!;
  const seatId = (['east', 'south', 'west', 'north'] as const)[seat - 4]!;
  const agariWay = (problem.flag & TSUMO) === TSUMO ? 'tsumo' : 'ron';
  const hand14 = [...problem.hand.map(cvtPaiToStr), cvtPaiToStr(problem.agariPai)];
  return {
    field: fieldId,
    seat: seatId,
    agariWay,
    yakus: yakuKeysFromFlag(problem.flag),
    hand14,
    furo: problem.furu.map(blockToFuroItem),
    dora: problem.dora.map(cvtPaiToStr),
    ura: problem.ura.map(cvtPaiToStr),
    ponba,
  };
}

export function snapshotFromYakuProblem(p: YakuProblem, ponba = 0): KifuSnapshot {
  return snapshotFromProblem(p, ponba);
}

export function snapshotFromCalculatorState(o: {
  field: string;
  seat: string;
  agariWay: string;
  yakus: string[];
  hand: string[];
  furo: KifuFuroItem[];
  dora: string[];
  ura: string[];
  ponba: number;
}): KifuSnapshot {
  return {
    field: o.field as KifuSnapshot['field'],
    seat: o.seat as KifuSnapshot['seat'],
    agariWay: o.agariWay === 'tsumo' ? 'tsumo' : 'ron',
    yakus: [...o.yakus],
    hand14: [...o.hand],
    furo: o.furo.map(f => ({ ...f })),
    dora: [...o.dora],
    ura: [...o.ura],
    ponba: o.ponba,
  };
}

/** 序列化为文本，与界面「复制牌谱」一致 */
export function formatKifuText(snap: KifuSnapshot): string {
  const prob = problemFromKifuSnapshot(snap);
  const sceneFinal = formatBaSceneTags(prob.flag);

  const lines: string[] = [];
  lines.push(`场型: ${sceneFinal.join('/')}`);
  lines.push(`手牌: ${snap.hand14.slice(0, 13).join('')}`);
  lines.push(`和牌: ${snap.hand14[13] ?? ''}`);
  lines.push(`宝牌: ${snap.dora.join('')}`);
  lines.push(`里宝: ${snap.ura.join('')}`);
  const fuLine = snap.furo
    .map(f => blockToKifuGroup(cvtFuroItem(f)))
    .join('/');
  lines.push(`副露: ${fuLine}`);
  if (snap.ponba > 0) lines.push(`本场: ${snap.ponba}`);
  return lines.join('\n');
}

export function formatKifuTextFromProblem(problem: Problem, ponba = 0): string {
  return formatKifuText(snapshotFromProblem(problem, ponba));
}

export function formatKifuTextFromYakuProblem(p: YakuProblem, ponba = 0): string {
  return formatKifuText(snapshotFromYakuProblem(p, ponba));
}
