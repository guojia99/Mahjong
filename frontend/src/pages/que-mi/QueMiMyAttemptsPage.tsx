import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { History, ArrowLeft, ChevronRight } from 'lucide-react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { getMyAttempts } from '@/api/queMi';
import { isLoggedIn } from '@/api/auth';
import type { QueMiMyAttemptItem } from '@/types/queMi';

function statusLabel(t: (k: string) => string, status: string, won: boolean): string {
  if (status === 'in_progress') return t('queMiOnline.statusInProgress');
  if (won) return t('queMi.win');
  return t('queMi.lose');
}

export default function QueMiMyAttemptsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<QueMiMyAttemptItem[]>([]);
  const [loading, setLoading] = useState(true);

  useAbortableEffect((signal) => {
    (async () => {
      try {
        const data = await getMyAttempts({ signal });
        if (!signal.aborted) setItems(data);
      } catch (e) {
        if (!isAbortError(e)) {
          // ignore
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();
  }, []);

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'var(--color-text-light)' }}>
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/que-mi/online" className="btn btn-sm btn-outline inline-flex items-center gap-1">
          <ArrowLeft size={14} />
          {t('queMiOnline.back')}
        </Link>
        <div className="flex items-center gap-2">
          <History size={20} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('queMiOnline.myAttemptsTitle')}
          </h1>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
        >
          {t('queMiOnline.myAttemptsEmpty')}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map(({ attempt, puzzle }) => (
            <Link
              key={attempt.id}
              to={`/que-mi/online/${puzzle.id}`}
              className="block rounded-xl border bg-white p-4 transition-all hover:shadow-md hover:border-pink-200"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {puzzle.type && (
                      <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                        {t(`queMi.type.${puzzle.type}`)}
                      </span>
                    )}
                    {puzzle.difficulty && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
                      >
                        {t(`queMi.difficulty.${puzzle.difficulty}`)}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        attempt.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-700'
                          : attempt.won
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {statusLabel(t, attempt.status, attempt.won)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                    {t('queMiOnline.attemptsUsedSummary', { count: attempt.attempts_used })}
                    {' · '}
                    {attempt.started_at.slice(0, 10)}
                  </p>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--color-text-light)' }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
