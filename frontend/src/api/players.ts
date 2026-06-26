import api from './client';
import type { ApiRequestOptions } from './types';
import { mergeApiOptions } from './types';
import type { Player, PlayerAccount, MajsoulAccount, Game, HandRecord, PlayerAiMatchScoreSeries } from '@/types';

export async function getPlayers(query = '', opts?: ApiRequestOptions): Promise<Player[]> {
  const params = query ? { q: query } : {};
  const { data } = await api.get('/players', { params, ...mergeApiOptions(opts) });
  return data;
}

/** 获取单个雀士头像 */
export async function getPlayerAvatar(id: string): Promise<string> {
  const { data } = await api.get<{ avatar: string }>(`/players/${id}/avatar/`);
  return data.avatar ?? '';
}

/** 批量取头像（id -> 头像 URL 或空串，可能为 data: 或 http(s)） */
export async function getPlayerAvatarsBatch(ids: string[], opts?: ApiRequestOptions): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await api.post<Record<string, string>>('/players/batch-avatars/', { ids }, mergeApiOptions(opts));
  return data ?? {};
}

export async function getPlayer(id: string, opts?: ApiRequestOptions): Promise<Player> {
  const { data } = await api.get(`/players/${id}/`, mergeApiOptions(opts));
  return data;
}

export async function createPlayer(payload: {
  nickname: string;
  real_name?: string;
  avatar?: string;
  extra_info?: Record<string, unknown>;
  enable_account?: boolean;
  email?: string;
  password?: string;
  is_admin?: boolean;
}): Promise<Player> {
  const { data } = await api.post('/players/', payload);
  return data;
}

export async function updatePlayer(
  id: string,
  payload: {
    nickname?: string;
    real_name?: string;
    avatar?: string;
    extra_info?: Record<string, unknown>;
  }
): Promise<Player> {
  const { data } = await api.put(`/players/${id}/`, payload);
  return data;
}

export async function deletePlayer(id: string): Promise<void> {
  await api.delete(`/players/${id}/`);
}

export async function mergePlayer(targetId: string, sourcePlayerId: string): Promise<Player> {
  const { data } = await api.post(`/players/${targetId}/merge/`, { source_player_id: sourcePlayerId });
  return data;
}

export async function bindPlayerAccount(playerId: string, userId: number): Promise<PlayerAccount> {
  const { data } = await api.post<PlayerAccount>(`/players/${playerId}/bind-account/`, { user_id: userId });
  return data;
}

export async function enablePlayerAccount(
  playerId: string,
  payload: { email?: string; password?: string; is_admin?: boolean; username?: string },
): Promise<PlayerAccount> {
  const { data } = await api.post(`/players/${playerId}/enable-account/`, payload);
  return data;
}

export async function updatePlayerAccount(
  playerId: string,
  payload: { email?: string; is_admin?: boolean; is_active?: boolean; username?: string },
): Promise<PlayerAccount> {
  const { data } = await api.put(`/players/${playerId}/account/`, payload);
  return data;
}

export async function resetPlayerSystemPassword(playerId: string): Promise<PlayerAccount> {
  const { data } = await api.post<PlayerAccount>(`/players/${playerId}/reset-system-password/`);
  return data;
}

export async function setPlayerPassword(playerId: string, password: string): Promise<PlayerAccount> {
  const { data } = await api.post<PlayerAccount>(`/players/${playerId}/set-password/`, { password });
  return data;
}

export async function getMajsoulAccounts(playerId: string): Promise<MajsoulAccount[]> {
  const { data } = await api.get(`/players/${playerId}/majsoul-accounts/`);
  return data;
}

export async function addMajsoulAccount(
  playerId: string,
  uid: number,
  nickname: string
): Promise<MajsoulAccount> {
  const { data } = await api.post(`/players/${playerId}/majsoul-accounts/`, { uid, nickname });
  return data;
}

export async function deleteMajsoulAccount(accountId: string): Promise<void> {
  await api.delete(`/players/majsoul-accounts/${accountId}/`);
}

export async function getPlayerGames(playerId: string, opts?: ApiRequestOptions): Promise<Game[]> {
  const { data } = await api.get(`/players/${playerId}/games/`, mergeApiOptions(opts));
  return data;
}

export async function getPlayerAiMatchScores(
  playerId: string,
  params?: Record<string, string | number>,
  opts?: ApiRequestOptions,
): Promise<PlayerAiMatchScoreSeries> {
  const { data } = await api.get(`/players/${playerId}/ai-match-scores/`, { params, ...mergeApiOptions(opts) });
  return data;
}

export async function getPlayerYakumans(playerId: string, recordType?: string): Promise<HandRecord[]> {
  const params = recordType ? { record_type: recordType } : {};
  const { data } = await api.get(`/players/${playerId}/yakumans/`, { params });
  return data;
}
