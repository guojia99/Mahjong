/**
 * 从 Game.paipu_data（Node --detail / majsoul_record_detail）解析牌谱步进，供 UI 展示。
 * 纯前端、只读 actions，不请求后端。
 */

export interface PaipuHandScoreRow {
  /** 牌谱内部座位索引 0–3（展示时用 displayPaipuSeat） */
  seat: number;
  nickname: string;
  /** 与网站选手绑定时：网站头像 URL */
  avatar?: string;
  /** 本局是否曾宣言立直（至该局结算为止） */
  wasRiichi: boolean;
  /**
   * 与「纯和牌点」之差：立直棒、本场棒等（仅和牌且能从 point_zimo_* / point_rong 推算时给出，否则 null）
   */
  stickHonbaDelta: number | null;
  /**
   * 本局立直宣言时支付的供托（来自 RecordDealTile.liqi.score 与此前分数差，多为 -1000；无记录为 0）
   */
  riichiDeposit: number;
  delta: number | null;
  /** 相对当巡亲家的自风：0 东(亲) 1 南 2 西 3 北 */
  roundWindIndex: number;
}

export interface PaipuHuleBrief {
  /** 牌谱内部座位 0–3 */
  seat: number;
  nickname: string;
  avatar?: string;
  zimo: boolean;
  points: number;
  fanSummary?: string;
  roundWindIndex: number;
}

export interface PaipuHandResultBlock {
  id: string;
  step: number;
  roundLabel: string;
  benSuffix: string;
  kind: 'hule' | 'liuju' | 'notile' | 'gang' | 'other';
  titleKey: 'hule' | 'liuju' | 'notile' | 'gang' | 'other';
  scoreRows: PaipuHandScoreRow[];
  hules: PaipuHuleBrief[];
  extraNote?: string;
  /** 荒牌流局：各座位是否听牌（与 seat 下标一致） */
  notileTenpai?: boolean[];
}

export interface PaipuSeatStatRow {
  /** 牌谱内部座位 0–3 */
  seat: number;
  nickname: string;
  avatar?: string;
  /** 终局时该席点数（来自最后一局结算后的 scores；无记录为 null） */
  finalScore: number | null;
  ron: number;
  tsumo: number;
  dealIn: number;
  riichi: number;
  maxDealPoint: number;
}

export interface PaipuDetailModel {
  handBlocks: PaipuHandResultBlock[];
  seatStats: PaipuSeatStatRow[];
  hasData: boolean;
}

/** accountId（雀魂 UID）→ 网站选手昵称与头像 */
export interface MajsoulAccountBinding {
  nickname: string;
  avatar?: string;
}

export interface PaipuDetailBuildOptions {
  /** accountId → 网站选手昵称与头像（优先） */
  accountBindings?: Map<number, MajsoulAccountBinding>;
  /** @deprecated 请用 accountBindings；仅昵称、无头像 */
  accountDisplayNames?: Map<number, string>;
}

/** 牌谱内部座位 0–3 → 展示用 1–4（桌上不显示从 0 起） */
export function displayPaipuSeat(seat: number): number {
  return seat + 1;
}

const ROUND_WIND = ['東', '南', '西', '北'] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 从 paipu_data 取 actions（兼容顶层与 majsoul_record_detail） */
export function extractPaipuActions(paipuData: Record<string, unknown> | undefined | null): unknown[] {
  if (!paipuData) return [];
  const top = paipuData.actions;
  if (Array.isArray(top)) return top;
  const nested = asRecord(paipuData.majsoul_record_detail)?.actions;
  if (Array.isArray(nested)) return nested;
  return [];
}

/** 根据对局选手的 majsoul UID 绑定，生成 accountId → 网站昵称与头像 */
export function buildMajsoulAccountBindings(
  gamePlayers: {
    player: {
      nickname: string;
      avatar?: string | null;
      majsoul_uids?: number[];
      majsoul_accounts?: { uid: number }[];
    };
  }[],
): Map<number, MajsoulAccountBinding> {
  const m = new Map<number, MajsoulAccountBinding>();
  for (const gp of gamePlayers) {
    const nick = gp.player.nickname;
    const avRaw = gp.player.avatar;
    const av = avRaw != null && String(avRaw).trim() ? String(avRaw).trim() : undefined;
    const binding: MajsoulAccountBinding = av ? { nickname: nick, avatar: av } : { nickname: nick };
    for (const u of gp.player.majsoul_uids ?? []) {
      const id = Number(u);
      if (Number.isFinite(id)) m.set(id, binding);
    }
    for (const acc of gp.player.majsoul_accounts ?? []) {
      if (acc?.uid != null) {
        const id = Number(acc.uid);
        if (Number.isFinite(id)) m.set(id, binding);
      }
    }
  }
  return m;
}

