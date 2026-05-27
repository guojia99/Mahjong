/** 可选的 axios 请求选项（用于在 useAbortableEffect 中取消请求） */
export type ApiRequestOptions = {
  signal?: AbortSignal;
};

export function mergeApiOptions(opts?: ApiRequestOptions): { signal?: AbortSignal } {
  return opts?.signal ? { signal: opts.signal } : {};
}
