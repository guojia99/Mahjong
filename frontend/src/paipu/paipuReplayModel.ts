/**
 * 牌谱可视化重放模型：把 Game.paipu_data.actions 转换为「分局 + 步进帧」结构，
 * 供 PaipuReplayPanel 渲染牌桌、手牌、副露、舍牌、宝牌、剩余牌山等。
 *
 * 设计目标：
 * - 纯前端、只读、对未知字段健壮（缺失字段时不抛异常）
 * - 每个 action 对应一个 Frame（含 NewRound 作为初始帧），允许前进/后退浏览
 * - 同时保留「初始牌山 paishan」、「初始 dora 指示牌」、「累计供托」等供高级视图使用
 *
 * 牌字符串约定（与雀魂 / 仓库 /marjongs/*.webp 命名一致）：
 *   - "1m".."9m" 万子，"0m" 红五万
 *   - "1p".."9p" 筒子，"0p" 红五筒
 *   - "1s".."9s" 索子，"0s" 红五索
 *   - "1z".."7z" 字牌（東南西北白發中）
 */

import { extractPaipuActions, type MajsoulAccountBinding } from '@/paipu/paipuDetailModel';

// 兼容性：再次导出便于 PaipuReplayPanel 使用
export { buildMajsoulAccountBindings } from '@/paipu/paipuDetailModel';
export type { MajsoulAccountBinding } from '@/paipu/paipuDetailModel';

// =====================
// 公共类型
// =====================

export type MeldKind = 'chi' | 'pon' | 'minkan' | 'kakan' | 'ankan';

export interface MeldTile {
  tile: string;
  /** 横置（吃/碰/明杠时来自他家的牌） */
  sideways: boolean;
  /** 加杠叠在已有碰牌上（与其相邻一张共用横位） */
  stacked: boolean;
}

export interface Meld {
  kind: MeldKind;
  /** 自左至右的展示顺序 */
  tiles: MeldTile[];
  /** 鸣牌来源座位（吃/碰/明杠/加杠原碰的鸣牌座位）；暗杠为 undefined */
  fromSeat?: number;
}

export interface DiscardTile {
  tile: string;
  /** 立直宣言时本张横置 */
  sideways: boolean;
  /** 是否手切（true=手切，false=摸切） */
  tedashi: boolean;
  /** 后续被他家鸣走 */
  called: boolean;
}

export interface SeatState {
  /** 当前手牌（不含「刚摸到的牌」）。已按 TILE_ORDER 排序 */
  hand: string[];
  /** 刚摸到尚未出牌时分离展示的一张 */
  draw: string | null;
  /** 完整的舍牌河（含被鸣走的占位） */
  discards: DiscardTile[];
  /** 已成立的副露 */
  melds: Meld[];
  /** 是否已宣立直 */
  riichi: boolean;
  /** 是否本局曾立直成功（用于立直棒计算） */
  riichiAccepted: boolean;
  /** 当前分数（来自牌谱最近一次写入；如缺省则继承上一帧） */
  score: number;
  /** 是否本局亲家 */
  isDealer: boolean;
  /** 听牌信息（取自最近 RecordDiscardTile.tingpais；若尚未给出则 null） */
  tingpais: { tile: string; count: number }[] | null;
}

export type FrameKind =
  | 'newround'
  | 'deal'
  | 'discard'
  | 'chipenggang'
  | 'gangadd'
  | 'hule'
  | 'liuju'
  | 'notile'
  | 'other';

export interface HuleInfoBrief {
  seat: number;
  zimo: boolean;
  fromSeat: number;
  points: number;
  fans: { name: string; val: number }[];
  yiman: boolean;
  liqi: boolean;
  /** 局末新增宝牌指示（含原本初始指示） */
  doras: string[];
  /** 里宝牌指示（仅立直时给出） */
  liDoras: string[];
  /** 该和牌型的最终手牌 (closed) */
  hand: string[];
  /** 副露（字符串原始格式，未细解，仅展示） */
  ming: string[];
  /** 和了张 */
  huTile: string;
  fu: number;
}

export interface Frame {
  /** 牌谱 step（与 action.step 一致） */
  step: number;
  actionIndex: number;
  kind: FrameKind;
  /** 此帧所属座位（出牌/摸牌方）；NewRound/局末为 null */
  actorSeat: number | null;
  seats: [SeatState, SeatState, SeatState, SeatState];
  /** 局末分摊后才更新（含 NewRound 立直棒） */
  riichibou: number;
  /** 当前指示宝牌（含初始 + 杠后翻开） */
  doraIndicators: string[];
  /** 局末时立直方查看到的里宝牌（仅 hule 帧给出） */
  uraDoraIndicators: string[];
  /** 牌山剩余 (left_tile_count) */
  wallRemaining: number;
  /** 描述当前一帧发生的事，已本地化处理（仅核心信息；具体翻译可在 UI 层覆盖） */
  summary: FrameSummary;
  /** 仅在 'hule' 帧含值；多家荣和时可能多条 */
  hules?: HuleInfoBrief[];
  /** 仅在 'liuju' 帧含值（type 数字） */
  liujuType?: number;
  /** 仅在 'notile' 帧含值：各家是否听牌 + delta_scores */
  noTileInfo?: { tenpai: [boolean, boolean, boolean, boolean]; deltas: [number, number, number, number] };
}

