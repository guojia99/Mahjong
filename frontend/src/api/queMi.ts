import api from './client';
import type { ApiRequestOptions } from './types';
import { mergeApiOptions } from './types';
import type {
  QueMiBlacklistEntry,
  QueMiLeaderboardEntry,
  QueMiMyAttemptItem,
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
  const { data } = await api.get(`${BASE}/puzzles/`, { params, ...mergeApiOptions(opts) });
  return data;
}

export async function createPuzzle(puzzle: QueMiPuzzle): Promise<QueMiPuzzleListItem> {
  const { data } = await api.post(`${BASE}/puzzles/`, { puzzle });
  return data;
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

export async function adminPatchPuzzle(id: string, payload: { is_disabled?: boolean }): Promise<QueMiPuzzleListItem> {
  const { data } = await api.patch(`${BASE}/puzzles/${id}/`, payload);
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
