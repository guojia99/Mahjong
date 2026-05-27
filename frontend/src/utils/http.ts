import axios from 'axios';

/** 请求被 AbortController 取消（含 React StrictMode 卸载） */
export function isAbortError(error: unknown): boolean {
  if (axios.isCancel(error)) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_CANCELED' || code === 'ECONNABORTED') return true;
  }
  return false;
}
