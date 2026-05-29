import type { AxiosError } from 'axios';

export interface ParsedApiError {
  status: number | null;
  statusText: string;
  message: string;
  detail: string;
  url: string;
  method: string;
  responseBody: unknown;
}

export function parseApiError(error: unknown): ParsedApiError {
  const fallback: ParsedApiError = {
    status: null,
    statusText: '',
    message: 'Unknown error',
    detail: '',
    url: '',
    method: '',
    responseBody: null,
  };

  if (!error || typeof error !== 'object') {
    fallback.message = String(error ?? fallback.message);
    return fallback;
  }

  const ax = error as AxiosError<{ error?: string; detail?: string; message?: string }>;
  if (!ax.isAxiosError) {
    if (error instanceof Error) {
      fallback.message = error.message;
      fallback.detail = error.stack ?? '';
    }
    return fallback;
  }

  const status = ax.response?.status ?? null;
  const data = ax.response?.data;
  let message =
    (typeof data === 'object' && data && ('error' in data) && typeof data.error === 'string' && data.error) ||
    (typeof data === 'object' && data && ('detail' in data) && typeof data.detail === 'string' && data.detail) ||
    (typeof data === 'object' && data && ('message' in data) && typeof data.message === 'string' && data.message) ||
    ax.message ||
    'Request failed';

  if (status === 500) {
    message = message || 'Internal Server Error';
  }

  return {
    status,
    statusText: ax.response?.statusText ?? '',
    message,
    detail: ax.code ? `code: ${ax.code}` : '',
    url: ax.config?.url ?? '',
    method: (ax.config?.method ?? '').toUpperCase(),
    responseBody: data ?? null,
  };
}

export function formatApiErrorBody(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}
