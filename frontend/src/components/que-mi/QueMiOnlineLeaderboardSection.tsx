import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { formatQueMiDuration } from '@/components/que-mi/utils';
import type {
  QueMiCreatorLeaderboardEntry,
  QueMiGlobalLeaderboardEntry,
  QueMiLeaderboardCategory,
} from '@/types/queMi';

export const QUE_MI_LEADERBOARD_CATEGORIES: QueMiLeaderboardCategory[] = [
  'winnable_closed',
  'winnable_open',
  'non_winnable',
];

function rankBadgeStyle(rank: number): CSSProperties {
  if (rank === 1) {
    return {
      background: 'linear-gradient(145deg, #fffbeb 0%, #fde68a 55%, #fcd34d 100%)',
      color: '#92400e',
      border: '1px solid rgba(251, 191, 36, 0.65)',
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

function PlayerLink({
  playerId,
  nickname,
}: {
  playerId: string;
  nickname: string;
}) {
  if (playerId) {
    return (
      <Link
        to={`/player-list/${playerId}`}
        className="hover:underline"
        style={{ color: 'var(--color-primary)' }}
      >
        {nickname || playerId}
      </Link>
    );
  }
  return <>{nickname || '—'}</>;
}

function RankCell({ rank }: { rank: number }) {
  return (
    <td className="py-3 px-3 text-center align-middle">
      <span
        className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full text-xs font-extrabold tabular-nums"
        style={{ ...rankBadgeStyle(rank), padding: '0.3rem 0.5rem' }}
      >
        {rank}
      </span>
    </td>
  );
}

export function QueMiLeaderboardCategoryTabs({
  category,
  onChange,
}: {
  category: QueMiLeaderboardCategory;
  onChange: (next: QueMiLeaderboardCategory) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {QUE_MI_LEADERBOARD_CATEGORIES.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className="btn btn-sm"
          style={{
            background: category === key ? 'var(--color-primary)' : 'var(--color-bg)',
            color: category === key ? '#fff' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {t(`queMiOnline.leaderboardCategory.${key}`)}
        </button>
      ))}
    </div>
  );
}

export function QueMiGlobalLeaderboardTable({ entries }: { entries: QueMiGlobalLeaderboardEntry[] }) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-light)' }}>
        {t('queMiOnline.globalLeaderboardEmpty')}
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
            <th className="text-center py-3 px-3 w-20">{t('queMiOnline.globalWins')}</th>
            <th className="text-center py-3 px-3 w-20">{t('queMiOnline.globalPlayed')}</th>
            <th className="text-center py-3 px-3 w-24">{t('queMiOnline.avgAttempts')}</th>
            <th className="text-right py-3 px-3 w-24">{t('queMiOnline.avgTime')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.user_id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
              <RankCell rank={e.rank} />
              <td className="py-3 px-3 align-middle font-medium" style={{ color: 'var(--color-text)' }}>
                <PlayerLink playerId={e.player_id} nickname={e.nickname} />
              </td>
              <td className="py-3 px-3 text-center align-middle tabular-nums font-medium">{e.wins}</td>
              <td className="py-3 px-3 text-center align-middle tabular-nums">{e.played}</td>
              <td className="py-3 px-3 text-center align-middle tabular-nums">
                {e.avg_attempts != null ? e.avg_attempts.toFixed(1) : '—'}
              </td>
              <td className="py-3 px-3 text-right align-middle tabular-nums font-mono text-[13px]">
                {e.avg_duration_ms != null ? formatQueMiDuration(Math.round(e.avg_duration_ms)) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueMiCreatorLeaderboardTable({ entries }: { entries: QueMiCreatorLeaderboardEntry[] }) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-light)' }}>
        {t('queMiOnline.creatorLeaderboardEmpty')}
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
            <th className="text-left py-3 px-3">{t('queMiOnline.creator')}</th>
            <th className="text-center py-3 px-3 w-24">{t('queMiOnline.creatorAvgAttempts')}</th>
            <th className="text-center py-3 px-3 w-20">{t('queMiOnline.creatorPuzzleCount')}</th>
            <th className="text-center py-3 px-3 w-20">{t('queMiOnline.creatorPlayCount')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.user_id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
              <RankCell rank={e.rank} />
              <td className="py-3 px-3 align-middle font-medium" style={{ color: 'var(--color-text)' }}>
                <PlayerLink playerId={e.player_id} nickname={e.nickname} />
              </td>
              <td className="py-3 px-3 text-center align-middle tabular-nums font-medium">
                {e.avg_attempts_per_puzzle.toFixed(1)}
              </td>
              <td className="py-3 px-3 text-center align-middle tabular-nums">{e.puzzle_count}</td>
              <td className="py-3 px-3 text-center align-middle tabular-nums">{e.play_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LeaderboardKind = 'player' | 'creator';

export function QueMiOnlineLeaderboardSection({
  kind,
  category,
  onKindChange,
  onCategoryChange,
  playerEntries,
  creatorEntries,
}: {
  kind: LeaderboardKind;
  category: QueMiLeaderboardCategory;
  onKindChange: (next: LeaderboardKind) => void;
  onCategoryChange: (next: QueMiLeaderboardCategory) => void;
  playerEntries: QueMiGlobalLeaderboardEntry[];
  creatorEntries: QueMiCreatorLeaderboardEntry[];
}) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-xl border p-4 sm:p-5 space-y-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Trophy size={18} style={{ color: 'var(--color-primary)' }} />
        <h2 className="font-bold" style={{ color: 'var(--color-text)' }}>
          {t('queMiOnline.leaderboard')}
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onKindChange('player')}
          className="btn btn-sm"
          style={{
            background: kind === 'player' ? 'var(--color-primary)' : 'var(--color-bg)',
            color: kind === 'player' ? '#fff' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {t('queMiOnline.tabPlayerLeaderboard')}
        </button>
        <button
          type="button"
          onClick={() => onKindChange('creator')}
          className="btn btn-sm"
          style={{
            background: kind === 'creator' ? 'var(--color-primary)' : 'var(--color-bg)',
            color: kind === 'creator' ? '#fff' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {t('queMiOnline.tabCreatorLeaderboard')}
        </button>
      </div>

      <QueMiLeaderboardCategoryTabs category={category} onChange={onCategoryChange} />

      {kind === 'player' ? (
        <QueMiGlobalLeaderboardTable entries={playerEntries} />
      ) : (
        <QueMiCreatorLeaderboardTable entries={creatorEntries} />
      )}
    </div>
  );
}