/** 仅昵称映射（兼容旧调用） */
export function buildMajsoulAccountDisplayMap(
  gamePlayers: {
    player: {
      nickname: string;
      majsoul_uids?: number[];
      majsoul_accounts?: { uid: number }[];
    };
  }[],
): Map<number, string> {
  const b = buildMajsoulAccountBindings(gamePlayers);
  return new Map([...b].map(([k, v]) => [k, v.nickname]));
}

function resolveBindingsFromOptions(options?: PaipuDetailBuildOptions): Map<number, MajsoulAccountBinding> | undefined {
  if (options?.accountBindings?.size) return options.accountBindings;
  const legacy = options?.accountDisplayNames;
  if (legacy?.size) {
    return new Map([...legacy].map(([id, nickname]) => [id, { nickname }]));
  }
  return undefined;
}

/** 牌谱单条玩家：本系统绑定昵称/头像 > 牌谱 nickName > UID 兜底（不出现「座位 0」） */
function resolvePlayerDisplay(
  o: Record<string, unknown>,
  accountBindings?: Map<number, MajsoulAccountBinding>,
): { nickname: string; avatar?: string } {
  const aidRaw = o.accountId ?? o.account_id;
  const aid = aidRaw != null ? Number(aidRaw) : NaN;
  const rawNick = String(o.nickName ?? o.nickname ?? o.name ?? '').trim();
  if (Number.isFinite(aid) && accountBindings?.has(aid)) {
    const b = accountBindings.get(aid)!;
    return { nickname: b.nickname, ...(b.avatar ? { avatar: b.avatar } : {}) };
  }
  if (rawNick) return { nickname: rawNick };
  if (Number.isFinite(aid)) return { nickname: `UID ${aid}` };
  const seat = Number(o.seat);
  if (!Number.isNaN(seat) && seat >= 0 && seat <= 3) return { nickname: `第${seat + 1}席` };
  return { nickname: '?' };
}

/**
 * 合并 paipu_data.players 与 majsoul_record_detail.players（有的存档只在嵌套里带 players），
 * 按 seat 去重并保留昵称信息更全的一条。
 */
function seatDisplayPlayerMap(
  paipuData: Record<string, unknown> | undefined | null,
  accountBindings?: Map<number, MajsoulAccountBinding>,
): Map<number, { nickname: string; avatar?: string }> {
  const bestEntry = new Map<number, Record<string, unknown>>();
  const pushList = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      const o = asRecord(raw);
      if (!o) continue;
      const seat = Number(o.seat);
      if (Number.isNaN(seat) || seat < 0 || seat > 3) continue;
      const prev = bestEntry.get(seat);
      if (!prev) {
        bestEntry.set(seat, o);
        continue;
      }
      const score = (x: Record<string, unknown>) => {
        const n = String(x.nickName ?? x.nickname ?? x.name ?? '').trim().length;
        const hasAid = x.accountId != null || x.account_id != null ? 1 : 0;
        return n * 10 + hasAid;
      };
      if (score(o) > score(prev)) bestEntry.set(seat, o);
    }
  };

  pushList(paipuData?.players);
  pushList(asRecord(paipuData?.majsoul_record_detail)?.players);

  const m = new Map<number, { nickname: string; avatar?: string }>();
  for (let s = 0; s < 4; s++) {
    const o = bestEntry.get(s);
    m.set(s, o ? resolvePlayerDisplay(o, accountBindings) : { nickname: `第${s + 1}席` });
  }
  return m;
}

function roundWindIndexForSeat(seat: number, dealerSeat: number): number {
  return (((seat - dealerSeat) % 4) + 4) % 4;
}

function roundLabel(chang: number, ju: number, ben: number): { main: string; benSuffix: string } {
  const w = ROUND_WIND[chang] ?? '?';
  const main = `${w} ${ju + 1} 局`;
  const benSuffix = ben > 0 ? `${ben} 本场` : '';
  return { main, benSuffix };
}

