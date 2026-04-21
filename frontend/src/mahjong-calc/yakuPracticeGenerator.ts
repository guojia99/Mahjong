import { Pai, Block, BlockType, PositionType, RON, State } from './types';
import { Calculator } from './calc';

export interface YakuDef {
  id: string;
  name: string;
  category: string;
  han: string;
}

export interface YakuProblem {
  hand: Pai[];
  agariPai: Pai;
  furu: Block[];
  dora: Pai[];
  flag: number;
  ans: ReturnType<Calculator['calculate']>;
  yakuName: string;
}

interface Template {
  hand: string[];
  agari: string;
  field?: number;
  seat?: number;
  yakus?: number[];
  agariWay?: number;
  open?: { type: string; name: string }[];
}

const E = PositionType.EAST;

function T(hand: string[], agari: string, extra: Partial<Template> = {}): Template {
  return { hand, agari, field: E, seat: E, agariWay: RON, yakus: [], open: [], ...extra };
}

const TEMPLATES: Record<string, Template[]> = {
  tanyao: [
    T(['2m','3m','4m','5m','6m','7m','2s','3s','4s','5p','6p','7p','8s'], '8s'),
    T(['2m','3m','4m','5m','6m','7m','8m','3p','4p','5p','3s','4s','5s'], '3s'),
    T(['3p','4p','5p','6p','7p','8p','2s','3s','4s','5s','6s','7s','5m','6m'], '6m'),
    T(['2p','3p','4p','5p','6p','7p','3m','4m','5m','6m','7m','8m','2s','3s'], '3s'),
  ],
  pinfu: [
    T(['1m','2m','3m','4p','5p','6p','2s','3s','4s','5s','6s','7s','8s'], '8s'),
    T(['2m','3m','4m','5s','6s','7s','1p','2p','3p','4s','5s','6s','7s','8s'], '7s'),
    T(['3s','4s','5s','6s','7s','8s','1m','2m','3m','2p','3p','4p','5m','6m'], '5m'),
  ],
  iipeikou: [
    T(['1m','2m','3m','1m','2m','3m','4s','5s','6s','7p','8p','9p','5s','5s'], '5s'),
    T(['2p','3p','4p','2p','3p','4p','5m','6m','7m','1s','2s','3s','6s','6s'], '6s'),
    T(['3m','4m','5m','3m','4m','5m','1s','2s','3s','2p','3p','4p','7s','8s'], '8s'),
  ],
  yakuhai_haku: [
    T(['5z','5z','5z','1m','2m','3m','4s','5s','6s','7p','8p','9p','2m','3m'], '3m'),
    T(['5z','5z','5z','2s','3s','4s','5s','6s','7s','1m','2m','3m','4p','5p'], '5p'),
  ],
  yakuhai_hatsu: [
    T(['6z','6z','6z','1m','2m','3m','4s','5s','6s','7p','8p','9p','2m','3m'], '3m'),
    T(['6z','6z','6z','2s','3s','4s','5s','6s','7s','1m','2m','3m','4p','5p'], '5p'),
  ],
  yakuhai_chun: [
    T(['7z','7z','7z','1m','2m','3m','4s','5s','6s','7p','8p','9p','2m','3m'], '3m'),
    T(['7z','7z','7z','2s','3s','4s','5s','6s','7s','1m','2m','3m','4p','5p'], '5p'),
  ],
  toitoi: [
    T(['1m','1m','1m','5z','5z','5z','3s','3s','3s','7p','7p','7p','2m','2m'], '2m'),
    T(['2p','2p','2p','6z','6z','6z','4m','4m','4m','8s','8s','8s','3s','3s'], '3s'),
    T(['3p','3p','3p','7z','7z','7z','5m','5m','5m','1s','1s','1s','9m','9m'], '9m'),
  ],
  sanankou: [
    T(['2m','2m','2m','5z','5z','5z','3s','3s','3s','7p','7p','7p','4m','4m'], '4m'),
    T(['1m','1m','1m','6z','6z','6z','4s','4s','4s','8p','8p','8p','5m','5m'], '5m'),
  ],
  sanshoku_doukou: [
    T(['2m','2m','2m','2s','2s','2s','2p','2p','2p','1m','3m','4m','5s','5s'], '5s'),
    T(['5p','5p','5p','5s','5s','5s','5m','5m','5m','3s','4s','5s','2m','2m'], '2m'),
  ],
  sanshoku_doujun: [
    T(['2m','3m','4m','2s','3s','4s','2p','3p','4p','5s','6s','7s','8p','8p'], '8p'),
    T(['1m','2m','3m','1s','2s','3s','1p','2p','3p','5m','6m','7m','4s','4s'], '4s'),
    T(['3p','4p','5p','3m','4m','5m','3s','4s','5s','1m','2m','3m','6s','6s'], '6s'),
  ],
  ikkitsuukan: [
    T(['1m','2m','3m','4m','5m','6m','7m','8m','9m','2s','3s','4s','5p','5p'], '5p'),
    T(['1p','2p','3p','4p','5p','6p','7p','8p','9p','1m','2m','3m','4s','4s'], '4s'),
  ],
  chantaiyao: [
    T(['1m','1m','1m','2m','3m','4m','1p','2p','3p','1s','1s','1s','9s','9s'], '9s'),
    T(['1s','1s','1s','2s','3s','4s','1p','2p','3p','1m','1m','1m','9s','9s'], '9s'),
    T(['9p','9p','9p','1m','2m','3m','1p','2p','3p','1s','2s','3s','7z','7z'], '7z'),
  ],
  honiisou: [
    T(['1m','1m','1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','1s','1s'], '1s'),
    T(['2z','2z','2z','1m','1m','1m','3m','3m','3m','4m','5m','6m','9m','9m'], '9m'),
  ],
  chiniisou: [
    T(['1m','1m','1m','2m','3m','4m','5m','6m','7m','8m','9m','2m','3m','4m'], '4m'),
    T(['2p','2p','2p','1p','3p','5p','6p','7p','8p','9p','4p','5p','6p'], '6p'),
    T(['3s','3s','3s','1s','2s','3s','4s','5s','6s','7s','8s','9s','4s','5s'], '5s'),
  ],
  shousangen: [
    T(['5z','5z','5z','6z','6z','6z','1m','2m','3m','4s','5s','6s','7z','7z'], '7z'),
    T(['5z','5z','5z','7z','7z','7z','1m','2m','3m','4s','5s','6s','6z','6z'], '6z'),
  ],
  junchantaiyao: [
    T(['1m','1m','1m','2m','3m','4m','1p','2p','3p','1s','2s','3s','9s','9s'], '9s'),
    T(['9p','9p','9p','1m','2m','3m','1p','2p','3p','1s','2s','3s','9m','9m'], '9m'),
  ],
  daisangen: [
    T(['5z','5z','5z','6z','6z','6z','7z','7z','7z','1m','2m','3m','4s','5s'], '5s'),
    T(['5z','5z','5z','6z','6z','6z','7z','7z','7z','2s','3s','4s','5m','6m'], '6m'),
  ],
  suuankou: [
    T(['1m','1m','1m','2m','2m','2m','3s','3s','3s','4p','4p','4p','5z','5z'], '5z'),
    T(['5s','5s','5s','6s','6s','6s','7z','7z','7z','1m','1m','1m','2p','2p'], '2p'),
  ],
  tsuuiisou: [
    T(['1z','1z','1z','2z','2z','2z','3z','3z','3z','4z','4z','4z','5z','5z'], '5z'),
    T(['5z','5z','5z','6z','6z','6z','7z','7z','7z','1z','1z','1z','2z','2z'], '2z'),
  ],
  chinroutou: [
    T(['1m','1m','1m','9m','9m','9m','1s','1s','1s','1p','1p','1p','9s','9s'], '9s'),
    T(['9p','9p','9p','1m','1m','1m','9s','9s','9s','1p','1p','1p','1s','1s'], '1s'),
  ],
  kokushi: [
    T(['1m','1m','1m','1s','1s','1s','1p','1p','1p','1z','2z','3z','5z','6z'], '6z'),
    T(['1m','1m','1m','1s','1s','1s','1p','1p','1p','1z','2z','3z','7z','7z'], '7z'),
    T(['9m','9m','9m','9s','9s','9s','9p','9p','9p','1z','2z','3z','5z','6z'], '6z'),
  ],
  ryuuiisou: [
    T(['2s','2s','2s','3s','3s','3s','4s','4s','4s','6s','6s','6s','8s','8s'], '8s'),
    T(['2s','3s','4s','2s','3s','4s','6s','6s','6s','8s','8s','8s','3s','3s'], '3s'),
  ],
  chuuren: [
    T(['1m','1m','1m','2m','2m','3m','4m','4m','5m','5m','6m','6m','7m','7m'], '1m'),
    T(['1m','2m','2m','3m','3m','4m','4m','5m','5m','5m','6m','6m','7m','7m'], '6m'),
  ],
};

