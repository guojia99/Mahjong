import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, History, Lightbulb, Plus, Puzzle, Trophy } from 'lucide-react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { getCreatorLeaderboard, getGlobalLeaderboard, listPuzzles } from '@/api/queMi';
import { isLoggedIn } from '@/api/auth';
import { QueMiOnlineLeaderboardSection } from '@/components/que-mi/QueMiOnlineLeaderboardSection';
import { QueMiListFilters } from '@/components/que-mi/QueMiListFilters';
import { QueMiPuzzleListCard } from '@/components/que-mi/QueMiPuzzleListCard';
import type {
  QueMiCreatorLeaderboardEntry,
  QueMiGlobalLeaderboardEntry,
  QueMiLeaderboardCategory,
  QueMiPuzzleListFilters,
  QueMiPuzzleListItem,
} from '@/types/queMi';

type Tab = 'puzzles' | 'leaderboard';
type LeaderboardKind = 'player' | 'creator';

const DEFAULT_PAGE_SIZE = 20;

export default function QueMiOnlinePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('puzzles');
  const [puzzles, setPuzzles] = useState<QueMiPuzzleListItem[]>([]);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<QueMiGlobalLeaderboardEntry[]>([]);
  const [creatorLeaderboard, setCreatorLeaderboard] = useState<QueMiCreatorLeaderboardEntry[]>([]);
  const [leaderboardKind, setLeaderboardKind] = useState<LeaderboardKind>('player');
  const [leaderboardCategory, setLeaderboardCategory] = useState<QueMiLeaderboardCategory>('winnable_closed');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<QueMiPuzzleListFilters>({});
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE)),
    [totalCount],
  );

  const handleFiltersChange = useCallback((next: QueMiPuzzleListFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  useAbortableEffect(
    (signal) => {
      if (tab !== 'puzzles') return;
      setLoading(true);
      (async () => {
        try {
          const data = await listPuzzles({ ...filters, page, page_size: DEFAULT_PAGE_SIZE }, { signal });
          if (!signal.aborted) {
            setPuzzles(data.results);
            setTotalCount(data.count);
            if (data.page !== page) {
              setPage(data.page);
            }
          }
        } catch (e) {
          if (!isAbortError(e)) {
            // ignore
          }
        } finally {
          if (!signal.aborted) setLoading(false);
        }
      })();
    },
    [filters, tab, page],
  );

  useAbortableEffect(
    (signal) => {
      if (tab !== 'leaderboard') return;
      setLoading(true);
      (async () => {
        try {
          const [playerData, creatorData] = await Promise.all([
            getGlobalLeaderboard(leaderboardCategory, { signal }),
            getCreatorLeaderboard(leaderboardCategory, { signal }),
          ]);
          if (!signal.aborted) {
            setGlobalLeaderboard(playerData);
            setCreatorLeaderboard(creatorData);
          }
        } catch (e) {
          if (!isAbortError(e)) {
            // ignore
          }
        } finally {
          if (!signal.aborted) setLoading(false);
        }
      })();
    },
    [tab, leaderboardCategory],
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
          <QueMiListFilters filters={filters} onChange={handleFiltersChange} showUnplayed={isLoggedIn()} />
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
            <>
              {totalCount > 0 && (
                <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                  {t('queMiOnline.listTotal', { count: totalCount })}
                </p>
              )}
              <div className="grid gap-3">
                {puzzles.map((item) => (
                  <QueMiPuzzleListCard key={item.id} item={item} href={`/que-mi/online/${item.id}`} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline inline-flex items-center gap-1"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={16} />
                    {t('gameList.pagePrev')}
                  </button>
                  <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                    {t('gameList.pageInfo', { page, totalPages })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline inline-flex items-center gap-1"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    {t('gameList.pageNext')}
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--color-text-light)' }}>
          {t('common.loading')}
        </div>
      ) : (
        <QueMiOnlineLeaderboardSection
          kind={leaderboardKind}
          category={leaderboardCategory}
          onKindChange={setLeaderboardKind}
          onCategoryChange={setLeaderboardCategory}
          playerEntries={globalLeaderboard}
          creatorEntries={creatorLeaderboard}
        />
      )}
    </div>
  );
}
