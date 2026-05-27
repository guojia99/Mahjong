import api from './client';
import type { ApiRequestOptions } from './types';
import { mergeApiOptions } from './types';
import type { RankTier, UmaConfig, PlayerRankingScore } from '@/types';

export async function getUmaConfigs(opts?: ApiRequestOptions): Promise<UmaConfig[]> {
  const { data } = await api.get('/ranking/uma-configs/', mergeApiOptions(opts));
  return data;
}

export async function updateUmaConfig(id: string, payload: Partial<UmaConfig>): Promise<UmaConfig> {
  const { data } = await api.put(`/ranking/uma-configs/${id}/`, payload);
  return data;
}

export async function getRankTiers(opts?: ApiRequestOptions): Promise<RankTier[]> {
  const { data } = await api.get('/ranking/tiers/', mergeApiOptions(opts));
  return data;
}

export async function updateRankTier(id: string, payload: Partial<RankTier>): Promise<RankTier> {
  const { data } = await api.put(`/ranking/tiers/${id}/`, payload);
  return data;
}

export async function getRankingLeaderboard(opts?: ApiRequestOptions): Promise<PlayerRankingScore[]> {
  const { data } = await api.get('/ranking/leaderboard/', mergeApiOptions(opts));
  return data;
}

export async function getPlayerRanking(playerId: string): Promise<PlayerRankingScore> {
  const { data } = await api.get(`/ranking/player/${playerId}/`);
  return data;
}

export async function getPlayerGameRankingResults(playerId: string): Promise<Record<string, {
  game: string;
  player: string;
  rank: number;
  delta: number;
  old_tier_name: string;
  new_tier_name: string;
  old_score: number;
  new_score: number;
}>> {
  const { data } = await api.get(`/ranking/player/${playerId}/game-results/`);
  return data;
}

export async function recalculateRanking(): Promise<{ message: string }> {
  const { data } = await api.post('/ranking/recalculate/');
  return data;
}