const DORA_POOL = [
  ['1m'],['2m'],['3m'],['4m'],['5m'],['6m'],['7m'],['8m'],['9m'],
  ['1p'],['2p'],['3p'],['4p'],['5p'],['6p'],['7p'],['8p'],['9p'],
  ['1s'],['2s'],['3s'],['4s'],['5s'],['6s'],['7s'],['8s'],['9s'],
  ['1z'],['2z'],['3z'],['4z'],['5z'],['6z'],['7z'],
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cvtPai(s: string): Pai {
  return new Pai(s.slice(1) as Pai['type'], parseInt(s[0]));
}

function buildProblem(tpl: Template, yakuName: string): YakuProblem {
  const allHand = tpl.hand.map(cvtPai);
  const agariPai = allHand.pop()!;
  agariPai.isAgari = true;

  const yakus = tpl.yakus || [];
  const agariWay = tpl.agariWay ?? RON;
  const field = tpl.field ?? PositionType.EAST;
  const seat = tpl.seat ?? PositionType.EAST;

  const furu = (tpl.open || []).map(f => {
    let bt = BlockType.TRI, open = true;
    if (f.type === 'ankan') { open = false; bt = BlockType.QUAD; }
    else if (f.type === 'kan') bt = BlockType.QUAD;
    else if (f.type === 'chi') bt = BlockType.SEQ;
    const b = new Block(bt, f.name[1] as Pai['type'], parseInt(f.name[0]), open);
    return b;
  });

  const doraCount = Math.random() < 0.6 ? 1 : Math.random() < 0.4 ? 2 : 0;
  const doraPool = shuffle(DORA_POOL.filter(d => {
    const usedTiles = [...tpl.hand, tpl.agari, ...(tpl.open ?? []).map(f => f.name)].map(normalKey);
    return !usedTiles.includes(normalKey(d[0]));
  }));
  const dora = doraPool.slice(0, doraCount).map(d => cvtPai(d[0]));

  const state = new State(field, seat, yakus, agariWay, allHand, furu, dora, [], agariPai, 0);
  const calc = new Calculator();
  const ans = calc.calculate(state);

  return { hand: allHand, agariPai, furu, dora, ura: [], flag: state.flag, ans, yakuName };
}

function normalKey(s: string) { return s.startsWith('0') ? '5' + s[1] : s; }

export function generateYakuProblems(yakuId: string, count: number): YakuProblem[] {
  const templates = TEMPLATES[yakuId] || [];
  if (templates.length === 0) return [];
  const problems: YakuProblem[] = [];
  for (let i = 0; i < count; i++) {
    const tpl = templates[i % templates.length];
    problems.push(buildProblem(tpl, YAKU_PRACTICE_LIST.find(y => y.id === yakuId)?.name || ''));
  }
  return problems;
}

export const YAKU_PRACTICE_LIST: YakuDef[] = [
  { id: 'tanyao', name: '断幺九', category: '基本役', han: '1翻' },
  { id: 'pinfu', name: '平和', category: '基本役', han: '1翻' },
  { id: 'iipeikou', name: '一杯口', category: '基本役', han: '1翻' },
  { id: 'yakuhai_haku', name: '役牌・白', category: '基本役', han: '1翻' },
  { id: 'yakuhai_hatsu', name: '役牌・発', category: '基本役', han: '1翻' },
  { id: 'yakuhai_chun', name: '役牌・中', category: '基本役', han: '1翻' },
  { id: 'toitoi', name: '対対和', category: '中級役', han: '2翻' },
  { id: 'sanankou', name: '三暗刻', category: '中級役', han: '2翻' },
  { id: 'sanshoku_doukou', name: '三色同刻', category: '中級役', han: '2翻' },
  { id: 'sanshoku_doujun', name: '三色同順', category: '中級役', han: '1~2翻' },
  { id: 'ikkitsuukan', name: '一気通貫', category: '中級役', han: '1~2翻' },
  { id: 'chantaiyao', name: '混全帯幺九', category: '中級役', han: '1~2翻' },
  { id: 'junchantaiyao', name: '純全帯幺九', category: '上級役', han: '2~3翻' },
  { id: 'honiisou', name: '混一色', category: '上級役', han: '2~3翻' },
  { id: 'chiniisou', name: '清一色', category: '上級役', han: '5~6翻' },
  { id: 'shousangen', name: '小三元', category: '上級役', han: '2翻' },
  { id: 'daisangen', name: '大三元', category: '役満', han: '役満' },
  { id: 'suuankou', name: '四暗刻', category: '役満', han: '役満' },
  { id: 'tsuuiisou', name: '字一色', category: '役満', han: '役満' },
  { id: 'chinroutou', name: '清老頭', category: '役満', han: '役満' },
  { id: 'kokushi', name: '国士無双', category: '役満', han: '役満' },
  { id: 'ryuuiisou', name: '緑一色', category: '役満', han: '役満' },
  { id: 'chuuren', name: '九蓮宝燈', category: '役満', han: '役満' },
];

export const YAKU_CATEGORIES = ['基本役', '中級役', '上級役', '役満'];
