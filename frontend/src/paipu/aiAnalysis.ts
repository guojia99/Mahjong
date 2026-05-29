/** Types and helpers for Mortal AI analysis (Game.ai_analysis / detail API). */

import type { Frame } from '@/paipu/paipuReplayModel';

export interface AiGradeTier {
  grade: string;
  min: number;
}

export interface AiAnalysisSummary {
  status: string;
  has_ai_analysis: boolean;
  analyzed_at?: string | null;
  model_tag?: string;
  players?: {
    seat: number;
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
  model_tag: string;
  players: AiPlayerAnalysis[];
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

/**
 * AI decisions are keyed to the paipu action index where the human act is applied.
 * Replay frames show that state *after* the act, so show the decision one frame earlier
 * (e.g. on 摸牌帧 while the tile is still in hand, not on 出牌帧 when it is in the river).
 */
export function decisionForReplayFrame(
  player: AiPlayerAnalysis | null,
  roundIndex: number,
  frames: Frame[],
  frameIdx: number,
): AiDecisionRecord | null {
  if (!player || frameIdx < 0) return null;
  const kyoku = player.kyoku.find((k) => k.kyoku_index === roundIndex);
  if (!kyoku) return null;
  const next = frames[frameIdx + 1];
  if (!next) return null;
  return kyoku.decisions.find((d) => d.action_index === next.actionIndex) ?? null;
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
  onlyDiff = false,
): number[] {
  if (!player || frames.length < 2) return [];
  const kyoku = player.kyoku.find((k) => k.kyoku_index === roundIndex);
  if (!kyoku?.decisions?.length) return [];
  const out: number[] = [];
  for (let fi = 0; fi < frames.length - 1; fi++) {
    const decision = kyoku.decisions.find((d) => d.action_index === frames[fi + 1].actionIndex);
    if (!decision) continue;
    if (onlyDiff && !isDecisionMismatch(decision)) continue;
    out.push(fi);
  }
  return out;
}

/** Match site player to AI summary by seat_number. */
export function aiMatchForPlayer(
  game: { ai_analysis?: AiAnalysisSummary; players: { player: { id: string }; seat_number: number }[] },
  playerId: string,
): { match_avg: number; match_grade: string } | null {
  const gp = game.players.find((p) => p.player.id === playerId);
  if (!gp || !game.ai_analysis?.has_ai_analysis || !game.ai_analysis.players) return null;
  const row = game.ai_analysis.players.find((p) => p.seat === gp.seat_number);
  if (!row) return null;
  return { match_avg: row.match_avg, match_grade: row.match_grade };
}
