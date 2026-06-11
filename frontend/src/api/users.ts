import api from './client';
import type { LoginLogPage, UnboundUser } from '@/types';

export async function getUnboundUsers() {
  const { data } = await api.get<UnboundUser[]>('/admin/users/unbound/');
  return data;
}

export async function getLoginLogs(params?: {
  page?: number;
  page_size?: number;
  user_id?: number;
  player_id?: string;
  username?: string;
}) {
  const { data } = await api.get<LoginLogPage>('/admin/login-logs/', { params });
  return data;
}
