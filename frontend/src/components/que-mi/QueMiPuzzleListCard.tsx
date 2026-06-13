import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Trophy, Users } from 'lucide-react';
import type { QueMiAttemptStatus, QueMiPuzzleListItem } from '@/types/queMi';

function attemptStatusBadgeClass(status: QueMiAttemptStatus): string {
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700';
  if (status === 'won') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-600';
}

function attemptStatusLabel(t: (k: string) => string, status: QueMiAttemptStatus): string {
  if (status === 'in_progress') return t('queMiOnline.statusInProgress');
  if (status === 'won') return t('queMi.win');
  return t('queMi.lose');
}

export interface QueMiPuzzleListCardProps {
  item: QueMiPuzzleListItem;
  href: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}

export function QueMiPuzzleListCard({ item, href, subtitle, trailing }: QueMiPuzzleListCardProps) {
  const { t } = useTranslation();

  return (
    <Link
      to={href}
      className="block rounded-xl border bg-white p-4 transition-all hover:shadow-md hover:border-pink-200 no-underline"
      style={{ borderColor: 'var(--color-border)', color: 'inherit' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate mb-1" style={{ color: 'var(--color-text)' }}>
            {item.name}
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              {t(`queMi.type.${item.puzzle.type}`)}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
            >
              {t(`queMi.difficulty.${item.puzzle.difficulty}`)}
            </span>
            {item.is_mine && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                {t('queMiOnline.mine')}
              </span>
            )}
            {item.is_disabled && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                {t('queMiOnline.disabled')}
              </span>
            )}
            {item.my_attempt_status && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${attemptStatusBadgeClass(item.my_attempt_status)}`}
              >
                {attemptStatusLabel(t, item.my_attempt_status)}
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            {subtitle ??
              `${t('queMiOnline.byCreator', { name: item.creator_name || '—' })} · ${t(`queMi.handMode.${item.puzzle.handMode}`)}${
                item.puzzle.shanten != null ? ` · ${t('queMi.shanten')} ${item.puzzle.shanten}` : ''
              }`}
          </p>
          <div className="flex flex-wrap gap-3 mt-2 text-xs" style={{ color: 'var(--color-text-light)' }}>
            <span className="inline-flex items-center gap-1">
              <Users size={12} />
              {t('queMiOnline.playCount', { count: item.play_count })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Trophy size={12} />
              {t('queMiOnline.solveCount', { count: item.solve_count })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {trailing}
          <ChevronRight size={18} style={{ color: 'var(--color-text-light)' }} />
        </div>
      </div>
    </Link>
  );
}
