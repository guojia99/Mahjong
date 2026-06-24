/** Types and helpers for Mortal AI analysis (Game.ai_analysis / detail API). */

import type { Frame } from '@/paipu/paipuReplayModel';

export interface AiGradeTier {
  grade: string;
  min: number;
}

export interface AiModelInfo {
  key: string;
  name: string;
  version: string;
  model_tag: string;
  analyzed_at?: string;
}

export interface AiAnalysisSummary {
  status: string;
  has_ai_analysis: boolean;
  analyzed_at?: string | null;
  model_key?: string;
  model_tag?: string;
  models?: AiModelInfo[];
  players?: {
    seat: number;
    player_id?: string;
    match_avg: number;
    match_grade: string;
    kyoku: { kyoku_index: number; avg: number; grade: string }[];
  }[];
}

export interface AiDecisionOption {
  action_id?: number;
  label: string;
  type?: string;
  pai?: string;
  q: number;
  pi: number;
  score: number;
  chosen: boolean;
}

export interface AiDecisionRecord {
  action_index: number;
  step?: number;
  kind: string;
  chosen_label: string;
  chosen_score: number;
  chosen_pi: number;
  options: AiDecisionOption[];
}

export interface AiKyokuAnalysis {
  kyoku_index: number;
  avg: number;
  grade: string;
  decisions: AiDecisionRecord[];
}

export interface AiPlayerAnalysis {
  seat: number;
  match_avg: number;
  match_grade: string;
  kyoku: AiKyokuAnalysis[];
}

export interface AiAnalysisFull {
  version: number;
  model_key?: string;
  model_name?: string;
  model_version?: string;
  model_tag: string;
  players: AiPlayerAnalysis[];
}

export interface AiModelDiffRow {
  action_index: number;
  kind: string;
  chosen_label: string;
  /** Human's chosen action (for tile / label rendering). */
  chosen_option: AiDecisionOption | null;
  score_a: number;
  pi_a: number;
  score_b: number;
  pi_b: number;
  score_diff: number;
  pi_diff: number;
  top_label_a: string;
  top_label_b: string;
  top_option_a: AiDecisionOption | null;
  top_option_b: AiDecisionOption | null;
}

export function chosenOption(decision: AiDecisionRecord): AiDecisionOption | null {
  return decision.options.find((o) => o.chosen) ?? null;
}

/** πτ(a|s) × 100 per Mortal FAQ notation. */
export function piTimes100(pi: number): string {
  return (pi * 100).toFixed(2);
}

/** Per-decision comparison between two model analyses for one player/round. */
export function buildModelDiffRows(
  analysisA: AiAnalysisFull,
  analysisB: AiAnalysisFull,
  seat: number,
  roundIndex: number,
): AiModelDiffRow[] {
  const pa = playerAnalysisForSeat(analysisA, seat);
  const pb = playerAnalysisForSeat(analysisB, seat);
  if (!pa || !pb) return [];
  const ka = pa.kyoku.find((k) => k.kyoku_index === roundIndex);
  const kb = pb.kyoku.find((k) => k.kyoku_index === roundIndex);
  if (!ka || !kb) return [];
  const byIndexB = new Map(kb.decisions.map((d) => [d.action_index, d]));
  const rows: AiModelDiffRow[] = [];
  for (const da of ka.decisions) {
    const db = byIndexB.get(da.action_index);
    if (!db) continue;
    const topA = [...da.options].sort((a, b) => b.pi - a.pi)[0] ?? null;
    const topB = [...db.options].sort((a, b) => b.pi - a.pi)[0] ?? null;
    rows.push({
      action_index: da.action_index,
      kind: da.kind,
      chosen_label: da.chosen_label,
      chosen_option: chosenOption(da),
      score_a: da.chosen_score,
      pi_a: da.chosen_pi,
      score_b: db.chosen_score,
      pi_b: db.chosen_pi,
      score_diff: da.chosen_score - db.chosen_score,
      pi_diff: da.chosen_pi - db.chosen_pi,
      top_label_a: topA?.label ?? da.chosen_label,
      top_label_b: topB?.label ?? db.chosen_label,
      top_option_a: topA,
      top_option_b: topB,
    });
  }
  return rows;
}

export function modelDisplayLabel(m: AiModelInfo): string {
  const tag = m.model_tag ? ` (${m.model_tag})` : '';
  return `${m.name} v${m.version}${tag}`;
}

export const DEFAULT_AI_GRADE_TIERS: AiGradeTier[] = [
  { grade: 'AI', min: 99 },
  { grade: 'S+', min: 95 },
  { grade: 'S', min: 92.5 },
  { grade: 'S-', min: 90 },
  { grade: 'A+', min: 86.5 },
  { grade: 'A', min: 82 },
  { grade: 'A-', min: 79 },
  { grade: 'B+', min: 75 },
  { grade: 'B', min: 70 },
  { grade: 'B-', min: 65 },
  { grade: 'C+', min: 60 },
  { grade: 'C', min: 55 },
  { grade: 'C-', min: 50 },
  { grade: 'D', min: 40 },
  { grade: 'E', min: 35 },
  { grade: 'F', min: 10 },
  { grade: '不正打', min: -1e9 },
];

export function gradeForScore(avg: number, tiers: AiGradeTier[] = DEFAULT_AI_GRADE_TIERS): string {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  for (const t of sorted) {
    if (avg >= t.min) return t.grade;
  }
  return '不正打';
}

export function playerAnalysisForSeat(analysis: AiAnalysisFull | null | undefined, seat: number): AiPlayerAnalysis | null {
  if (!analysis?.players?.length) return null;
  return analysis.players.find((p) => p.seat === seat) ?? null;
}

