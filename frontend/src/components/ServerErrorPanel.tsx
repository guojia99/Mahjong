import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import { useServerError } from '@/context/ServerErrorContext';
import { formatApiErrorBody } from '@/utils/apiError';

export default function ServerErrorPanel() {
  const { t } = useTranslation();
  const { error, clearServerError } = useServerError();

  if (!error || error.status !== 500) {
    return null;
  }

  const bodyText = formatApiErrorBody(error.responseBody);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-error-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border bg-white shadow-2xl overflow-hidden"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b bg-red-50" style={{ borderColor: 'var(--color-border)' }}>
          <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={22} />
          <div className="flex-1 min-w-0">
            <h2 id="server-error-title" className="font-bold text-red-800">
              {t('errors.serverErrorTitle')}
            </h2>
            <p className="text-sm text-red-700 mt-1">{t('errors.serverErrorDesc')}</p>
          </div>
          <button
            type="button"
            onClick={clearServerError}
            className="p-1 rounded-lg hover:bg-red-100 text-red-700"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
          <div>
            <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              {t('errors.errorMessage')}
            </div>
            <p className="text-red-700 break-words">{error.message}</p>
          </div>

          {(error.method || error.url) && (
            <div>
              <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                {t('errors.requestInfo')}
              </div>
              <p className="font-mono text-xs break-all" style={{ color: 'var(--color-text-light)' }}>
                {error.method} {error.url || '—'}
              </p>
              {error.status != null && (
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                  HTTP {error.status} {error.statusText}
                </p>
              )}
            </div>
          )}

          {bodyText && (
            <div>
              <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                {t('errors.responseBody')}
              </div>
              <pre
                className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words bg-gray-50 border"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
              >
                {bodyText}
              </pre>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={clearServerError}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
