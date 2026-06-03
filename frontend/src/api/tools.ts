import api from '@/api/client';
import type { ApiRequestOptions } from '@/api/types';
import { mergeApiOptions } from '@/api/types';

export interface DiscardAdviseMeld {
  type: 'chi' | 'pon' | 'kan' | 'ankan';
  name: string;
  red?: boolean;
}

export interface DiscardAdviseRequest {
  hand: string[];
  melds: DiscardAdviseMeld[];
  drawn: string;
  dora: string[];
}

export interface DiscardAdviseOption {
  action_id: number;
  label: string;
  type: string;
  pai?: string;
  q: number;
  pi: number;
  score: number;
  best: boolean;
}

export interface DiscardAdviseResponse {
  model_key: string;
  model_name: string;
  model_tag?: string;
  shanten?: number | null;
  options: DiscardAdviseOption[];
  analyzed_at: string;
}

export async function postDiscardAdvise(
  body: DiscardAdviseRequest,
  opts?: ApiRequestOptions,
): Promise<DiscardAdviseResponse> {
  const { data } = await api.post('/tools/discard-advise/', body, mergeApiOptions(opts));
  return data;
}
