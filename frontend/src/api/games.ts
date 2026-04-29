import api from './client';
import type { Room, Game, GameScore, HandRecord, PlayerStats, PtRankingItem } from '@/types';

export async function getRooms(params?: { status?: string; room_type?: 'offline' | 'online' }): Promise<Room[]> {
  const { data } = await api.get('/rooms/', { params: params || {} });
  return data;
}

export async function getRoom(id: string): Promise<Room> {
  const { data } = await api.get(`/rooms/${id}/`);
  return data;
}

export async function createRoom(payload: {
  name: string;
  location?: string;
  room_type?: 'offline' | 'online';
  session_time?: string | null;
}): Promise<Room> {
  const { data } = await api.post('/rooms/', payload);
  return data;
}

export async function updateRoom(id: string, payload: {
  name?: string; location?: string; room_type?: 'offline' | 'online'; session_time?: string | null;
}): Promise<Room> {
  const { data } = await api.put(`/rooms/${id}/`, payload);
  return data;
}

export async function closeRoom(id: string): Promise<Room> {
  const { data } = await api.post(`/rooms/${id}/close/`);
  return data;
}

export async function deleteRoom(id: string) {
  await api.delete(`/rooms/${id}/`);
}

export async function addPlayerToRoom(roomId: string, playerId: string) {
  const { data } = await api.post(`/rooms/${roomId}/players/`, { player_id: playerId });
  return data;
}

export async function removePlayerFromRoom(roomId: string, playerId: string) {
  await api.delete(`/rooms/${roomId}/players/${playerId}/`);
}

export async function getRoomGames(roomId: string): Promise<Game[]> {
  const { data } = await api.get(`/rooms/${roomId}/games/`);
  return data;
}

export async function createRoomGame(
  roomId: string,
  payload: {
    game_mode: string;
    player_count?: number;
    start_time: string;
    end_time?: string | null;
    player_ids: string[];
  }
): Promise<Game> {
  const { data } = await api.post(`/rooms/${roomId}/games/`, payload);
  return data;
}

export async function getGame(id: string): Promise<Game> {
  const { data } = await api.get(`/games/${id}/`);
  return data;
}

export async function updateGame(id: string, payload: { game_mode?: string; player_count?: number; start_time?: string; end_time?: string | null }) {
  const { data } = await api.put(`/games/${id}/`, payload);
  return data;
}

export async function deleteGame(id: string) {
  await api.delete(`/games/${id}/`);
}

export async function submitGameScores(gameId: string, scores: GameScore[]): Promise<Game> {
  const { data } = await api.put(`/games/${gameId}/scores/`, { scores });
  return data;
}

export async function updateGamePlayers(gameId: string, player_ids: string[]): Promise<Game> {
  const { data } = await api.put(`/games/${gameId}/players/`, { player_ids });
  return data;
}

export async function shuffleGameSeats(gameId: string): Promise<Game> {
  const { data } = await api.post(`/games/${gameId}/shuffle-seats/`);
  return data;
}

export async function createNextGame(roomId: string, fromGameId: string): Promise<Game> {
  const { data } = await api.post(`/rooms/${roomId}/games/`, { copy_from: fromGameId });
  return data;
}

export async function importOnlineGame(payload: {
  room_id: string;
  source_url?: string;
  player_data: {
    player_id: string;
    score?: number;
    is_dealer_start?: boolean;
    /** 牌谱中的雀魂 UID，导入后写入该雀士的雀魂账号表 */
    uid?: number;
    /** 牌谱昵称，写入 MahjongSoulAccount.nickname */
    majsoul_nickname?: string;
  }[];
  game_mode: string;
  player_count?: number;
  paipu_data?: Record<string, unknown>;
  start_time?: string | null;
  end_time?: string | null;
  /** 与已有线上对局牌谱 URL 重复时须为 true，否则后端拒绝导入 */
  allow_duplicate_url?: boolean;
}): Promise<Game> {
  const { data } = await api.post('/games/online/', payload, { timeout: 120_000 });
  return data;
}

const PARSE_ONLINE_TIMEOUT_MS = 120_000;

export async function parseOnlineGame(url: string): Promise<{
  uuid: string;
  start_time: string;
  end_time: string;
  game_mode: string;
  player_count: number;
  players: {
    seat: number;
    uid: number;
    nickname: string;
    score: number;
    player_id: string | null;
    account_id: string | null;
    is_bound: boolean;
  }[];
  source_url: string;
  duplicate_in_db?: boolean;
  raw_data: Record<string, unknown>;
}> {
  const { data } = await api.get('/games/online/parse/', {
    params: { url },
    timeout: PARSE_ONLINE_TIMEOUT_MS,
  });
  return data;
}

