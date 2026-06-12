import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { History, Lightbulb, Plus, Puzzle } from 'lucide-react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { listPuzzles } from '@/api/queMi';
import { isLoggedIn } from '@/api/auth';
import { QueMiListFilters } from '@/components/que-mi/QueMiListFilters';
import { QueMiPuzzleListCard } from '@/components/que-mi/QueMiPuzzleListCard';
import type { QueMiPuzzleListFilters, QueMiPuzzleListItem } from '@/types/queMi';

export default function QueMiOnlinePage() {
  const { t } = useTranslation();
  const [puzzles, setPuzzles] = useState<QueMiPuzzleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<QueMiPuzzleListFilters>({});

  useAbortableEffect(
    (signal) => {
      setLoading(true);
      (async () => {
        try {
          const data = await listPuzzles(filters, { signal });
          if (!signal.aborted) setPuzzles(data);
        } catch (e) {
          if (!isAbortError(e)) {
            // ignore
          }
        } finally {
          if (!signal.aborted) setLoading(false);
        }
      })();
    },
    [filters],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Puzzle size={22} style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
              {t('queMiOnline.title')}
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            {t('queMiOnline.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isLoggedIn() && (
            <>
              <Link to="/que-mi/online/create" className="btn btn-primary btn-sm inline-flex items-center gap-1">
                <Plus size={14} />
                {t('queMiOnline.create')}
              </Link>
              <Link to="/que-mi/online/my-puzzles" className="btn btn-outline btn-sm inline-flex items-center gap-1">
                <Lightbulb size={14} />
                {t('queMiOnline.myPuzzles')}
              </Link>
              <Link to="/que-mi/online/mine" className="btn btn-outline btn-sm inline-flex items-center gap-1">
                <History size={14} />
                {t('queMiOnline.myAttempts')}
              </Link>
            </>
          )}
          <Link to="/que-mi" className="btn btn-outline btn-sm">
            {t('queMiOnline.offlineLink')}
          </Link>
        </div>
      </div>

      <QueMiListFilters filters={filters} onChange={setFilters} showUnplayed={isLoggedIn()} />

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--color-text-light)' }}>
          {t('common.loading')}
        </div>
      ) : puzzles.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
        >
          {t('queMiOnline.emptyFiltered')}
        </div>
      ) : (
        <div className="grid gap-3">
          {puzzles.map((item) => (
            <QueMiPuzzleListCard key={item.id} item={item} href={`/que-mi/online/${item.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