/** Human chose 跳过 on an opponent discard (stored on that discard's action_index). */
export function isPassDecision(d: AiDecisionRecord): boolean {
  if (d.chosen_label === '跳过') return true;
  const chosen = d.options.find((o) => o.chosen);
  return chosen?.type === 'none' || chosen?.label === '跳过';
}

function isCallKind(kind: string): boolean {
  return kind === 'chi' || kind === 'pon' || kind === 'daiminkan' || kind === 'ankan' || kind === 'kakan' || kind === 'hora' || kind === 'reach';
}

/**
 * Replay frame where the UI should show this decision:
 * - Own 摸牌 → 打牌: on your deal frame (not on your discard).
 * - Opponent 打牌 → 过/吃/碰: on opponent's discard frame (not on their deal).
 * - Others' 摸牌 / your 打牌: no decision frame.
 */
export function replayFrameIndexForDecision(d: AiDecisionRecord, frames: Frame[], viewSeat: number): number {
  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi];
    const next = frames[fi + 1];
    const sum = f.summary;

    if (isPassDecision(d) && f.actionIndex === d.action_index) {
      if (sum.kind === 'discard' && sum.seat !== viewSeat) return fi;
      continue;
    }

    if (isCallKind(d.kind) && next?.actionIndex === d.action_index) {
      if (sum.kind === 'discard' && sum.seat !== viewSeat) return fi;
      continue;
    }

    if (d.kind === 'dahai' && !isPassDecision(d) && next?.actionIndex === d.action_index) {
      if (sum.kind === 'deal' && sum.seat === viewSeat) return fi;
    }
  }
  return -1;
}

export function decisionForReplayFrame(
  player: AiPlayerAnalysis | null,
  roundIndex: number,
  frames: Frame[],
  frameIdx: number,
  viewSeat: number,
): AiDecisionRecord | null {
  if (!player || frameIdx < 0) return null;
  const kyoku = player.kyoku.find((k) => k.kyoku_index === roundIndex);
  if (!kyoku) return null;
  for (const d of kyoku.decisions) {
    if (replayFrameIndexForDecision(d, frames, viewSeat) === frameIdx) return d;
  }
  return null;
}

/** Top options by π weight; always include chosen. */
export function topOptions(decision: AiDecisionRecord | null, limit = 3): AiDecisionOption[] {
  if (!decision?.options?.length) return [];
  const chosen = decision.options.find((o) => o.chosen);
  const sorted = [...decision.options].sort((a, b) => b.pi - a.pi);
  const out: AiDecisionOption[] = [];
  const seen = new Set<string>();
  for (const o of sorted) {
    const key = `${o.label}-${o.pai ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
    if (out.length >= limit) break;
  }
  if (chosen && !out.some((o) => o.chosen)) {
    out.unshift(chosen);
    if (out.length > limit + 1) out.length = limit + 1;
  }
  return out;
}

/** Text label for non-discard actions (discard uses tile image). */
export function formatOptionLabel(o: AiDecisionOption): string {
  if (o.type === 'dahai' && o.pai) return '';
  const label = o.label.replace(/^打\s*/, '');
  if (label && !label.startsWith('dahai#') && !label.startsWith('opt')) {
    return label;
  }
  if (o.pai) return o.pai;
  if (o.label.startsWith('dahai:')) return o.label.slice(6);
  return o.label;
}

export function optionShowsTileImage(o: AiDecisionOption): boolean {
  return o.type === 'dahai' && Boolean(o.pai);
}

/** CSS color for AI grade letter tiers (S red, A orange, …). */
export function gradeColor(grade: string): string {
  const g = grade.trim();
  if (g.startsWith('S')) return '#dc2626';
  if (g.startsWith('A')) return '#ea580c';
  if (g.startsWith('B')) return '#ca8a04';
  if (g.startsWith('C')) return '#2563eb';
  if (g === 'AI') return '#7c3aed';
  if (g === '不正打') return '#991b1b';
  return '#6b7280';
}

/** Human pick differs from AI top π option. */
export function isDecisionMismatch(decision: AiDecisionRecord | null | undefined): boolean {
  if (!decision?.options?.length) return false;
  const maxPi = Math.max(...decision.options.map((o) => o.pi));
  return decision.chosen_pi < maxPi - 1e-9;
}

/**
 * Replay frame indices (before the human act) where this player has an AI decision.
 * Pass onlyDiff=true to keep frames where human ≠ AI top pick.
 */
export function decisionFrameIndices(
  player: AiPlayerAnalysis | null,
  roundIndex: number,
  frames: Frame[],
  viewSeat: number,
  onlyDiff = false,
): number[] {
  if (!player || frames.length === 0) return [];
  const kyoku = player.kyoku.find((k) => k.kyoku_index === roundIndex);
  if (!kyoku?.decisions?.length) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const d of kyoku.decisions) {
    const fi = replayFrameIndexForDecision(d, frames, viewSeat);
    if (fi < 0 || seen.has(fi)) continue;
    if (onlyDiff && !isDecisionMismatch(d)) continue;
    seen.add(fi);
    out.push(fi);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** Match site player to AI summary by paipu seat (player_id) or seat_number fallback. */
export function aiMatchForPlayer(
  game: { ai_analysis?: AiAnalysisSummary; players: { player: { id: string }; seat_number: number }[] },
  playerId: string,
): { match_avg: number; match_grade: string } | null {
  const gp = game.players.find((p) => p.player.id === playerId);
  if (!gp || !game.ai_analysis?.has_ai_analysis || !game.ai_analysis.players) return null;
  const row =
    game.ai_analysis.players.find((p) => p.player_id === playerId) ??
    game.ai_analysis.players.find((p) => p.seat === gp.seat_number);
  if (!row) return null;
  return { match_avg: row.match_avg, match_grade: row.match_grade };
}