export type FrameSummary =
  | { kind: 'newround'; chang: number; ju: number; ben: number; dealerSeat: number }
  | { kind: 'deal'; seat: number; tile: string }
  | { kind: 'discard'; seat: number; tile: string; tedashi: boolean; riichi: boolean }
  | { kind: 'chipenggang'; seat: number; meldKind: Exclude<MeldKind, 'ankan' | 'kakan'>; tile: string; fromSeat: number }
  | { kind: 'gangadd'; seat: number; meldKind: 'ankan' | 'kakan'; tile: string }
  | { kind: 'hule'; seats: number[]; zimo: boolean }
  | { kind: 'liuju'; liujuType: number }
  | { kind: 'notile' }
  | { kind: 'other'; raw: string };

export interface SeatPlayerDisplay {
  seat: number;
  nickname: string;
  avatar?: string;
}

export interface ReplayRound {
  index: number;
  chang: number;
  ju: number;
  ben: number;
  dealerSeat: number;
  /** 该局开始时的四家分数 */
  initialScores: [number, number, number, number];
  /** 该局开始时立直棒数 */
  initialRiichibou: number;
  /** 牌谱原始 136 张 paishan（按出现顺序拆分） */
  paishan: string[];
  /** 该局所有逐帧快照；frames[0] 为 NewRound 帧 */
  frames: Frame[];
  /** 该局结束方式：和牌 / 流局 / 荒牌；未完成时为 null */
  endKind: 'hule' | 'liuju' | 'notile' | null;
  /** 该局结束时的 delta_scores（与座位顺序对齐） */
  endDeltas?: [number, number, number, number];
  /** 该局结束时的分数 */
  endScores?: [number, number, number, number];
}

export interface PaipuReplayModel {
  rounds: ReplayRound[];
  seatPlayers: [SeatPlayerDisplay, SeatPlayerDisplay, SeatPlayerDisplay, SeatPlayerDisplay];
  hasData: boolean;
}

// =====================
// 工具：解析 / 字符串
// =====================

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown, dft = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dft;
}

const TILE_RANK: Record<string, number> = (() => {
  const order = [
    '1m', '2m', '3m', '4m', '0m', '5m', '6m', '7m', '8m', '9m',
    '1p', '2p', '3p', '4p', '0p', '5p', '6p', '7p', '8p', '9p',
    '1s', '2s', '3s', '4s', '0s', '5s', '6s', '7s', '8s', '9s',
    '1z', '2z', '3z', '4z', '5z', '6z', '7z',
  ];
  return Object.fromEntries(order.map((t, i) => [t, i]));
})();

export function sortTiles(tiles: string[]): string[] {
  return [...tiles].sort((a, b) => (TILE_RANK[a] ?? 999) - (TILE_RANK[b] ?? 999));
}

/** 把 paishan 字符串切成 136 张牌（每两字符一张） */
function splitPaishan(s: unknown): string[] {
  if (typeof s !== 'string') return [];
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push(s.slice(i, i + 2));
  return out;
}

function arrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

// =====================
// 内部：deep clone
// =====================

function cloneSeat(s: SeatState): SeatState {
  return {
    hand: [...s.hand],
    draw: s.draw,
    discards: s.discards.map((d) => ({ ...d })),
    melds: s.melds.map((m) => ({ ...m, tiles: m.tiles.map((t) => ({ ...t })) })),
    riichi: s.riichi,
    riichiAccepted: s.riichiAccepted,
    score: s.score,
    isDealer: s.isDealer,
    tingpais: s.tingpais ? s.tingpais.map((t) => ({ ...t })) : null,
  };
}

function cloneSeats(seats: [SeatState, SeatState, SeatState, SeatState]): [SeatState, SeatState, SeatState, SeatState] {
  return [cloneSeat(seats[0]), cloneSeat(seats[1]), cloneSeat(seats[2]), cloneSeat(seats[3])];
}

// =====================
// seatPlayers 显示信息
// =====================