export type OnlineParseItem = Awaited<ReturnType<typeof parseOnlineGame>>;

export async function parseOnlineGameBatch(urls: string[]): Promise<{
  results: (
    | { source_url: string; ok: true; data: OnlineParseItem; duplicate_in_db: boolean }
    | { source_url: string; ok: false; error: string }
  )[];
}> {
  const { data } = await api.post('/games/online/parse-batch/', { urls }, { timeout: PARSE_ONLINE_TIMEOUT_MS });
  return data;
}

export async function getAllGames(params?: {
  player_count?: number;
  game_mode?: string;
  game_type?: string;
}): Promise<Game[]> {
  const { data } = await api.get('/games/', { params });
  return data;
}

export async function retryOnlineGame(gameId: string): Promise<Game> {
  const { data } = await api.post(`/games/online/retry/${gameId}/`, {}, { timeout: 120_000 });
  return data;
}

export async function getGameHandRecords(gameId: string): Promise<HandRecord[]> {
  const { data } = await api.get(`/games/${gameId}/hand-records/`);
  return data;
}

export async function createHandRecord(gameId: string, payload: {
  player: string;
  record_type: string;
  yakuman_names: string[];
  hand_tiles: string[];
  melds: { tiles: { tile: string; orientation: 'h' | 'v' }[]; type: string }[];
  winning_tile: string;
  win_type: string;
}): Promise<HandRecord> {
  const { data } = await api.post(`/games/${gameId}/hand-records/`, payload);
  return data;
}

export async function deleteHandRecord(gameId: string, recordId: string) {
  await api.delete(`/games/${gameId}/hand-records/${recordId}/`);
}

export async function getRecentYakumans(limit = 10, recordType?: string): Promise<HandRecord[]> {
  const params: Record<string, string | number> = { limit };
  if (recordType) params.record_type = recordType;
  const { data } = await api.get('/games/yakumans/recent/', { params });
  return data;
}

export async function getAllYakumans(recordType?: string): Promise<HandRecord[]> {
  const params = recordType ? { record_type: recordType } : {};
  const { data } = await api.get('/games/yakumans/', { params });
  return data;
}

export async function getPlayerStats(playerId: string, params?: {
  player_count?: number;
  game_mode?: string;
  game_type?: 'offline' | 'online' | '';
  recent_limit?: number;
}): Promise<PlayerStats> {
  const { data } = await api.get(`/players/${playerId}/stats/`, { params });
  return data;
}

export async function getPtRanking(params?: {
  player_count?: number;
  game_mode?: string;
  game_type?: 'offline' | 'online';
}): Promise<PtRankingItem[]> {
  const { data } = await api.get('/games/pt-ranking/', { params });
  return data;
}

export interface FunRankingItem {
  player: import('@/types').Player;
  rate: number;
  count: number;
  total: number;
}

export async function getFunRanking(params?: {
  rank_type?: '1st' | '2nd' | '3rd' | '4th' | 'avg_rank' | 'avg_score' | 'high_score' | 'low_score';
  player_count?: number;
  game_mode?: string;
  game_type?: 'offline' | 'online';
  min_games?: number;
}): Promise<FunRankingItem[]> {
  const { data } = await api.get('/games/fun-ranking/', { params });
  return data;
}

export type PaipuStatRankType =
  | 'win_rate'
  | 'avg_win_count'
  | 'avg_riichi'
  | 'riichi_rate'
  | 'avg_deal_in'
  | 'deal_in_rate'
  | 'tsumo_rate'
  | 'avg_furo'
  | 'furo_rate'
  | 'avg_win_point'
  | 'avg_deal_point'
  | 'first_riichi_rate'
  | 'chase_riichi_rate'
  | 'total_minkan'
  | 'avg_minkan'
  | 'minkan_rate'
  | 'total_ankan'
  | 'avg_ankan'
  | 'ankan_rate'
  | 'riichi_win_rate'
  | 'riichi_deal_rate'
  | 'riichi_noten_rate'
  | 'avg_riichi_pt'
  | 'riichi_quality'
  | 'riichi_composite';

export async function getPaipuStatsRanking(params?: {
  rank_type?: PaipuStatRankType;
  player_count?: number;
  game_mode?: string;
  game_type?: 'offline' | 'online';
  min_games?: number;
}): Promise<FunRankingItem[]> {
  const { data } = await api.get('/games/paipu-stats/', { params });
  return data;
}
