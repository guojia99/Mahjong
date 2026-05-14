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

export interface GamesListResponse {
  count: number;
  page: number;
  page_size: number;
  results: Game[];
}

export type GamesListParams = {
  player_count?: number | string;
  game_mode?: string;
  game_type?: string;
  /** 空：全部；`1`：仅联赛对局；`0`：非联赛对局 */
  league?: '' | '0' | '1';
  page?: number;
  page_size?: number;
};

export async function getGamesList(params?: GamesListParams): Promise<GamesListResponse> {
  const { data } = await api.get('/games/', { params: params || {} });
  return data;
}

/** 分页拉取直至取完（用于需全量列表的管理页等）。 */
export async function getAllGames(params?: Omit<GamesListParams, 'page' | 'page_size'>): Promise<Game[]> {
  const chunk = 100;
  let page = 1;
  const out: Game[] = [];
  while (true) {
    const res = await getGamesList({ ...params, page, page_size: chunk });
    out.push(...res.results);
    if (out.length >= res.count || res.results.length === 0) break;
    page += 1;
  }
  return out;
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
  /** 牌谱统计排行：该玩家参与计分的小局总数（与 intro 中「率」分母一致） */
  rounds?: number;
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
  | 'damaten_rate'
  | 'damaten_listen_rate'
  | 'avg_deal_in'
  | 'deal_in_rate'
  | 'tsumo_rate'
  | 'avg_furo'
  | 'furo_rate'
  | 'avg_win_point'
  | 'avg_minkan_win_point'
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
  | 'riichi_composite'
  | 'avg_riichi_discard_turn'
  | 'avg_riichi_tsumo_after_turn'
  | 'avg_riichi_hu_after_turn';

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

// ===== v2.2.0 起手牌列表 =====

export interface StartingHandBreakdown {
  shape_score: number;
  shape_detail?: Record<string, unknown>;
  yaku_potential_bonus: number;
  /** key: 役种 id（如 tanyao / chiitoitsu / … / iipeikou / daisangen），value: 该役种加分 */
  yaku_potential: Record<string, number>;
  tanyao_bonus: number;
  honitsu_bonus: number;
  shanten: number;
  shanten_bonus: number;
  shanten_breakdown?: { general: number; pairs7: number; kokushi: number };
  red_dora: number;
  red_dora_bonus: number;
  /** 与指示牌宝牌合并后的「宝牌当量」枚数（赤 5 等已并入，不重复计） */
  dora_equiv_count?: number;
  dora_count: number;
  dora_tiles: string[];
  adjacent_dora: number;
  /** 第 1…n 枚宝牌当量按 4+7+10+… 规则累计的加分（不含邻张、三张同宝） */
  dora_equiv_ladder_bonus?: number;
  dora_triplet_same_bonus?: number;
  dora_bonus: number;
  tanyao: boolean;
  yakuhai_tiles?: number[];
}

export interface StartingHandItem {
  score: number;
  tiles: string[];
  chang: number;
  ju: number;
  ben: number;
  dealer_seat: number;
  seat: number;
  is_dealer: boolean;
  dora_indicators: string[];
  breakdown: StartingHandBreakdown;
  game_id: string;
  game_mode: string;
  player_count: number;
  start_time: string;
  player: import('@/types').Player;
}

export interface StartingHandListResponse {
  count: number;
  page: number;
  page_size: number;
  results: StartingHandItem[];
  summary?: {
    player: import('@/types').Player | null;
    total_hands: number;
    average_score: number;
    max_score: number;
    min_score: number;
  };
}

export interface StartingHandPlayerAverage {
  player: import('@/types').Player;
  total_hands: number;
  average_score: number;
  best_score: number;
  worst_score: number;
}

export async function getStartingHands(params?: {
  tab?: 'overall' | 'personal';
  player_id?: string;
  player_count?: number | string;
  game_mode?: string;
  page?: number;
  page_size?: number;
}): Promise<StartingHandListResponse> {
  const { data } = await api.get('/games/starting-hands/', { params });
  return data;
}

export async function getStartingHandPlayerAverages(params?: {
  player_count?: number | string;
  game_mode?: string;
  min_hands?: number;
}): Promise<StartingHandPlayerAverage[]> {
  const { data } = await api.get('/games/starting-hands/player-averages/', { params });
  return data;
}
