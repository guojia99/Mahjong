import api from './client';
import type { User } from '@/types';

export async function login(username: string, password: string) {
  const { data } = await api.post('/auth/login/', { username, password });
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function register(username: string, password: string) {
  const { data } = await api.post('/auth/register/', { username, password });
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
