import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, Trophy, X, XCircle } from 'lucide-react';
import { getPuzzleAttempt } from '@/api/queMi';
import { QueMiSubmitRecordsView } from '@/components/que-mi/QueMiSubmitRecordsView';
import { formatQueMiDuration } from '@/components/que-mi/utils';
import { apiSubmitsToHistory } from '@/pages/que-mi/onlineSession';
import type { QueMiLeaderboardEntry } from '@/types/queMi';
import type { QueMiPuzzle } from '@/mahjong-puzzle/types';

function rankBadgeStyle(rank: number): CSSProperties {
  if (rank === 1) {
    return {
      background: 'linear-gradient(145deg, #fffbeb 0%, #fde68a 55%, #fcd34d 100%)',
      color: '#92400e',
      border: '1px solid rgba(251, 191, 36, 0.65)',
      boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)',
    };
  }
  if (rank === 2) {
    return {
      background: 'linear-gradient(145deg, #fafafa 0%, #e5e7eb 90%)',
      color: '#475569',
      border: '1px solid rgba(148, 163, 184, 0.45)',
    };
  }
  if (rank === 3) {
    return {
      background: 'linear-gradient(145deg, #fff7ed 0%, #fed7aa 85%)',
      color: '#9a3412',
      border: '1px solid rgba(251, 146, 60, 0.4)',
    };
  }
  return {
    background: 'rgba(255,255,255,0.9)',
    color: 'var(--color-text-light)',
    border: '1px solid var(--color-border)',
  };
}

function RankCell({ rank }: { rank: number | null }) {
  if (rank == null) {
    return <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>—</span>;
  }
  return (
    <span
      className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full text-xs font-extrabold tabular-nums"
      style={{ ...rankBadgeStyle(rank), padding: '0.3rem 0.5rem' }}
    >
      {rank}
    </span>
  );
}

function ResultBadge({ won }: { won: boolean }) {
  const { t } = useTranslation();
  if (won) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: 'rgba(22, 163, 74, 0.12)', color: '#15803d', border: '1px solid rgba(22, 163, 74, 0.25)' }}
      >
        <CheckCircle2 size={13} aria-hidden />
        {t('queMiOnline.resultCorrect')}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: 'rgba(220, 38, 38, 0.08)', color: '#b91c1c', border: '1px solid rgba(220, 38, 38, 0.2)' }}
    >
      <XCircle size={13} aria-hidden />
      {t('queMiOnline.resultIncorrect')}
    </span>
  );
}

function AttemptDetailModal({
  puzzleId,
  userId,
  nickname,
  onClose,
}: {
  puzzleId: string;
  userId: number;
  nickname: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resolvedPuzzle, setResolvedPuzzle] = useState<QueMiPuzzle | null>(null);
  const [records, setRecords] = useState<ReturnType<typeof apiSubmitsToHistory>>([]);

  useEffect(() => {
    (async () => {
      try {
        const detail = await getPuzzleAttempt(puzzleId, userId);
        if (!detail.attempt.revealed_puzzle) {
          setError(true);
          return;
        }
        const p = { ...detail.attempt.revealed_puzzle, id: puzzleId };
        setResolvedPuzzle(p);
        setRecords(apiSubmitsToHistory(detail.attempt.submits, p));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [puzzleId, userId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border p-5 shadow-xl"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('queMiOnline.viewAttempt', { name: nickname })}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
              {t('queMi.submitRecords')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary p-1.5 rounded-lg" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        {loading ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-light)' }}>
            {t('common.loading')}
          </p>
        ) : error || !resolvedPuzzle ? (
          <p className="text-sm py-8 text-center text-red-600">{t('queMiOnline.loadFailed')}</p>
        ) : (
          <QueMiSubmitRecordsView puzzle={resolvedPuzzle} records={records} />
        )}
      </div>
    </div>
  );
}

function LeaderboardTable({
  entries,
  canViewAttempts,
  onViewAttempt,
}: {
  entries: QueMiLeaderboardEntry[];
  canViewAttempts: boolean;
  onViewAttempt: (entry: QueMiLeaderboardEntry) => void;
}) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-light)' }}>
        {t('queMiOnline.leaderboardEmpty')}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-light)' }}
          >
            <th className="text-center py-3 px-3 w-16">{t('queMiOnline.rank')}</th>
            <th className="text-left py-3 px-3">{t('queMiOnline.player')}</th>
            <th className="text-center py-3 px-3 w-20">{t('queMiOnline.attemptsUsed')}</th>
            <th className="text-right py-3 px-3 w-24">{t('queMiOnline.time')}</th>
            <th className="text-center py-3 px-3 w-28">{t('queMiOnline.result')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const clickable = canViewAttempts;
            return (
              <tr
                key={`${e.user_id}-${e.rank ?? 'x'}-${e.finished_at}`}
                className={`border-t transition-colors ${clickable ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-primary-light)_18%,transparent)]' : ''}`}
                style={{
                  borderColor: 'var(--color-border)',
                  background: e.won ? undefined : 'rgba(0,0,0,0.015)',
                }}
                onClick={clickable ? () => onViewAttempt(e) : undefined}
                onKeyDown={
                  clickable
                    ? (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          onViewAttempt(e);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? 'button' : undefined}
              >
                <td className="py-3 px-3 text-center align-middle">
                  <RankCell rank={e.rank} />
                </td>
                <td className="py-3 px-3 align-middle font-medium" style={{ color: 'var(--color-text)' }}>
                  {e.player_id ? (
                    <Link
                      to={`/player-list/${e.player_id}`}
                      className="hover:underline"
                      style={{ color: 'var(--color-primary)' }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.nickname || e.player_id}
                    </Link>
                  ) : (
                    e.nickname || '—'
                  )}
                </td>
                <td className="py-3 px-3 text-center align-middle tabular-nums font-medium">
                  {e.attempts_used}
                </td>
                <td className="py-3 px-3 text-right align-middle tabular-nums font-mono text-[13px]" style={{ color: 'var(--color-text)' }}>
                  {formatQueMiDuration(e.duration_ms)}
                </td>
                <td className="py-3 px-3 text-center align-middle">
                  <ResultBadge won={e.won} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canViewAttempts && entries.length > 0 && (
        <p className="text-xs px-3 py-2" style={{ color: 'var(--color-text-light)' }}>
          {t('queMiOnline.viewAttemptHint')}
        </p>
      )}
    </div>
  );
}

export interface QueMiLeaderboardPanelProps {
  entries: QueMiLeaderboardEntry[];
  puzzleId?: string;
  canViewAttempts?: boolean;
}

export function QueMiLeaderboardPanel({
  entries,
  puzzleId,
  canViewAttempts = false,
}: QueMiLeaderboardPanelProps) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState<QueMiLeaderboardEntry | null>(null);
  const solveCount = entries.filter((e) => e.won).length;
  return (
    <>
      <div
        className="mt-6 rounded-xl border p-4 sm:p-5"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Trophy size={18} style={{ color: 'var(--color-primary)' }} />
            <h2 className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('queMiOnline.leaderboard')}
            </h2>
          </div>
          {entries.length > 0 && (
            <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-light)' }}>
              {t('queMiOnline.leaderboardSummary', { total: entries.length, solved: solveCount })}
            </span>
          )}
        </div>
        <LeaderboardTable
          entries={entries}
          canViewAttempts={canViewAttempts && !!puzzleId}
          onViewAttempt={setViewing}
        />
      </div>
      {viewing && puzzleId && canViewAttempts && (
        <AttemptDetailModal
          puzzleId={puzzleId}
          userId={viewing.user_id}
          nickname={viewing.nickname}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
