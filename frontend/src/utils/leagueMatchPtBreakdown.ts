import type { LeagueMatchScore, LeagueStage } from '@/types';

/** 与后端 recalculate_stage_pt 单局一致：点棒折算 PT + 顺位赏 */
export interface MatchPtBreakdownRow {
    rank: number;
    /** 终局点数（实分） */
    tenbaiPoints: number | null;
    /** 本局计入联赛的 PT 净值 */
    totalPt: number;
}

export function computeLeagueMatchPtBreakdown(
    stage: LeagueStage,
    gameScores: LeagueMatchScore[],
    companionPlayerIds?: ReadonlySet<string>,
): Map<string, MatchPtBreakdownRow> {
    const base = stage.base_score;
    const uma = [stage.uma_1st, stage.uma_2nd, stage.uma_3rd, stage.uma_4th];
    const sorted = [...gameScores]
        .filter((s) => s.score != null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const map = new Map<string, MatchPtBreakdownRow>();
    sorted.forEach((s, rankIdx) => {
        const pid = String(s.player_id);
        const isCompanion = companionPlayerIds?.has(pid) ?? false;
        const raw = s.score ?? 0;
        const realScore = raw * 100;
        const ptFromScore = (realScore - base) / 1000;
        const ptFromUma = rankIdx < uma.length ? uma[rankIdx] : 0;
        const totalPt = isCompanion
            ? 0
            : Math.round((ptFromScore + ptFromUma) * 100) / 100;
        map.set(pid, {
            rank: rankIdx + 1,
            tenbaiPoints: raw * 100,
            totalPt,
        });
    });
    return map;
}