function resolveSeatPlayers(
  paipuData: Record<string, unknown> | null | undefined,
  bindings?: Map<number, MajsoulAccountBinding>,
): [SeatPlayerDisplay, SeatPlayerDisplay, SeatPlayerDisplay, SeatPlayerDisplay] {
  const fallback = (s: number): SeatPlayerDisplay => ({ seat: s, nickname: `第${s + 1}席` });
  const out: SeatPlayerDisplay[] = [fallback(0), fallback(1), fallback(2), fallback(3)];
  const pushList = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      const o = asRecord(raw);
      if (!o) continue;
      const seat = Number(o.seat);
      if (Number.isNaN(seat) || seat < 0 || seat > 3) continue;
      const aid = Number(o.accountId ?? o.account_id ?? NaN);
      const rawNick = String(o.nickName ?? o.nickname ?? o.name ?? '').trim();
      const bound = Number.isFinite(aid) ? bindings?.get(aid) : undefined;
      if (bound) {
        out[seat] = { seat, nickname: bound.nickname, ...(bound.avatar ? { avatar: bound.avatar } : {}) };
      } else if (rawNick) {
        out[seat] = { seat, nickname: rawNick };
      } else if (Number.isFinite(aid)) {
        out[seat] = { seat, nickname: `UID ${aid}` };
      }
    }
  };
  pushList(paipuData?.players);
  pushList(asRecord(paipuData?.majsoul_record_detail)?.players);
  return out as [SeatPlayerDisplay, SeatPlayerDisplay, SeatPlayerDisplay, SeatPlayerDisplay];
}

// =====================
// 单局帧推进
// =====================

interface RoundState {
  chang: number;
  ju: number;
  ben: number;
  dealerSeat: number;
  riichibou: number;
  doras: string[];
  wallRemaining: number;
  seats: [SeatState, SeatState, SeatState, SeatState];
}

function emptyDiscardForSeat(): DiscardTile[] {
  return [];
}

function newSeatState(initialHand: string[], isDealer: boolean, score: number): SeatState {
  const hand = sortTiles(initialHand);
  // 亲家初始 14 张：分离最后一张作为「刚摸到的」便于第一打体感更直观
  // 但雀魂牌谱里 NewRound 之后会立刻进入 RecordDiscardTile（亲家直接打），
  // 没有显式 RecordDealTile —— 因此这里把第 14 张视作 draw 拆开展示。
  let draw: string | null = null;
  let hand13: string[] = hand;
  if (isDealer && hand.length === 14) {
    // 取最后一张（最大者）作为初始摸
    draw = hand[hand.length - 1];
    hand13 = hand.slice(0, -1);
  }
  return {
    hand: hand13,
    draw,
    discards: emptyDiscardForSeat(),
    melds: [],
    riichi: false,
    riichiAccepted: false,
    score,
    isDealer,
    tingpais: null,
  };
}

function removeTileFromSeat(seat: SeatState, tile: string): boolean {
  if (seat.draw === tile) {
    seat.draw = null;
    return true;
  }
  const idx = seat.hand.indexOf(tile);
  if (idx >= 0) {
    seat.hand.splice(idx, 1);
    return true;
  }
  // 红五兼容：0m/5m 不区分时尝试一次
  if (tile === '0m' || tile === '0p' || tile === '0s') {
    const norm = '5' + tile[1];
    const i2 = seat.hand.indexOf(norm);
    if (i2 >= 0) {
      seat.hand.splice(i2, 1);
      return true;
    }
  }
  if (tile === '5m' || tile === '5p' || tile === '5s') {
    const red = '0' + tile[0];
    const i2 = seat.hand.indexOf(red);
    if (i2 >= 0) {
      seat.hand.splice(i2, 1);
      return true;
    }
  }
  return false;
}

function buildChiPongKanMeld(
  meldKind: MeldKind,
  selfSeat: number,
  fromSeat: number,
  calledTile: string,
  tilesAll: string[],
): Meld {
  // tilesAll 为副露的完整 3 / 4 张（雀魂顺序）
  // 横置位置由 selfSeat 与 fromSeat 的相对关系决定：
  //   下家(fromSeat = selfSeat-1 mod 4)：横置在左
  //   对家(fromSeat = selfSeat-2 mod 4 = selfSeat+2 mod 4)：横置在中
  //   上家(fromSeat = selfSeat+1 mod 4)：横置在右
  // 但是吃 (chi) 只能从上家鸣，所以横置在右
  const rel = ((fromSeat - selfSeat) % 4 + 4) % 4;
  // 0=自家(不可能), 1=下家, 2=对家, 3=上家
  let sidewaysPos: 'left' | 'mid' | 'right' = 'left';
  if (rel === 3) sidewaysPos = 'right';
  else if (rel === 2) sidewaysPos = 'mid';
  else sidewaysPos = 'left';

  if (meldKind === 'chi') sidewaysPos = 'right';

  // 取出 tilesAll 中的「与 calledTile 相同的一张」作为横置牌；其余按出现顺序填充
  const others: string[] = [];
  let consumedCalled = false;
  for (const t of tilesAll) {
    if (!consumedCalled && t === calledTile) {
      consumedCalled = true;
      continue;
    }
    others.push(t);
  }
  if (!consumedCalled) {
    // fallback：直接拼接
    others.length = 0;
    others.push(...tilesAll.slice(1));
  }

  // 排列：自家牌按升序 + 在 sidewaysPos 插入 calledTile（横置）
  const sortedOthers = meldKind === 'chi' ? sortTiles(others) : others;
  const tiles: MeldTile[] = [];
  const callTile: MeldTile = { tile: calledTile, sideways: true, stacked: false };
  if (sidewaysPos === 'left') {
    tiles.push(callTile);
    for (const t of sortedOthers) tiles.push({ tile: t, sideways: false, stacked: false });
  } else if (sidewaysPos === 'right') {
    for (const t of sortedOthers) tiles.push({ tile: t, sideways: false, stacked: false });
    tiles.push(callTile);
  } else {
    if (sortedOthers.length > 0) tiles.push({ tile: sortedOthers[0], sideways: false, stacked: false });
    tiles.push(callTile);
    for (let i = 1; i < sortedOthers.length; i++) tiles.push({ tile: sortedOthers[i], sideways: false, stacked: false });
  }

  return { kind: meldKind, tiles, fromSeat };
}

