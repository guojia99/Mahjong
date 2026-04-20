import api from './client';
import type { Room, Game, GameScore, HandRecord, PlayerStats, PtRankingItem } from '@/types';

export async function getRooms(status?: string): Promise<Room[]> {
  const params = status ? { status } : {};
  const { data } = await api.get('/rooms/', { params });
  return data;
}

export async function getRoom(id: string): Promise<Room> {
  const { data } = await api.get(`/rooms/${id}/`);
  return data;
}

export async function createRoom(payload: { name: string; location?: string }): Promise<Room> {
  const { data } = await api.post('/rooms/', payload);
  return data;
}

export async function updateRoom(id: string, payload: { name?: string; location?: string }): Promise<Room> {
  const { data } = await api.put(`/rooms/${id}/`, payload);
  return data;
}

export async function closeRoom(id: string): Promise<Room> {
  const { data } = await api.post(`/rooms/${id}/close/`);
  return data;
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

export async function updateGame(id: string, payload: { game_mode?: string; player_count?: number; start_time?: string }) {
  const { data } = await api.put(`/games/${id}/`, payload);
  return data;
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
  source_url: string;
  player_data: { player_id: string; score?: number; is_dealer_start?: boolean }[];
  game_mode: string;
  player_count?: number;
}): Promise<Game> {
  const { data } = await api.post('/games/online/', payload);
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
}): Promise<PlayerStats> {
  const { data } = await api.get(`/players/${playerId}/stats/`, { params });
  return data;
}

export async function getPtRanking(params?: {
  player_count?: number;
  game_mode?: string;
}): Promise<PtRankingItem[]> {
  const { data } = await api.get('/games/pt-ranking/', { params });
  return data;
}