function huPoints(h: Record<string, unknown>): number {
  const n = (x: unknown) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  };
  return n(h.point_rong) || n(h.point_zimo) || n(h.point_sum) || n(h.dadian);
}

function fanSummary(h: Record<string, unknown>): string | undefined {
  const fans = h.fans;
  if (!Array.isArray(fans) || fans.length === 0) return undefined;
  const parts: string[] = [];
  for (const f of fans) {
    const fr = asRecord(f);
    if (!fr) continue;
    const name = fr.name != null ? String(fr.name) : fr.id != null ? `#${fr.id}` : '';
    const val = fr.val != null ? String(fr.val) : '';
    if (name || val) parts.push(val ? `${name}×${val}` : name);
  }
  return parts.length ? parts.join('、') : undefined;
}

const LIUJU_TYPE_LABEL: Record<number, string> = {
  1: '流局满贯',
  2: '九种九牌',
  3: '四风连打',
  4: '四杠散了',
  5: '四家立直',
};

function liujuTitle(type: unknown): string {
  const t = Number(type);
  if (Number.isFinite(t) && LIUJU_TYPE_LABEL[t]) return LIUJU_TYPE_LABEL[t];
  return `流局（type=${type ?? '?'}）`;
}

function readNumArray(obj: Record<string, unknown>, snake: string, camel: string): number[] {
  const raw = obj[snake] ?? obj[camel];
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (Number.isFinite(Number(x)) ? Number(x) : 0));
}

function readNullableNumArray(obj: Record<string, unknown>, snake: string, camel: string): (number | null)[] {
  const raw = obj[snake] ?? obj[camel];
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (Number.isFinite(Number(x)) ? Number(x) : null));
}

/** 合并 RecordNoTile 等结构里多条 scores 行的 delta */
function aggregateSeatDeltas(data: Record<string, unknown>): number[] | null {
  const top = readNumArray(data, 'delta_scores', 'deltaScores');
  if (top.length >= 4) {
    const row = top.slice(0, 4);
    if (row.some((x) => x !== 0)) return row;
  }

  const merged = [0, 0, 0, 0];
  let any = false;
  const scores = data.scores;
  if (Array.isArray(scores)) {
    for (const raw of scores) {
      const row = asRecord(raw);
      if (!row) continue;
      const ds = readNumArray(row, 'delta_scores', 'deltaScores');
      for (let i = 0; i < 4 && i < ds.length; i++) {
        merged[i] += ds[i] ?? 0;
        if (ds[i]) any = true;
      }
    }
  }
  return any ? merged : null;
}

/** 将 delta_scores 转为与座位对齐的实数（缺省按 0，便于与推算基数相减） */
function actualDeltasAsNumbers(deltas: (number | null)[]): number[] {
  return [0, 1, 2, 3].map((s) => (s < deltas.length && deltas[s] != null && Number.isFinite(Number(deltas[s])) ? Number(deltas[s]) : 0));
}

/**
 * 按首条和牌信息推算「仅和牌点」造成的得失（不含立直棒、本场等）。
 * 双响等多条 hules 时返回 null。
 */
function baseDeltasFromHuleData(data: Record<string, unknown>, dealerSeat: number): number[] | null {
  const rawHules = data.hules;
  if (!Array.isArray(rawHules) || rawHules.length !== 1) return null;
  const h = asRecord(rawHules[0]);
  if (!h) return null;
  const winner = Number(h.seat);
  if (Number.isNaN(winner) || winner < 0 || winner > 3) return null;
  const zimo = Boolean(h.zimo);
  const base = [0, 0, 0, 0];
  if (zimo) {
    const qin = Number(h.point_zimo_qin);
    const xian = Number(h.point_zimo_xian);
    if (!Number.isFinite(qin) || !Number.isFinite(xian)) return null;
    if (winner === dealerSeat) {
      for (let s = 0; s < 4; s++) {
        if (s === winner) continue;
        base[s] = -qin;
      }
    } else {
      for (let s = 0; s < 4; s++) {
        if (s === winner) continue;
        base[s] = -(s === dealerSeat ? qin : xian);
      }
    }
    let sumPay = 0;
    for (let s = 0; s < 4; s++) sumPay += base[s];
    base[winner] = -sumPay;
    return base;
  }
  const pr = Number(h.point_rong);
  if (!Number.isFinite(pr) || pr <= 0) return null;
  const actual = actualDeltasAsNumbers(readNullableNumArray(data, 'delta_scores', 'deltaScores'));
  let payer = -1;
  for (let s = 0; s < 4; s++) {
    if (s === winner) continue;
    if (actual[s] === -pr) {
      payer = s;
      break;
    }
  }
  if (payer < 0) {
    let minV = 0;
    for (let s = 0; s < 4; s++) {
      if (s === winner) continue;
      if (actual[s] < minV) {
        minV = actual[s];
        payer = s;
      }
    }
  }
  if (payer < 0 || payer === winner) return null;
  base[payer] = -pr;
  base[winner] = pr;
  return base;
}