function applyKakanToMeld(meld: Meld, addTile: string): void {
  // 找到原碰牌中一张横置位置，并在其上叠加加杠牌
  // 直接把首个 sideways=true 的 tile 标记为 stacked + 加 addTile
  const idx = meld.tiles.findIndex((t) => t.sideways);
  if (idx < 0) {
    // 兜底：直接追加
    meld.tiles.push({ tile: addTile, sideways: true, stacked: true });
    return;
  }
  meld.tiles.splice(idx + 1, 0, { tile: addTile, sideways: true, stacked: true });
  meld.kind = 'kakan';
}

function buildAnkanMeld(tilesAll: string[]): Meld {
  // 暗杠：4 张同张（其中两张盖牌，两张明牌）
  // 取 tilesAll 第 0、3 张为盖牌
  const sorted = [...tilesAll];
  // 排列规则：盖、明、明、盖
  const order = [0, 1, 2, 3];
  if (sorted.length === 4) {
    const r: MeldTile[] = [];
    const indices = [0, 1, 2, 3];
    indices[0] = order[0];
    indices[3] = order[3];
    r.push({ tile: sorted[indices[0]], sideways: false, stacked: false }); // 盖
    r.push({ tile: sorted[indices[1]], sideways: false, stacked: false });
    r.push({ tile: sorted[indices[2]], sideways: false, stacked: false });
    r.push({ tile: sorted[indices[3]], sideways: false, stacked: false }); // 盖
    return { kind: 'ankan', tiles: r };
  }
  return {
    kind: 'ankan',
    tiles: sorted.map((t) => ({ tile: t, sideways: false, stacked: false })),
  };
}

function markCalledFromDiscard(seat: SeatState, tile: string): void {
  for (let i = seat.discards.length - 1; i >= 0; i--) {
    if (!seat.discards[i].called && seat.discards[i].tile === tile) {
      seat.discards[i].called = true;
      return;
    }
  }
  // 红五兼容
  const altPair: Record<string, string> = { '0m': '5m', '5m': '0m', '0p': '5p', '5p': '0p', '0s': '5s', '5s': '0s' };
  const alt = altPair[tile];
  if (!alt) return;
  for (let i = seat.discards.length - 1; i >= 0; i--) {
    if (!seat.discards[i].called && seat.discards[i].tile === alt) {
      seat.discards[i].called = true;
      return;
    }
  }
}

function tingpaisFromData(d: Record<string, unknown>): { tile: string; count: number }[] | null {
  const arr = d.tingpais ?? d.tingPais;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: { tile: string; count: number }[] = [];
  for (const raw of arr) {
    const o = asRecord(raw);
    if (!o) continue;
    const tile = String(o.tile ?? '');
    if (!tile) continue;
    const count = asNumber(o.count ?? o.count_zimo, 0);
    out.push({ tile, count });
  }
  return out.length ? out : null;
}

function fansSummary(h: Record<string, unknown>): { name: string; val: number }[] {
  const arr = h.fans;
  if (!Array.isArray(arr)) return [];
  const out: { name: string; val: number }[] = [];
  for (const raw of arr) {
    const o = asRecord(raw);
    if (!o) continue;
    out.push({
      name: String(o.name ?? (o.id != null ? `#${o.id}` : '')),
      val: asNumber(o.val, 0),
    });
  }
  return out;
}

function huPoints(h: Record<string, unknown>): number {
  return (
    asNumber(h.point_rong, 0) ||
    asNumber(h.point_sum, 0) ||
    asNumber(h.point_zimo, 0) ||
    asNumber(h.dadian, 0)
  );
}

function buildHuleBrief(h: Record<string, unknown>, _dealerSeat: number, baseDoras: string[]): HuleInfoBrief {
  const seat = asNumber(h.seat, 0);
  const zimo = Boolean(h.zimo);
  // 荣和方支付者：data.delta_scores 最负的座位
  const fromSeat = zimo ? seat : -1;
  return {
    seat,
    zimo,
    fromSeat,
    points: huPoints(h),
    fans: fansSummary(h),
    yiman: Boolean(h.yiman),
    liqi: Boolean(h.liqi),
    doras: arrayOfStrings(h.doras).length ? arrayOfStrings(h.doras) : baseDoras,
    liDoras: arrayOfStrings(h.li_doras ?? h.liDoras),
    hand: arrayOfStrings(h.hand),
    ming: arrayOfStrings(h.ming),
    huTile: String(h.hu_tile ?? h.huTile ?? ''),
    fu: asNumber(h.fu, 0),
    // dealerSeat 已在外层使用，不在此结构存
  } satisfies HuleInfoBrief & { dealerSeat?: number } as HuleInfoBrief;
}

