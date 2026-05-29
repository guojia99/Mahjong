import { useEffect, type DependencyList } from 'react';

/**
 * 与生产环境一致的 useEffect：cleanup 时 abort 未完成请求，
 * 避免 React StrictMode 开发态双挂载导致重复打 API。
 */
export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | (() => void),
  deps: DependencyList,
): void {
  useEffect(() => {
    const controller = new AbortController();
    const cleanup = effect(controller.signal);
    return () => {
      controller.abort();
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, deps);
}
