import api from './client';
import type { RankTier, UmaConfig, PlayerRankingScore } from '@/types';

export async function getUmaConfigs(): Promise<UmaConfig[]> {
  const { data } = await api.get('/ranking/uma-configs/');
  return data;
}

export async function updateUmaConfig(id: string, payload: Partial<UmaConfig>): Promise<UmaConfig> {
  const { data } = await api.put(`/ranking/uma-configs/${id}/`, payload);
  return data;
}

export async function getRankTiers(): Promise<RankTier[]> {
  const { data } = await api.get('/ranking/tiers/');
  return data;
}

export async function updateRankTier(id: string, payload: Partial<RankTier>): Promise<RankTier> {
  const { data } = await api.put(`/ranking/tiers/${id}/`, payload);
  return data;
}

export async function getRankingLeaderboard(): Promise<PlayerRankingScore[]> {
  const { data } = await api.get('/ranking/leaderboard/');
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