// =====================
// 主入口
// =====================

export function buildPaipuReplayModel(
  paipuData: Record<string, unknown> | null | undefined,
  options?: { accountBindings?: Map<number, MajsoulAccountBinding> },
): PaipuReplayModel {
  const actions = extractPaipuActions(paipuData ?? undefined);
  const seatPlayers = resolveSeatPlayers(paipuData, options?.accountBindings);
  if (actions.length === 0) {
    return { rounds: [], seatPlayers, hasData: false };
  }

  const rounds: ReplayRound[] = [];
  let state: RoundState | null = null;
  let currentRound: ReplayRound | null = null;

  const pushFrame = (
    kind: FrameKind,
    actorSeat: number | null,
    step: number,
    actionIndex: number,
    summary: FrameSummary,
    extras?: Partial<Pick<Frame, 'hules' | 'liujuType' | 'noTileInfo' | 'uraDoraIndicators'>>,
  ): void => {
    if (!state || !currentRound) return;
    const frame: Frame = {
      step,
      actionIndex,
      kind,
      actorSeat,
      seats: cloneSeats(state.seats),
      riichibou: state.riichibou,
      doraIndicators: [...state.doras],
      uraDoraIndicators: extras?.uraDoraIndicators ?? [],
      wallRemaining: state.wallRemaining,
      summary,
    };
    if (extras?.hules) frame.hules = extras.hules;
    if (extras?.liujuType != null) frame.liujuType = extras.liujuType;
    if (extras?.noTileInfo) frame.noTileInfo = extras.noTileInfo;
    currentRound.frames.push(frame);
  };

  actions.forEach((raw, actionIndex) => {
    const o = asRecord(raw);
    if (!o) return;
    const name = String(o.name ?? '');
    const data = asRecord(o.data) ?? {};
    const step = asNumber(o.step, 0);

    if (name.endsWith('RecordNewRound')) {
      // 启动新局
      const chang = asNumber(data.chang, 0);
      const ju = asNumber(data.ju, 0);
      const ben = asNumber(data.ben, 0);
      const op = asRecord(data.operation);
      const dealer = op != null ? asNumber(op.seat, ju % 4) : ju % 4;

      const initScoresRaw = Array.isArray(data.scores) ? data.scores : [];
      const initScores: [number, number, number, number] = [
        asNumber(initScoresRaw[0], 25000),
        asNumber(initScoresRaw[1], 25000),
        asNumber(initScoresRaw[2], 25000),
        asNumber(initScoresRaw[3], 25000),
      ];
      const initRiichibou = asNumber(data.liqibang, 0);
      const doras = arrayOfStrings(data.doras);
      const wall = asNumber(data.left_tile_count, 70);
      const paishan = splitPaishan(data.paishan);

      const tiles0 = arrayOfStrings(data.tiles0);
      const tiles1 = arrayOfStrings(data.tiles1);
      const tiles2 = arrayOfStrings(data.tiles2);
      const tiles3 = arrayOfStrings(data.tiles3);

      const seats: [SeatState, SeatState, SeatState, SeatState] = [
        newSeatState(tiles0, dealer === 0, initScores[0]),
        newSeatState(tiles1, dealer === 1, initScores[1]),
        newSeatState(tiles2, dealer === 2, initScores[2]),
        newSeatState(tiles3, dealer === 3, initScores[3]),
      ];

      state = {
        chang,
        ju,
        ben,
        dealerSeat: dealer,
        riichibou: initRiichibou,
        doras: doras.length ? doras : [],
        wallRemaining: wall,
        seats,
      };

      currentRound = {
        index: rounds.length,
        chang,
        ju,
        ben,
        dealerSeat: dealer,
        initialScores: initScores,
        initialRiichibou: initRiichibou,
        paishan,
        frames: [],
        endKind: null,
      };
      rounds.push(currentRound);

      pushFrame('newround', null, step, actionIndex, {
        kind: 'newround',
        chang,
        ju,
        ben,
        dealerSeat: dealer,
      });
      return;
    }

    if (!state || !currentRound) return; // 异常牌谱：没有 NewRound 直接出现其他动作

    if (name.endsWith('RecordDealTile')) {
      const seat = asNumber(data.seat, -1);
      const tile = String(data.tile ?? '');
      if (seat >= 0 && seat <= 3 && tile) {
        state.seats[seat].draw = tile;
      }
      // 立直供托：liqi.score 为他立直成功后的分数
      const lq = asRecord(data.liqi);
      if (lq) {
        const lqSeat = asNumber(lq.seat, -1);
        const newScore = asNumber(lq.score, NaN);
        if (lqSeat >= 0 && lqSeat <= 3 && Number.isFinite(newScore)) {
          const prev = state.seats[lqSeat].score;
          const diff = newScore - prev;
          if (diff < 0) {
            state.riichibou += 1; // 立直棒 +1
          }
          state.seats[lqSeat].score = newScore;
          state.seats[lqSeat].riichiAccepted = true;
        }
      }
      const wall = asNumber(data.left_tile_count, state.wallRemaining);
      state.wallRemaining = wall;
      const newDoras = arrayOfStrings(data.doras);
      if (newDoras.length) state.doras = newDoras;

      pushFrame('deal', seat >= 0 ? seat : null, step, actionIndex, { kind: 'deal', seat, tile });
      return;
    }

    if (name.endsWith('RecordDiscardTile')) {
      const seat = asNumber(data.seat, -1);
      const tile = String(data.tile ?? '');
      if (seat >= 0 && seat <= 3 && tile) {
        const ss = state.seats[seat];
        const isLiqi = Boolean(data.is_liqi || data.is_wliqi);
        const moqie = Boolean(data.moqie);
        // 处理手牌：若摸切则直接舍 draw；否则把 draw 并入手牌，再从手牌移除 tile
        if (ss.draw === tile && moqie) {
          ss.draw = null;
        } else {
          if (ss.draw != null) {
            ss.hand.push(ss.draw);
            ss.hand = sortTiles(ss.hand);
            ss.draw = null;
          }
          removeTileFromSeat(ss, tile);
        }
        if (isLiqi) ss.riichi = true;
        ss.discards.push({ tile, sideways: isLiqi, tedashi: !moqie, called: false });
        const tps = tingpaisFromData(data);
        if (tps) ss.tingpais = tps;
        // doras 也可能更新（大明杠后下一帧给出）
        const newDoras = arrayOfStrings(data.doras);
        if (newDoras.length) state.doras = newDoras;
      }
      pushFrame('discard', seat >= 0 ? seat : null, step, actionIndex, {
        kind: 'discard',
        seat,
        tile,
        tedashi: !data.moqie,
        riichi: Boolean(data.is_liqi || data.is_wliqi),
      });
      return;
    }

    if (name.endsWith('RecordChiPengGang')) {
      const seat = asNumber(data.seat, -1);
      const t = asNumber(data.type, 0); // 0 chi, 1 pon, 2 minkan
      const meldKind: MeldKind = t === 0 ? 'chi' : t === 1 ? 'pon' : 'minkan';
      const tilesAll = arrayOfStrings(data.tiles);
      const froms = Array.isArray(data.froms) ? data.froms.map((x) => asNumber(x, -1)) : [];
      let fromSeat = -1;
      let calledTile = tilesAll[tilesAll.length - 1] ?? '';
      for (let i = 0; i < froms.length; i++) {
        if (froms[i] !== seat) {
          fromSeat = froms[i];
          calledTile = tilesAll[i] ?? calledTile;
          break;
        }
      }
      if (seat >= 0 && seat <= 3 && fromSeat >= 0 && fromSeat <= 3) {
        const ss = state.seats[seat];
        // 若有未消费 draw，先并入手牌（吃/碰/明杠都不需要 draw）
        if (ss.draw != null) {
          ss.hand.push(ss.draw);
          ss.hand = sortTiles(ss.hand);
          ss.draw = null;
        }
        // 从手牌移除非 calledTile 的牌
        const consumed = [...tilesAll];
        const calledIdx = consumed.indexOf(calledTile);
        if (calledIdx >= 0) consumed.splice(calledIdx, 1);
        for (const c of consumed) removeTileFromSeat(ss, c);

        ss.melds.push(buildChiPongKanMeld(meldKind, seat, fromSeat, calledTile, tilesAll));
        markCalledFromDiscard(state.seats[fromSeat], calledTile);
        // 鸣牌后 tingpais 清空（不一定准确，但常见）
        ss.tingpais = null;
      }
      pushFrame('chipenggang', seat >= 0 ? seat : null, step, actionIndex, {
        kind: 'chipenggang',
        seat,
        meldKind: meldKind as 'chi' | 'pon' | 'minkan',
        tile: calledTile,
        fromSeat,
      });
      return;
    }

    if (name.endsWith('RecordAnGangAddGang')) {
      const seat = asNumber(data.seat, -1);
      const t = asNumber(data.type, 0); // 2 ankan, 3 kakan
      const tilesField = data.tiles;
      const tileStr =
        typeof tilesField === 'string'
          ? tilesField
          : Array.isArray(tilesField) && tilesField.length
            ? String(tilesField[0])
            : '';
      if (seat >= 0 && seat <= 3 && tileStr) {
        const ss = state.seats[seat];
        if (t === 2) {
          // ankan：移除 4 张同张
          // 把 draw 并入手牌
          if (ss.draw != null) {
            ss.hand.push(ss.draw);
            ss.hand = sortTiles(ss.hand);
            ss.draw = null;
          }
          // 尝试从手牌移除 4 张同张（含红五兼容）
          const want = tileStr;
          const altPair: Record<string, string> = {
            '0m': '5m', '5m': '0m', '0p': '5p', '5p': '0p', '0s': '5s', '5s': '0s',
          };
          const alt = altPair[want];
          const four: string[] = [];
          for (let k = 0; k < 4; k++) {
            const i1 = ss.hand.indexOf(want);
            if (i1 >= 0) {
              four.push(ss.hand[i1]);
              ss.hand.splice(i1, 1);
              continue;
            }
            if (alt) {
              const i2 = ss.hand.indexOf(alt);
              if (i2 >= 0) {
                four.push(ss.hand[i2]);
                ss.hand.splice(i2, 1);
              }
            }
          }
          while (four.length < 4) four.push(want);
          ss.melds.push(buildAnkanMeld(four));
        } else {
          // kakan：从手牌移除 1 张 tileStr，并把它加到已有的碰中
          if (!removeTileFromSeat(ss, tileStr)) {
            // 兜底：从 draw 移除
            if (ss.draw === tileStr) ss.draw = null;
          }
          const meld = ss.melds.find((m) => m.kind === 'pon' && m.tiles.some((tt) => tt.tile === tileStr || (tileStr === '5m' && tt.tile === '0m') || (tileStr === '0m' && tt.tile === '5m') || (tileStr === '5p' && tt.tile === '0p') || (tileStr === '0p' && tt.tile === '5p') || (tileStr === '5s' && tt.tile === '0s') || (tileStr === '0s' && tt.tile === '5s')));
          if (meld) applyKakanToMeld(meld, tileStr);
          else ss.melds.push({ kind: 'kakan', tiles: [{ tile: tileStr, sideways: true, stacked: true }] });
        }
        ss.tingpais = null;
      }
      pushFrame('gangadd', seat >= 0 ? seat : null, step, actionIndex, {
        kind: 'gangadd',
        seat,
        meldKind: t === 2 ? 'ankan' : 'kakan',
        tile: tileStr,
      });
      return;
    }

    if (name.endsWith('RecordHule')) {
      const hulesRaw = Array.isArray(data.hules) ? data.hules : [];
      const deltas = Array.isArray(data.delta_scores ?? data.deltaScores)
        ? (data.delta_scores ?? data.deltaScores) as unknown[]
        : [];
      const scores = Array.isArray(data.scores) ? data.scores : [];
      const briefs: HuleInfoBrief[] = [];
      let ura: string[] = [];
      let bestHule: Record<string, unknown> | null = null;
      for (const raw of hulesRaw) {
        const h = asRecord(raw);
        if (!h) continue;
        const brief = buildHuleBrief(h, state.dealerSeat, state.doras);
        // 局末新增 dora 用 hule 中的 doras（如有）
        if (brief.doras.length > state.doras.length) state.doras = brief.doras;
        if (brief.liDoras.length) ura = brief.liDoras;
        // 推断 fromSeat（荣和的支付方）
        if (!brief.zimo && Array.isArray(deltas) && deltas.length >= 4) {
          let minV = 0;
          let p = -1;
          for (let i = 0; i < 4; i++) {
            const v = asNumber(deltas[i], 0);
            if (v < minV) { minV = v; p = i; }
          }
          brief.fromSeat = p;
        }
        briefs.push(brief);
        bestHule = h;
      }
      // 更新分数
      if (scores.length >= 4) {
        for (let s = 0; s < 4; s++) state.seats[s].score = asNumber(scores[s], state.seats[s].score);
      }
      // 立直棒清零（被胜者拿走）
      state.riichibou = 0;
      currentRound.endKind = 'hule';
      if (deltas.length >= 4) {
        currentRound.endDeltas = [
          asNumber(deltas[0], 0),
          asNumber(deltas[1], 0),
          asNumber(deltas[2], 0),
          asNumber(deltas[3], 0),
        ];
      }
      if (scores.length >= 4) {
        currentRound.endScores = [
          asNumber(scores[0], 0),
          asNumber(scores[1], 0),
          asNumber(scores[2], 0),
          asNumber(scores[3], 0),
        ];
      }
      void bestHule;
      pushFrame('hule', null, step, actionIndex, {
        kind: 'hule',
        seats: briefs.map((b) => b.seat),
        zimo: briefs.length === 1 && briefs[0].zimo,
      }, { hules: briefs, uraDoraIndicators: ura });
      return;
    }

    if (name.endsWith('RecordLiuJu')) {
      const ljType = asNumber(data.type, 0);
      currentRound.endKind = 'liuju';
      pushFrame('liuju', null, step, actionIndex, { kind: 'liuju', liujuType: ljType }, { liujuType: ljType });
      return;
    }

    if (name.endsWith('RecordNoTile')) {
      // 各家是否听牌
      const tenpai: [boolean, boolean, boolean, boolean] = [false, false, false, false];
      const ps = data.players ?? (data as { Players?: unknown }).Players;
      if (Array.isArray(ps)) {
        ps.forEach((raw, i) => {
          const pr = asRecord(raw);
          if (!pr) return;
          const seat = asNumber(pr.seat, i);
          if (seat < 0 || seat > 3) return;
          const tb = Boolean(pr.tingpai ?? pr.tingPai ?? (Array.isArray(pr.tings) ? pr.tings.length > 0 : false));
          tenpai[seat] = tb;
        });
      }
      // delta_scores
      const deltasRaw = Array.isArray(data.delta_scores ?? data.deltaScores)
        ? (data.delta_scores ?? data.deltaScores) as unknown[]
        : [];
      const deltas: [number, number, number, number] = [
        asNumber(deltasRaw[0], 0),
        asNumber(deltasRaw[1], 0),
        asNumber(deltasRaw[2], 0),
        asNumber(deltasRaw[3], 0),
      ];
      // 更新分数（按 scores 字段或基于 deltas）
      const scoresRaw = Array.isArray(data.scores) ? data.scores : [];
      if (scoresRaw.length >= 4 && typeof scoresRaw[0] !== 'object') {
        for (let s = 0; s < 4; s++) state.seats[s].score = asNumber(scoresRaw[s], state.seats[s].score);
      } else {
        for (let s = 0; s < 4; s++) state.seats[s].score += deltas[s];
      }
      currentRound.endKind = 'notile';
      currentRound.endDeltas = deltas;
      currentRound.endScores = [
        state.seats[0].score,
        state.seats[1].score,
        state.seats[2].score,
        state.seats[3].score,
      ];
      pushFrame('notile', null, step, actionIndex, { kind: 'notile' }, { noTileInfo: { tenpai, deltas } });
      return;
    }

    // 其他类型（如 RecordGangResult）：仅记录一个轻量帧
    pushFrame('other', null, step, actionIndex, { kind: 'other', raw: name });
  });

  return {
    rounds,
    seatPlayers,
    hasData: rounds.length > 0 && rounds.some((r) => r.frames.length > 0),
  };
}

