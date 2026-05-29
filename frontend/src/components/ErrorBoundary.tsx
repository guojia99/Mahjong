import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
}

function ErrorFallbackView({ error, componentStack, onRetry }: {
  error: Error;
  componentStack: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-bg, #fafafa)' }}>
      <div
        className="w-full max-w-xl rounded-2xl border bg-white shadow-lg overflow-hidden"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="px-6 py-5 border-b bg-amber-50 flex items-start gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={24} />
          <div>
            <h1 className="text-xl font-bold text-amber-900">{t('errors.appErrorTitle')}</h1>
            <p className="text-sm text-amber-800 mt-1">{t('errors.appErrorDesc')}</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          <div>
            <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>{t('errors.errorMessage')}</div>
            <p className="text-red-700 break-words font-mono text-xs">{error.message}</p>
          </div>

          {error.stack && (
            <div>
              <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>{t('errors.stackTrace')}</div>
              <pre
                className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words bg-gray-50 border max-h-40"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
              >
                {error.stack}
              </pre>
            </div>
          )}

          {componentStack && (
            <div>
              <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>{t('errors.componentStack')}</div>
              <pre
                className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words bg-gray-50 border max-h-32"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
              >
                {componentStack}
              </pre>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600"
          >
            <RefreshCw size={14} /> {t('common.retry')}
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <Home size={14} /> {t('errors.backHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? '' });
    console.error('App error boundary:', error, info);
  }

  handleRetry = () => {
    this.setState({ error: null, componentStack: '' });
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallbackView
          error={this.state.error}
          componentStack={this.state.componentStack}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}
