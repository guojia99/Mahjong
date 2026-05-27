import api from './client';
import type { Player, MajsoulAccount, Game, HandRecord } from '@/types';

export async function getPlayers(query = ''): Promise<Player[]> {
  const params = query ? { q: query } : {};
  const { data } = await api.get('/players/', { params });
  return data;
}

/** 获取单个雀士头像 */
export async function getPlayerAvatar(id: string): Promise<string> {
  const { data } = await api.get<{ avatar: string }>(`/players/${id}/avatar/`);
  return data.avatar ?? '';
}

/** 批量取头像（id -> 头像 URL 或空串，可能为 data: 或 http(s)） */
export async function getPlayerAvatarsBatch(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await api.post<Record<string, string>>('/players/batch-avatars/', { ids });
  return data ?? {};
}

export async function getPlayer(id: string): Promise<Player> {
  const { data } = await api.get(`/players/${id}/`);
  return data;
}

export async function createPlayer(payload: {
  nickname: string;
  real_name?: string;
  avatar?: string;
  extra_info?: Record<string, unknown>;
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

export async function getPlayerGames(playerId: string): Promise<Game[]> {
  const { data } = await api.get(`/players/${playerId}/games/`);
  return data;
}

export async function getPlayerYakumans(playerId: string, recordType?: string): Promise<HandRecord[]> {
  const params = recordType ? { record_type: recordType } : {};
  const { data } = await api.get(`/players/${playerId}/yakumans/`, { params });
  return data;
}