// =====================
// 工具：UI 辅助
// =====================

/** 自风偏移：0 东(亲) 1 南 2 西 3 北 */
export function roundWindIndexForSeat(seat: number, dealerSeat: number): number {
  return (((seat - dealerSeat) % 4) + 4) % 4;
}

/** 雀魂 ChiPengGang.type 数字 → 副露种类 */
export function chipengTypeToKind(t: number): MeldKind {
  if (t === 0) return 'chi';
  if (t === 1) return 'pon';
  return 'minkan';
}

/** 计算「宝牌指示牌」对应的实际宝牌字符串（仅作显示用，不影响计算） */
export function indicatorToDora(indicator: string): string {
  if (!indicator || indicator.length !== 2) return indicator;
  const n = indicator[0];
  const s = indicator[1];
  if (s === 'z') {
    // 字牌循环：东南西北、白发中
    if (n === '4') return '1z'; // 北→东
    if (n === '7') return '5z'; // 中→白
    const next = String(parseInt(n, 10) + 1);
    return `${next}z`;
  }
  // 数牌（含红五）：0(=5)→6, 9→1
  let num = parseInt(n, 10);
  if (num === 0) num = 5; // 红五归一到 5 来推下一张
  let next = num + 1;
  if (next > 9) next = 1;
  return `${next}${s}`;
}

