import api from './client';
import type { ApiRequestOptions } from './types';
import { mergeApiOptions } from './types';
import type {
    LeagueMatch,
    LeagueSeason,
    LeagueSeasonPlayerItem,
    LeagueSeries,
    LeagueStage,
    LeagueStagePlayer,
} from '@/types';

// ==========================================================================
// Series
// ==========================================================================

export async function getLeagueSeriesList(opts?: ApiRequestOptions): Promise<LeagueSeries[]> {
    const { data } = await api.get('/leagues/series/', mergeApiOptions(opts));
    return data;
}

export async function getLeagueSeries(id: string, opts?: ApiRequestOptions): Promise<LeagueSeries> {
    const { data } = await api.get(`/leagues/series/${id}/`, mergeApiOptions(opts));
    return data;
}

export async function createLeagueSeries(payload: {
    name: string;
    description?: string;
}): Promise<LeagueSeries> {
    const { data } = await api.post('/leagues/series/', payload);
    return data;
}

export async function updateLeagueSeries(id: string, payload: Partial<LeagueSeries>): Promise<LeagueSeries> {
    const { data } = await api.put(`/leagues/series/${id}/`, payload);
    return data;
}

export async function uploadLeagueSeriesLogo(seriesId: string, file: File): Promise<LeagueSeries> {
    const form = new FormData();
    form.append('logo', file);
    const { data } = await api.post(`/leagues/series/${seriesId}/logo/`, form);
    return data;
}

export async function deleteLeagueSeries(id: string): Promise<void> {
    await api.delete(`/leagues/series/${id}/`);
}

// ==========================================================================
// Seasons
// ==========================================================================

export async function getCurrentSeasons(opts?: ApiRequestOptions): Promise<LeagueSeason[]> {
    const { data } = await api.get('/leagues/seasons/current/', mergeApiOptions(opts));
    return data;
}

export async function getLeagueSeasons(params?: { series_id?: string; status?: string }, opts?: ApiRequestOptions): Promise<LeagueSeason[]> {
    const { data } = await api.get('/leagues/seasons/', { params, ...mergeApiOptions(opts) });
    return data;
}

export async function getSeriesSeasons(seriesId: string, opts?: ApiRequestOptions): Promise<LeagueSeason[]> {
    const { data } = await api.get(`/leagues/series/${seriesId}/seasons/`, mergeApiOptions(opts));
    return data;
}

export async function getLeagueSeason(id: string, opts?: ApiRequestOptions): Promise<LeagueSeason> {
    const { data } = await api.get(`/leagues/seasons/${id}/`, mergeApiOptions(opts));
    return data;
}

export async function createLeagueSeason(seriesId: string, payload: {
    name: string;
    description?: string;
    is_current?: boolean;
    allow_online?: boolean;
    allow_offline?: boolean;
    start_time?: string | null;
    end_time?: string | null;
}): Promise<LeagueSeason> {
    const { data } = await api.post(`/leagues/series/${seriesId}/seasons/new/`, payload);
    return data;
}

export async function updateLeagueSeason(id: string, payload: Partial<LeagueSeason>): Promise<LeagueSeason> {
    const { data } = await api.put(`/leagues/seasons/${id}/`, payload);
    return data;
}

export async function uploadLeagueSeasonMarkdownImage(seasonId: string, file: File): Promise<{ url: string; id: string }> {
    const form = new FormData();
    form.append('image', file);
    const { data } = await api.post(`/leagues/seasons/${seasonId}/markdown-image/`, form);
    return data;
}

export async function deleteLeagueSeason(id: string): Promise<void> {
    await api.delete(`/leagues/seasons/${id}/`);
}

export async function startLeagueSeason(id: string): Promise<LeagueSeason> {
    const { data } = await api.post(`/leagues/seasons/${id}/start/`);
    return data;
}

export async function finishLeagueSeason(id: string): Promise<LeagueSeason> {
    const { data } = await api.post(`/leagues/seasons/${id}/finish/`);
    return data;
}

export async function reopenLeagueSeason(id: string): Promise<LeagueSeason> {
    const { data } = await api.post(`/leagues/seasons/${id}/reopen/`);
    return data;
}

// ==========================================================================
// Season players (registration)
// ==========================================================================

export async function getSeasonPlayers(seasonId: string, opts?: ApiRequestOptions): Promise<LeagueSeasonPlayerItem[]> {
    const { data } = await api.get(`/leagues/seasons/${seasonId}/players/`, mergeApiOptions(opts));
    return data;
}

export async function registerPlayer(seasonId: string, playerId: string): Promise<LeagueSeasonPlayerItem> {
    const { data } = await api.post(`/leagues/seasons/${seasonId}/register/`, { player_id: playerId });
    return data;
}

export async function unregisterPlayer(seasonId: string, playerId: string): Promise<void> {
    await api.delete(`/leagues/seasons/${seasonId}/register/`, { data: { player_id: playerId } });
}

export async function batchRegisterPlayers(seasonId: string, playerIds: string[]): Promise<LeagueSeasonPlayerItem[]> {
    const { data } = await api.post(`/leagues/seasons/${seasonId}/batch-register/`, { player_ids: playerIds });
    return data;
}

// ==========================================================================
// Stages
// ==========================================================================

export async function getLeagueStages(seasonId: string, opts?: ApiRequestOptions): Promise<LeagueStage[]> {
    const { data } = await api.get(`/leagues/seasons/${seasonId}/stages/`, mergeApiOptions(opts));
    return data;
}

export async function createLeagueStage(seasonId: string, payload: Partial<LeagueStage>): Promise<LeagueStage> {
    const { data } = await api.post(`/leagues/seasons/${seasonId}/stages/new/`, payload);
    return data;
}

