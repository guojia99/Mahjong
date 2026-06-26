import type { LeagueMatch } from '@/types';

/** 解析后端 formatTime 输出的 `YYYY-MM-DD HH:mm` */
function parseLeagueDateTime(value?: string | null): number {
    if (!value?.trim()) return NaN;
    const normalized = value.includes('T') ? value : value.trim().replace(' ', 'T');
    const ms = Date.parse(normalized);
    return Number.isNaN(ms) ? NaN : ms;
}

function matchSortKey(match: LeagueMatch): number {
    const gameTime = parseLeagueDateTime(match.game_start_time);
    if (!Number.isNaN(gameTime)) return gameTime;
    return parseLeagueDateTime(match.created_at);
}

export type LeagueMatchTimeInfo = {
    text: string;
    /** true = 对局开始时间；false = 无对局时用录入时间 */
    isGameTime: boolean;
};

/** 展示用时间：优先对局开始时间，否则录入创建时间 */
export function getLeagueMatchTimeInfo(match: LeagueMatch): LeagueMatchTimeInfo | null {
    const gameTime = match.game_start_time?.trim();
    if (gameTime) return { text: gameTime, isGameTime: true };
    const created = match.created_at?.trim();
    if (created) return { text: created, isGameTime: false };
    return null;
}

/**
 * 联赛对局列表：优先按对局开始时间升序，无对局时间则按录入创建时间升序。
 */
export function sortLeagueMatchesByTime(matches: LeagueMatch[]): LeagueMatch[] {
    return [...matches].sort((a, b) => {
        const ta = matchSortKey(a);
        const tb = matchSortKey(b);
        if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
        if (!Number.isNaN(ta) && Number.isNaN(tb)) return -1;
        if (Number.isNaN(ta) && !Number.isNaN(tb)) return 1;
        const ca = parseLeagueDateTime(a.created_at);
        const cb = parseLeagueDateTime(b.created_at);
        if (!Number.isNaN(ca) && !Number.isNaN(cb) && ca !== cb) return ca - cb;
        return a.id.localeCompare(b.id);
    });
}