function stickHonbaExtraDeltas(data: Record<string, unknown>, dealerSeat: number): number[] | null {
  const base = baseDeltasFromHuleData(data, dealerSeat);
  if (!base) return null;
  const actual = actualDeltasAsNumbers(readNullableNumArray(data, 'delta_scores', 'deltaScores'));
  return base.map((b, i) => actual[i] - b);
}

function readFourScores(data: Record<string, unknown>): number[] | null {
  const sc = data.scores;
  if (!Array.isArray(sc) || sc.length < 4) return null;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const v = Number(sc[i]);
    if (!Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

function parseNoTileTenpai(data: Record<string, unknown>): boolean[] {
  const res = [false, false, false, false];
  const arr = data.players;
  if (!Array.isArray(arr)) return res;
  for (let i = 0; i < arr.length && i < 4; i++) {
    const p = asRecord(arr[i]);
    if (!p) continue;
    const seatRaw = p.seat;
    const seat =
      seatRaw != null && Number.isFinite(Number(seatRaw)) ? Number(seatRaw) : i;
    if (seat < 0 || seat > 3) continue;
    res[seat] = Boolean(p.tingpai ?? p.tingPai);
  }
  return res;
}

export function buildPaipuDetailModel(
  paipuData: Record<string, unknown> | undefined | null,
  options?: PaipuDetailBuildOptions,
): PaipuDetailModel {
  const actions = extractPaipuActions(paipuData);
  if (actions.length === 0) {
    return { handBlocks: [], seatStats: [], hasData: false };
  }

  const bindings = resolveBindingsFromOptions(options);
  const seatPlayers = seatDisplayPlayerMap(paipuData, bindings);

  let chang = 0;
  let ju = 0;
  let ben = 0;
  let lastRound = roundLabel(0, 0, 0);
  /** 当前局的亲家座位（来自 RecordNewRound.operation.seat） */
  let dealerSeat = 0;

  /** 当前局：各席是否已宣言立直（新局开始时清空） */
  let roundRiichi = [false, false, false, false];
  /** 本局各席立直供托累计（宣言时 score 变动，多为 -1000） */
  let roundRiichiDeposit = [0, 0, 0, 0];
  /** 当前各席得分快照（用于解析 RecordDealTile.liqi 供托） */
  let lastScores: number[] | null = null;
  /** 最后一局结算后的四人点数（用于汇总「最终得分」） */
  let finalTableScores: number[] | null = null;

  const stats: PaipuSeatStatRow[] = [];
  for (let s = 0; s < 4; s++) {
    const p = seatPlayers.get(s) ?? { nickname: `第${s + 1}席` };
    stats.push({
      seat: s,
      nickname: p.nickname,
      ...(p.avatar ? { avatar: p.avatar } : {}),
      finalScore: null,
      ron: 0,
      tsumo: 0,
      dealIn: 0,
      riichi: 0,
      maxDealPoint: 0,
    });
  }

  const handBlocks: PaipuHandResultBlock[] = [];
  let blockId = 0;

  const applyHuleStats = (d: Record<string, unknown>) => {
    const hules = d.hules;
    if (!Array.isArray(hules)) return;
    const deltas = readNullableNumArray(d, 'delta_scores', 'deltaScores');

    let payerSeat = -1;
    if (deltas.length >= 4) {
      let minV = 0;
      for (let i = 0; i < 4; i++) {
        const dv = deltas[i] ?? 0;
        if (dv < minV) {
          minV = dv;
          payerSeat = i;
        }
      }
    }

    let anyRon = false;
    for (const raw of hules) {
      const h = asRecord(raw);
      if (!h) continue;
      const seat = Number(h.seat);
      if (Number.isNaN(seat) || seat < 0 || seat > 3) continue;
      const zimo = Boolean(h.zimo);
      const pts = huPoints(h);
      const st = stats[seat];
      if (st) {
        st.maxDealPoint = Math.max(st.maxDealPoint, pts);
        if (zimo) st.tsumo += 1;
        else {
          st.ron += 1;
          anyRon = true;
        }
      }
    }
    if (anyRon && payerSeat >= 0 && stats[payerSeat]) {
      stats[payerSeat].dealIn += 1;
    }
  };

  for (const act of actions) {
    const o = asRecord(act);
    if (!o) continue;
    const name = String(o.name ?? '');
    const data = asRecord(o.data);
    const step = Number(o.step) || 0;

    if (name.endsWith('RecordNewRound') && data) {
      chang = Number(data.chang) || 0;
      ju = Number(data.ju) || 0;
      ben = Number(data.ben) || 0;
      lastRound = roundLabel(chang, ju, ben);
      const op = asRecord(data.operation);
      const ds = op != null ? Number(op.seat) : NaN;
      if (Number.isFinite(ds) && ds >= 0 && ds <= 3) dealerSeat = ds;
      roundRiichi = [false, false, false, false];
      roundRiichiDeposit = [0, 0, 0, 0];
      const rs0 = readFourScores(data);
      if (rs0) lastScores = [...rs0];
    }

    if (name.endsWith('RecordDealTile') && data) {
      const lq = asRecord(data.liqi);
      if (lq && lastScores) {
        const seat = Number(lq.seat);
        const newScore = Number(lq.score);
        if (Number.isFinite(seat) && seat >= 0 && seat <= 3 && Number.isFinite(newScore)) {
          const prev = lastScores[seat];
          if (Number.isFinite(prev)) {
            const diff = newScore - prev;
            if (diff !== 0) roundRiichiDeposit[seat] += diff;
          }
          lastScores[seat] = newScore;
        }
      }
    }

    if (name.endsWith('RecordDiscardTile') && data) {
      const seat = Number(data.seat);
      if (!Number.isNaN(seat) && seat >= 0 && seat <= 3) {
        if (data.is_liqi || data.is_wliqi) {
          roundRiichi[seat] = true;
          const st = stats[seat];
          if (st) st.riichi += 1;
        }
      }
    }

    if (name.endsWith('RecordHule') && data) {
      applyHuleStats(data);
      const deltas = readNullableNumArray(data, 'delta_scores', 'deltaScores');
      const stickExtra = stickHonbaExtraDeltas(data, dealerSeat);
      const scoreRows: PaipuHandScoreRow[] = [];
      for (let s = 0; s < 4; s++) {
        const dv = s < deltas.length ? deltas[s] : null;
        const p = seatPlayers.get(s) ?? { nickname: `第${s + 1}席` };
        scoreRows.push({
          seat: s,
          nickname: p.nickname,
          ...(p.avatar ? { avatar: p.avatar } : {}),
          wasRiichi: roundRiichi[s],
          stickHonbaDelta: stickExtra != null ? stickExtra[s] : null,
          riichiDeposit: roundRiichiDeposit[s],
          delta: dv ?? null,
          roundWindIndex: roundWindIndexForSeat(s, dealerSeat),
        });
      }
      const hules: PaipuHuleBrief[] = [];
      const rawHules = data.hules;
      if (Array.isArray(rawHules)) {
        for (const raw of rawHules) {
          const h = asRecord(raw);
          if (!h) continue;
          const seat = Number(h.seat);
          if (Number.isNaN(seat) || seat < 0 || seat > 3) continue;
          const hp = seatPlayers.get(seat) ?? { nickname: `第${seat + 1}席` };
          hules.push({
            seat,
            nickname: hp.nickname,
            ...(hp.avatar ? { avatar: hp.avatar } : {}),
            zimo: Boolean(h.zimo),
            points: huPoints(h),
            fanSummary: fanSummary(h),
            roundWindIndex: roundWindIndexForSeat(seat, dealerSeat),
          });
        }
      }
      handBlocks.push({
        id: `hule-${step}-${blockId++}`,
        step,
        roundLabel: lastRound.main,
        benSuffix: lastRound.benSuffix,
        kind: 'hule',
        titleKey: 'hule',
        scoreRows,
        hules,
      });
      const rsH = readFourScores(data);
      if (rsH) {
        lastScores = [...rsH];
        finalTableScores = [...rsH];
      }
    }

    if (name.endsWith('RecordLiuJu') && data) {
      const deltas = readNullableNumArray(data, 'delta_scores', 'deltaScores');
      const rawScores = data.scores;
      const flatScores =
        Array.isArray(rawScores) && rawScores.length > 0 && typeof rawScores[0] !== 'object'
          ? rawScores.map((x) => (Number.isFinite(Number(x)) ? Number(x) : null))
          : [];
      const scoreRows: PaipuHandScoreRow[] = [];
      for (let s = 0; s < 4; s++) {
        const delta = s < deltas.length ? deltas[s] : null;
        const sc = s < flatScores.length ? flatScores[s] : null;
        const lp = seatPlayers.get(s) ?? { nickname: `第${s + 1}席` };
        scoreRows.push({
          seat: s,
          nickname: lp.nickname,
          ...(lp.avatar ? { avatar: lp.avatar } : {}),
          wasRiichi: roundRiichi[s],
          stickHonbaDelta: null,
          riichiDeposit: roundRiichiDeposit[s],
          delta: delta != null ? delta : sc != null ? sc : null,
          roundWindIndex: roundWindIndexForSeat(s, dealerSeat),
        });
      }
      handBlocks.push({
        id: `liuju-${step}-${blockId++}`,
        step,
        roundLabel: lastRound.main,
        benSuffix: lastRound.benSuffix,
        kind: 'liuju',
        titleKey: 'liuju',
        scoreRows,
        hules: [],
        extraNote: liujuTitle(data.type),
      });
      const rsL = readFourScores(data);
      if (rsL) {
        lastScores = [...rsL];
        finalTableScores = [...rsL];
      }
    }

    if (name.endsWith('RecordNoTile') && data) {
      const tenpai = parseNoTileTenpai(data);
      const agg = aggregateSeatDeltas(data);
      const scoreRows: PaipuHandScoreRow[] = [];
      for (let s = 0; s < 4; s++) {
        const np = seatPlayers.get(s) ?? { nickname: `第${s + 1}席` };
        scoreRows.push({
          seat: s,
          nickname: np.nickname,
          ...(np.avatar ? { avatar: np.avatar } : {}),
          wasRiichi: roundRiichi[s],
          stickHonbaDelta: null,
          riichiDeposit: roundRiichiDeposit[s],
          delta: agg ? agg[s] ?? 0 : null,
          roundWindIndex: roundWindIndexForSeat(s, dealerSeat),
        });
      }
      handBlocks.push({
        id: `notile-${step}-${blockId++}`,
        step,
        roundLabel: lastRound.main,
        benSuffix: lastRound.benSuffix,
        kind: 'notile',
        titleKey: 'notile',
        scoreRows,
        hules: [],
        notileTenpai: tenpai,
      });
      const rsN = readFourScores(data);
      if (rsN) {
        lastScores = [...rsN];
        finalTableScores = [...rsN];
      }
    }

    if (name.endsWith('RecordGangResult') && data) {
      const infos = data.gang_infos;
      const parts: string[] = [];
      if (Array.isArray(infos)) {
        for (const g of infos) {
          const gr = asRecord(g);
          if (!gr) continue;
          const seat = Number(gr.seat);
          const tiles = Array.isArray(gr.tiles) ? gr.tiles.map(String).join(',') : '';
          parts.push(`${(seatPlayers.get(seat) ?? { nickname: `第${seat + 1}席` }).nickname}: ${tiles}`);
        }
      }
      handBlocks.push({
        id: `gang-${step}-${blockId++}`,
        step,
        roundLabel: lastRound.main,
        benSuffix: lastRound.benSuffix,
        kind: 'gang',
        titleKey: 'gang',
        scoreRows: [],
        hules: [],
        extraNote: parts.length ? parts.join('；') : undefined,
      });
    }
  }

  if (finalTableScores && finalTableScores.length >= 4) {
    for (let s = 0; s < 4; s++) {
      const v = finalTableScores[s];
      const st = stats[s];
      if (st) st.finalScore = Number.isFinite(v) ? v : null;
    }
  }

  return {
    handBlocks,
    seatStats: stats,
    hasData: handBlocks.length > 0,
  };
}
