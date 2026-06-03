export type BootstrapErrorKind =
  | 'js-disabled'
  | 'asset-load'
  | 'bootstrap'
  | 'runtime'
  | 'timeout';

export interface MahjongBootstrap {
  showError(kind: BootstrapErrorKind, message: string, detail?: string): void;
  markReady(): void;
}

declare global {
  interface Window {
    __mahjongBootstrap?: MahjongBootstrap;
  }
}

export function markAppReady(): void {
  window.__mahjongBootstrap?.markReady();
}

export function reportBootstrapError(message: string, detail?: string): void {
  window.__mahjongBootstrap?.showError('bootstrap', message, detail);
}

/** Chunk / dynamic-import failures after the app has mounted. */
function isLikelyChunkLoadFailure(reason: unknown): boolean {
  const text =
    reason instanceof Error
      ? `${reason.message}\n${reason.stack ?? ''}`
      : String(reason ?? '');
  return /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(
    text,
  );
}

/**
 * Complements React ErrorBoundary: event-handler errors, chunk load failures, etc.
 */
export function installRuntimeErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
      const src =
        target instanceof HTMLScriptElement
          ? target.src || target.getAttribute('src') || ''
          : target.href || target.getAttribute('href') || '';
      window.__mahjongBootstrap?.showError(
        'asset-load',
        event.message || 'Failed to load resource',
        src || undefined,
      );
      return;
    }

    // Pre-ready errors are handled by the inline script in index.html.
    if (!document.documentElement.dataset.appReady) {
      return;
    }

    const detail = event.error instanceof Error ? event.error.stack : undefined;
    window.__mahjongBootstrap?.showError(
      'runtime',
      event.message || 'Uncaught error',
      detail,
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
    const detail =
      reason instanceof Error ? reason.stack : String(reason ?? '');
    const appReady = Boolean(document.documentElement.dataset.appReady);
    const chunkFailure = isLikelyChunkLoadFailure(reason);

    if (!appReady) {
      if (chunkFailure) {
        window.__mahjongBootstrap?.showError('asset-load', message, detail);
      }
      return;
    }

    if (chunkFailure) {
      window.__mahjongBootstrap?.showError('asset-load', message, detail);
      return;
    }

    window.__mahjongBootstrap?.showError('runtime', message, detail);
  });
}
