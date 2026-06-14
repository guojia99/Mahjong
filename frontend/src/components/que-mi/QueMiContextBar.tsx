import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { MahjongTile } from '@/components/MahjongTile';
import type { AgariWay, HandMode, Wind } from '@/mahjong-puzzle/types';
import { formatQueMiDuration } from '@/components/que-mi/utils';

type ContextTagVariant = 'field' | 'seat' | 'agariTsumo' | 'agariRon' | 'dora' | 'shanten' | 'attempts' | 'timer';

const CONTEXT_TAG_STYLES: Record<ContextTagVariant, { bg: string; border: string; label: string; value: string }> = {
  field: { bg: '#dbeafe', border: '#3b82f6', label: '#1e40af', value: '#1d4ed8' },
  seat: { bg: '#fce7f3', border: '#ec4899', label: '#9d174d', value: '#be185d' },
  agariTsumo: { bg: '#fef3c7', border: '#f59e0b', label: '#92400e', value: '#b45309' },
  agariRon: { bg: '#ffedd5', border: '#f97316', label: '#9a3412', value: '#c2410c' },
  dora: { bg: '#d1fae5', border: '#10b981', label: '#065f46', value: '#047857' },
  shanten: { bg: '#ede9fe', border: '#8b5cf6', label: '#5b21b6', value: '#6d28d9' },
  attempts: { bg: '#fff5f9', border: '#e8a0bf', label: '#9d3d6b', value: '#d484a8' },
  timer: { bg: '#f1f5f9', border: '#94a3b8', label: '#475569', value: '#334155' },
};

function ContextTag({
  variant,
  label,
  children,
}: {
  variant: ContextTagVariant;
  label: string;
  children: React.ReactNode;
}) {
  const s = CONTEXT_TAG_STYLES[variant];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold leading-none"
      style={{ background: s.bg, border: `1.5px solid ${s.border}` }}
    >
      <span style={{ color: s.label }}>{label}</span>
      <span style={{ color: s.value }}>{children}</span>
    </span>
  );
}

export interface QueMiContextBarProps {
  fieldWind: Wind;
  seatWind: Wind;
  agariWay: AgariWay;
  dora: string[];
  shanten?: number;
  handMode?: HandMode;
  openMeldCount?: number;
  attemptsLeft?: number;
  startedAt?: number;
  durationMs?: number;
  showAttempts?: boolean;
  showTimer?: boolean;
  liveTimer?: boolean;
  /** Puzzle max attempts (creator / preview). */
  maxAttempts?: number;
}

export function QueMiContextBar({
  fieldWind,
  seatWind,
  agariWay,
  dora,
  shanten,
  handMode = 'closed',
  openMeldCount,
  attemptsLeft,
  startedAt,
  durationMs,
  showAttempts = false,
  showTimer = false,
  liveTimer = false,
  maxAttempts,
}: QueMiContextBarProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!liveTimer || startedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [liveTimer, startedAt]);

  const windLabel = (w: Wind) => t(`queMi.wind.${w}`);

  const displayMs =
    durationMs != null
      ? durationMs
      : startedAt != null
        ? now - startedAt
        : 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ContextTag variant="field" label={t('queMi.fieldWind')}>
        {windLabel(fieldWind)}
      </ContextTag>
      <ContextTag variant="seat" label={t('queMi.seatWind')}>
        {windLabel(seatWind)}
      </ContextTag>
      <ContextTag variant={agariWay === 'tsumo' ? 'agariTsumo' : 'agariRon'} label={t('queMi.agariWay')}>
        {t(`queMi.agari.${agariWay}`)}
      </ContextTag>
      <ContextTag variant="dora" label={t('queMi.dora')}>
        <span className="inline-flex items-center gap-0.5">
          {dora.map((d) => (
            <MahjongTile key={d} tile={d} height={24} />
          ))}
        </span>
      </ContextTag>
      {handMode === 'open' && openMeldCount != null ? (
        <ContextTag variant="shanten" label={t('queMi.openMelds')}>
          {t('queMi.openMeldCount', { n: openMeldCount })}
        </ContextTag>
      ) : shanten != null ? (
        <ContextTag variant="shanten" label={t('queMi.shanten')}>
          {shanten}
        </ContextTag>
      ) : null}
      {maxAttempts != null && (
        <ContextTag variant="attempts" label={t('queMi.puzzleAttempts')}>
          {t('queMi.attemptsCount', { count: maxAttempts })}
        </ContextTag>
      )}
      {(showAttempts || showTimer) && (
        <span className="ml-auto flex items-center gap-2">
          {showTimer && (
            <ContextTag variant="timer" label={t('queMi.timerTag')}>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Timer size={12} aria-hidden />
                {formatQueMiDuration(displayMs)}
              </span>
            </ContextTag>
          )}
          {showAttempts && attemptsLeft != null && (
            <ContextTag variant="attempts" label={t('queMi.attemptsTag')}>
              {t('queMi.attemptsCount', { count: attemptsLeft })}
            </ContextTag>
          )}
        </span>
      )}
    </div>
  );
}
