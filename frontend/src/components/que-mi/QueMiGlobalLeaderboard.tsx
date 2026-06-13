import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import type { QueMiGlobalLeaderboardEntry } from '@/types/queMi';
import { formatQueMiDuration } from '@/components/que-mi/utils';

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

export function QueMiGlobalLeaderboardPanel({ entries }: { entries: QueMiGlobalLeaderboardEntry[] }) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-xl border p-4 sm:p-5"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} style={{ color: 'var(--color-primary)' }} />
        <h2 className="font-bold" style={{ color: 'var(--color-text)' }}>
          {t('queMiOnline.globalLeaderboard')}
        </h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-light)' }}>
          {t('queMiOnline.globalLeaderboardEmpty')}
        </p>
      ) : (
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
                <tr
                  key={e.user_id}
                  className="border-t"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="py-3 px-3 text-center align-middle">
                    <span
                      className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full text-xs font-extrabold tabular-nums"
                      style={{ ...rankBadgeStyle(e.rank), padding: '0.3rem 0.5rem' }}
                    >
                      {e.rank}
                    </span>
                  </td>
                  <td className="py-3 px-3 align-middle font-medium" style={{ color: 'var(--color-text)' }}>
                    {e.player_id ? (
                      <Link
                        to={`/player-list/${e.player_id}`}
                        className="hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {e.nickname || e.player_id}
                      </Link>
                    ) : (
                      e.nickname || '—'
                    )}
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
      )}
    </div>
  );
}