export async function createStandardStages(seasonId: string): Promise<{
    stages: LeagueStage[];
    format: 'standard' | 'compact';
    player_count: number;
}> {
    const { data } = await api.post(`/leagues/seasons/${seasonId}/stages/standard/`);
    return {
        stages: data.stages ?? [],
        format: data.format ?? 'standard',
        player_count: data.player_count ?? 0,
    };
}

export async function reorderStages(seasonId: string, orderedIds: string[]): Promise<LeagueStage[]> {
    const { data } = await api.post(`/leagues/seasons/${seasonId}/stages/reorder/`, { ordered_ids: orderedIds });
    return data;
}

export async function getLeagueStage(id: string, opts?: ApiRequestOptions): Promise<LeagueStage> {
    const { data } = await api.get(`/leagues/stages/${id}/`, mergeApiOptions(opts));
    return data;
}

export async function updateLeagueStage(id: string, payload: Partial<LeagueStage>): Promise<LeagueStage> {
    const { data } = await api.put(`/leagues/stages/${id}/`, payload);
    return data;
}

export async function deleteLeagueStage(id: string): Promise<void> {
    await api.delete(`/leagues/stages/${id}/`);
}

export async function startLeagueStage(stageId: string): Promise<LeagueStage> {
    const { data } = await api.post(`/leagues/stages/${stageId}/start/`);
    return data;
}

export async function finishLeagueStage(stageId: string): Promise<LeagueStage> {
    const { data } = await api.post(`/leagues/stages/${stageId}/finish/`);
    return data;
}

export async function getStageRanking(stageId: string, opts?: ApiRequestOptions): Promise<LeagueStagePlayer[]> {
    const { data } = await api.get(`/leagues/stages/${stageId}/ranking/`, mergeApiOptions(opts));
    return data;
}

export async function recalculateStagePt(stageId: string): Promise<LeagueStagePlayer[]> {
    const { data } = await api.post(`/leagues/stages/${stageId}/recalculate/`);
    return data;
}

export async function promoteStage(stageId: string): Promise<LeagueStagePlayer[]> {
    const { data } = await api.post(`/leagues/stages/${stageId}/promote/`);
    return data;
}

// ==========================================================================
// Stage players
// ==========================================================================

export async function getStagePlayers(stageId: string, opts?: ApiRequestOptions): Promise<LeagueStagePlayer[]> {
    const { data } = await api.get(`/leagues/stages/${stageId}/players/`, mergeApiOptions(opts));
    return data;
}

export async function syncStagePlayersFromSeason(stageId: string): Promise<LeagueStagePlayer[]> {
    const { data } = await api.post(`/leagues/stages/${stageId}/players/sync/`);
    return data;
}

export async function addStagePlayers(stageId: string, players: {
    player_id: string;
    group_type?: string;
}[]): Promise<LeagueStagePlayer[]> {
    const { data } = await api.post(`/leagues/stages/${stageId}/players/manage/`, { players });
    return data;
}

export async function updateStagePlayer(stageId: string, stagePlayerId: string, payload: Partial<LeagueStagePlayer>): Promise<LeagueStagePlayer> {
    const { data } = await api.put(`/leagues/stages/${stageId}/players/manage/`, {
        stage_player_id: stagePlayerId,
        ...payload,
    });
    return data;
}

export async function removeStagePlayer(stageId: string, stagePlayerId: string): Promise<void> {
    await api.delete(`/leagues/stages/${stageId}/players/manage/`, { data: { stage_player_id: stagePlayerId } });
}

// ==========================================================================
// Matches
// ==========================================================================

export async function getStageMatches(stageId: string, opts?: ApiRequestOptions): Promise<LeagueMatch[]> {
    const { data } = await api.get(`/leagues/stages/${stageId}/matches/`, mergeApiOptions(opts));
    return data;
}

export async function createLeagueMatch(stageId: string, payload: {
    game_id?: string;
    match_label?: string;
    round_index?: number;
    table_index?: number;
    scheduled_players?: string[];
    companion_players?: string[];
}): Promise<LeagueMatch> {
    const { data } = await api.post(`/leagues/stages/${stageId}/matches/new/`, payload);
    return data;
}

export async function updateLeagueMatch(matchId: string, payload: Partial<LeagueMatch>): Promise<LeagueMatch> {
    const { data } = await api.put(`/leagues/stages/matches/${matchId}/`, payload);
    return data;
}

export async function deleteLeagueMatch(matchId: string): Promise<void> {
    await api.delete(`/leagues/stages/matches/${matchId}/`);
}

export async function generateSemifinalMatches(stageId: string): Promise<LeagueMatch[]> {
    const { data } = await api.post(`/leagues/stages/${stageId}/generate-semifinal/`);
    return data;
}

export interface OfflineMatchScore {
    player_id: string;
    score: number;
    is_dealer_start?: boolean;
    seat_number?: number;
}

export async function createOfflineLeagueMatch(stageId: string, payload: {
    scheduled_players: string[];
    scores?: OfflineMatchScore[];
    start_time?: string | null;
    end_time?: string | null;
    game_mode?: string;
    match_label?: string;
    round_index?: number;
    table_index?: number;
    companion_players?: string[];
}): Promise<LeagueMatch> {
    const { data } = await api.post(`/leagues/stages/${stageId}/matches/offline/`, payload);
    return data;
}

export async function importOnlineLeagueMatch(stageId: string, payload: {
    source_url: string;
    allow_duplicate_url?: boolean;
    match_label?: string;
    round_index?: number;
    table_index?: number;
    companion_players?: string[];
}): Promise<LeagueMatch> {
    const { data } = await api.post(`/leagues/stages/${stageId}/matches/online/`, payload, { timeout: 120_000 });
    return data;
}
