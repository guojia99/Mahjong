import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { History, Lightbulb, Plus, Puzzle, Trophy } from 'lucide-react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { getGlobalLeaderboard, listPuzzles } from '@/api/queMi';
import { isLoggedIn } from '@/api/auth';
import { QueMiGlobalLeaderboardPanel } from '@/components/que-mi/QueMiGlobalLeaderboard';
import { QueMiListFilters } from '@/components/que-mi/QueMiListFilters';
import { QueMiPuzzleListCard } from '@/components/que-mi/QueMiPuzzleListCard';
import type { QueMiGlobalLeaderboardEntry, QueMiPuzzleListFilters, QueMiPuzzleListItem } from '@/types/queMi';

type Tab = 'puzzles' | 'leaderboard';

export default function QueMiOnlinePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('puzzles');
  const [puzzles, setPuzzles] = useState<QueMiPuzzleListItem[]>([]);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<QueMiGlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<QueMiPuzzleListFilters>({});

  useAbortableEffect(
    (signal) => {
      if (tab !== 'puzzles') return;
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
    [filters, tab],
  );

  useAbortableEffect(
    (signal) => {
      if (tab !== 'leaderboard') return;
      setLoading(true);
      (async () => {
        try {
          const data = await getGlobalLeaderboard(undefined, { signal });
          if (!signal.aborted) setGlobalLeaderboard(data);
        } catch (e) {
          if (!isAbortError(e)) {
            // ignore
          }
        } finally {
          if (!signal.aborted) setLoading(false);
        }
      })();
    },
    [tab],
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('puzzles')}
          className="btn btn-sm inline-flex items-center gap-1"
          style={{
            background: tab === 'puzzles' ? 'var(--color-primary)' : 'var(--color-bg)',
            color: tab === 'puzzles' ? '#fff' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Puzzle size={14} />
          {t('queMiOnline.tabPuzzles')}
        </button>
        <button
          type="button"
          onClick={() => setTab('leaderboard')}
          className="btn btn-sm inline-flex items-center gap-1"
          style={{
            background: tab === 'leaderboard' ? 'var(--color-primary)' : 'var(--color-bg)',
            color: tab === 'leaderboard' ? '#fff' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Trophy size={14} />
          {t('queMiOnline.tabLeaderboard')}
        </button>
      </div>

      {tab === 'puzzles' ? (
        <>
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
        </>
      ) : loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--color-text-light)' }}>
          {t('common.loading')}
        </div>
      ) : (
        <QueMiGlobalLeaderboardPanel entries={globalLeaderboard} />
      )}
    </div>
  );
}
