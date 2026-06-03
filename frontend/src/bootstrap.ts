export type BootstrapErrorKind =
  | 'js-disabled'
  | 'asset-load'
  | 'bootstrap'
  | 'runtime'
  | 'timeout'
  | 'browser-compat';

/** Safari <16.4 chokes on `\p{…}` / lookbehind in bundled RegExp literals. */
export function isBrowserCompatError(message: string, detail?: string): boolean {
  const text = `${message}\n${detail ?? ''}`;
  return /invalid regular expression|invalid group specifier name|unicode property escape/i.test(
    text,
  );
}

export function classifyBootstrapKind(
  kind: BootstrapErrorKind,
  message: string,
  detail?: string,
): BootstrapErrorKind {
  return isBrowserCompatError(message, detail) ? 'browser-compat' : kind;
}

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
  window.__mahjongBootstrap?.showError(
    classifyBootstrapKind('bootstrap', message, detail),
    message,
    detail,
  );
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
      const message = event.message || 'Failed to load resource';
      window.__mahjongBootstrap?.showError(
        classifyBootstrapKind('asset-load', message, src || undefined),
        message,
        src || undefined,
      );
      return;
    }

    // Pre-ready errors are handled by the inline script in index.html.
    if (!document.documentElement.dataset.appReady) {
      return;
    }

    const message = event.message || 'Uncaught error';
    const detail = event.error instanceof Error ? event.error.stack : undefined;
    window.__mahjongBootstrap?.showError(
      classifyBootstrapKind('runtime', message, detail),
      message,
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

    const kind = classifyBootstrapKind(
      chunkFailure ? 'asset-load' : 'runtime',
      message,
      detail,
    );

    if (!appReady) {
      if (chunkFailure || kind === 'browser-compat') {
        window.__mahjongBootstrap?.showError(kind, message, detail);
      }
      return;
    }

    window.__mahjongBootstrap?.showError(kind, message, detail);
  });
}
