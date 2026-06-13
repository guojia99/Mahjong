import api from './client';
import type { ApiRequestOptions } from './types';
import { mergeApiOptions } from './types';
import type {
  QueMiBlacklistEntry,
  QueMiGlobalLeaderboardEntry,
  QueMiLeaderboardEntry,
  QueMiMyAttemptItem,
  QueMiPuzzleAttemptDetail,
  QueMiPuzzleDetail,
  QueMiPuzzleListFilters,
  QueMiPuzzleListItem,
  QueMiGiveUpResponse,
  QueMiStartAttemptResponse,
  QueMiSubmitAnswerResponse,
} from '@/types/queMi';
import type { QueMiOpenGuess, QueMiPuzzle } from '@/mahjong-puzzle/types';

const BASE = '/que-mi';

export async function listPuzzles(
  filters?: QueMiPuzzleListFilters,
  opts?: ApiRequestOptions,
): Promise<QueMiPuzzleListItem[]> {
  const params: Record<string, string> = {};
  if (filters?.unplayed) params.unplayed = 'true';
  if (filters?.difficulty) params.difficulty = filters.difficulty;
  if (filters?.type) params.type = filters.type;
  if (filters?.hand_mode) params.hand_mode = filters.hand_mode;
  if (filters?.creator) params.creator = filters.creator;
  if (filters?.name) params.name = filters.name;
  const { data } = await api.get(`${BASE}/puzzles/`, { params, ...mergeApiOptions(opts) });
  return data;
}

export async function createPuzzle(puzzle: QueMiPuzzle, name?: string): Promise<QueMiPuzzleListItem> {
  const body: { puzzle: QueMiPuzzle; name?: string } = { puzzle };
  const trimmed = name?.trim();
  if (trimmed) body.name = trimmed;
  const { data } = await api.post(`${BASE}/puzzles/`, body);
  return data;
}

export async function getSuggestedPuzzleName(opts?: ApiRequestOptions): Promise<string> {
  const { data } = await api.get<{ name: string }>(`${BASE}/puzzles/suggested-name/`, mergeApiOptions(opts));
  return data.name;
}

export async function getPuzzle(id: string, opts?: ApiRequestOptions): Promise<QueMiPuzzleDetail> {
  const { data } = await api.get(`${BASE}/puzzles/${id}/`, mergeApiOptions(opts));
  return data;
}

export async function deletePuzzle(id: string): Promise<void> {
  await api.delete(`${BASE}/puzzles/${id}/`);
}

export async function startAttempt(id: string): Promise<QueMiStartAttemptResponse> {
  const { data } = await api.post(`${BASE}/puzzles/${id}/start/`);
  return data;
}

export async function submitAnswer(
  id: string,
  payload: { guess?: string[]; open_guess?: QueMiOpenGuess },
): Promise<QueMiSubmitAnswerResponse> {
  const { data } = await api.post(`${BASE}/puzzles/${id}/submit/`, payload);
  return data;
}

export async function giveUp(id: string): Promise<QueMiGiveUpResponse> {
  const { data } = await api.post(`${BASE}/puzzles/${id}/give-up/`);
  return data;
}

export async function getLeaderboard(id: string, opts?: ApiRequestOptions): Promise<QueMiLeaderboardEntry[]> {
  const { data } = await api.get(`${BASE}/puzzles/${id}/leaderboard/`, mergeApiOptions(opts));
  return data;
}

export async function getPuzzleAttempt(
  puzzleId: string,
  userId: number,
  opts?: ApiRequestOptions,
): Promise<QueMiPuzzleAttemptDetail> {
  const { data } = await api.get(`${BASE}/puzzles/${puzzleId}/attempts/${userId}/`, mergeApiOptions(opts));
  return data;
}

export async function getGlobalLeaderboard(
  filters?: Pick<QueMiPuzzleListFilters, 'difficulty' | 'type' | 'hand_mode'>,
  opts?: ApiRequestOptions,
): Promise<QueMiGlobalLeaderboardEntry[]> {
  const params: Record<string, string> = {};
  if (filters?.difficulty) params.difficulty = filters.difficulty;
  if (filters?.type) params.type = filters.type;
  if (filters?.hand_mode) params.hand_mode = filters.hand_mode;
  const { data } = await api.get(`${BASE}/leaderboard/`, { params, ...mergeApiOptions(opts) });
  return data;
}

export async function getMyAttempts(opts?: ApiRequestOptions): Promise<QueMiMyAttemptItem[]> {
  const { data } = await api.get(`${BASE}/my-attempts/`, mergeApiOptions(opts));
  return data;
}

export async function getMyPuzzles(opts?: ApiRequestOptions): Promise<QueMiPuzzleListItem[]> {
  const { data } = await api.get(`${BASE}/my-puzzles/`, mergeApiOptions(opts));
  return data;
}

export async function adminListPuzzles(opts?: ApiRequestOptions): Promise<QueMiPuzzleListItem[]> {
  const { data } = await api.get('/admin/que-mi/puzzles/', mergeApiOptions(opts));
  return data;
}

export async function adminPatchPuzzle(
  id: string,
  payload: { is_disabled?: boolean; name?: string },
): Promise<QueMiPuzzleListItem> {
  const { data } = await api.patch(`${BASE}/puzzles/${id}/`, payload);
  return data;
}

export async function renamePuzzle(id: string, name: string): Promise<QueMiPuzzleListItem> {
  const { data } = await api.patch(`${BASE}/puzzles/${id}/`, { name });
  return data;
}

export async function listBlacklist(opts?: ApiRequestOptions): Promise<QueMiBlacklistEntry[]> {
  const { data } = await api.get('/admin/que-mi/blacklist/', mergeApiOptions(opts));
  return data;
}

export async function addBlacklist(payload: { user_id?: number; username?: string }): Promise<{ user_id: number; already_exists?: boolean }> {
  const { data } = await api.post('/admin/que-mi/blacklist/', payload);
  return data;
}

export async function removeBlacklist(userId: number): Promise<void> {
  await api.delete(`/admin/que-mi/blacklist/${userId}/`);
}