/**
 * 调试用：返回某一帧的简要文字描述（不含本地化，仅用于 fallback）
 */
export function frameSummaryText(f: Frame): string {
  switch (f.summary.kind) {
    case 'newround':
      return `第 ${f.summary.chang}场 ${f.summary.ju + 1}局 ${f.summary.ben}本场 开始`;
    case 'deal':
      return `座位 ${f.summary.seat + 1} 摸 ${f.summary.tile}`;
    case 'discard':
      return `座位 ${f.summary.seat + 1} ${f.summary.riichi ? '立直 ' : ''}打 ${f.summary.tile}${f.summary.tedashi ? '（手切）' : '（摸切）'}`;
    case 'chipenggang':
      return `座位 ${f.summary.seat + 1} ${f.summary.meldKind === 'chi' ? '吃' : f.summary.meldKind === 'pon' ? '碰' : '明杠'} ${f.summary.tile}（来自 ${f.summary.fromSeat + 1}）`;
    case 'gangadd':
      return `座位 ${f.summary.seat + 1} ${f.summary.meldKind === 'ankan' ? '暗杠' : '加杠'} ${f.summary.tile}`;
    case 'hule':
      return `和牌（${f.summary.zimo ? '自摸' : '荣和'}）`;
    case 'liuju':
      return '途中流局';
    case 'notile':
      return '荒牌流局';
    default:
      return f.summary.kind === 'other' ? f.summary.raw : '';
  }
}
