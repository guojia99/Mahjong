import type { LeagueMatch } from '@/types';

/**
 * 联赛对局列表：按关联对局开始时间升序，无对局者按创建时间、id 稳定排序。
 */
export function sortLeagueMatchesByTime(matches: LeagueMatch[]): LeagueMatch[] {
  return [...matches].sort((a, b) => {
    const ta = a.game_start_time ? new Date(a.game_start_time).getTime() : NaN;
    const tb = b.game_start_time ? new Date(b.game_start_time).getTime() : NaN;
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
    if (!Number.isNaN(ta) && Number.isNaN(tb)) return -1;
    if (Number.isNaN(ta) && !Number.isNaN(tb)) return 1;
    const ca = new Date(a.created_at).getTime();
    const cb = new Date(b.created_at).getTime();
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}
