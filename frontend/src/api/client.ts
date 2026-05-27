import axios from 'axios';
import { parseApiError, type ParsedApiError } from '@/utils/apiError';
import { isAbortError } from '@/utils/http';

let serverErrorHandler: ((error: ParsedApiError) => void) | null = null;

/** 由 ServerErrorProvider 注册，用于展示 500 错误面板 */
export function registerServerErrorHandler(handler: ((error: ParsedApiError) => void) | null) {
  serverErrorHandler = handler;
}

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Token ${token}`;
    config.headers['X-Token'] = token;
  }
  // FormData 不能使用 application/json；去掉后由浏览器/axios 生成 multipart boundary。
  if (config.data instanceof FormData) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type');
    } else {
      delete config.headers['Content-Type'];
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAbortError(error)) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    if (error.response?.status === 500 && serverErrorHandler) {
      serverErrorHandler(parseApiError(error));
    }
    return Promise.reject(error);
  }
);

export default api;
