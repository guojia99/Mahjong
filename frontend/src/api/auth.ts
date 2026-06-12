import api from './client';
import type { User } from '@/types';

export interface LoginResponse {
  token: string;
  user: User;
  requires_password_reset?: boolean;
}

export async function login(
  username: string,
  password?: string,
  systemPassword?: string,
): Promise<LoginResponse> {
  const body: Record<string, string> = { username };
  if (password) body.password = password;
  if (systemPassword) body.system_password = systemPassword;
  const { data } = await api.post<LoginResponse>('/auth/login/', body);
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function logout() {
  try {
    await api.post('/auth/logout/');
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}

export async function getMe(): Promise<User> {
  const { data } = await api.get('/auth/me/');
  localStorage.setItem('user', JSON.stringify(data));
  return data;
}

export async function sendVerificationCode(username: string, email: string, purpose: string) {
  const { data } = await api.post('/auth/verification/send/', { username, email, purpose });
  return data;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const { data } = await api.post('/auth/change-password/', {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return data;
}

export async function confirmResetPassword(payload: {
  username: string;
  email: string;
  code: string;
  new_password: string;
  system_password?: string;
}) {
  const { data } = await api.post('/auth/reset-password/confirm/', payload);
  return data;
}

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('token');
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return !!user?.is_admin;
}
