import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import type { HandMode, PuzzleDifficulty, PuzzleType } from '@/mahjong-puzzle/types';
import type { QueMiPuzzleListFilters } from '@/types/queMi';

const DIFFICULTIES: PuzzleDifficulty[] = ['hard', 'advanced', 'medium', 'normal', 'easy'];
const PUZZLE_TYPES: PuzzleType[] = ['winnable', 'nonWinnable'];
const HAND_MODES: HandMode[] = ['closed', 'open'];

export interface QueMiListFiltersProps {
  filters: QueMiPuzzleListFilters;
  onChange: (filters: QueMiPuzzleListFilters) => void;
  showUnplayed?: boolean;
}

export function QueMiListFilters({ filters, onChange, showUnplayed = true }: QueMiListFiltersProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const hasActiveFilters =
    filters.unplayed ||
    !!filters.difficulty ||
    !!filters.type ||
    !!filters.hand_mode;

  const clearFilters = () => {
    onChange({});
  };

  const patch = (next: Partial<QueMiPuzzleListFilters>) => {
    onChange({ ...filters, ...next });
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={16} style={{ color: 'var(--color-primary)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {t('queMiOnline.filters')}
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md"
            style={{ color: 'var(--color-text-light)', border: '1px solid var(--color-border)' }}
          >
            <X size={12} />
            {t('queMiOnline.filtersClear')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${hasActiveFilters ? '' : 'ml-auto'}`}
          style={{ color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t('queMiOnline.filtersAdvanced')}
        </button>
      </div>

      {showUnplayed && (
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!filters.unplayed}
            onChange={(e) => patch({ unplayed: e.target.checked || undefined })}
            className="rounded"
          />
          <span style={{ color: 'var(--color-text)' }}>{t('queMiOnline.filterUnplayed')}</span>
        </label>
      )}

      {expanded && (
        <div className="grid gap-4 sm:grid-cols-3 pt-1">
          <label className="block space-y-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>
              {t('queMi.selectType')}
            </span>
            <select
              className="input w-full text-sm"
              value={filters.type ?? ''}
              onChange={(e) => patch({ type: (e.target.value || undefined) as PuzzleType | undefined })}
            >
              <option value="">{t('queMiOnline.filterAll')}</option>
              {PUZZLE_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {t(`queMi.type.${pt}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>
              {t('queMi.selectDifficulty')}
            </span>
            <select
              className="input w-full text-sm"
              value={filters.difficulty ?? ''}
              onChange={(e) =>
                patch({ difficulty: (e.target.value || undefined) as PuzzleDifficulty | undefined })
              }
            >
              <option value="">{t('queMiOnline.filterAll')}</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {t(`queMi.difficulty.${d}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>
              {t('queMi.selectHandMode')}
            </span>
            <select
              className="input w-full text-sm"
              value={filters.hand_mode ?? ''}
              onChange={(e) => patch({ hand_mode: (e.target.value || undefined) as HandMode | undefined })}
            >
              <option value="">{t('queMiOnline.filterAll')}</option>
              {HAND_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`queMi.handMode.${m}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
