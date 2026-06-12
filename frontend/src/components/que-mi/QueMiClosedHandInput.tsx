import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { MahjongTile } from '@/components/MahjongTile';
import { QueMiTilePicker } from '@/components/que-mi/QueMiTilePicker';
import { buildTileAvailability } from '@/mahjong-puzzle/generator';
import type { TileFeedback } from '@/mahjong-puzzle/types';

const HAND_TILE_COUNT = 14;
const DRAW_SLOT_INDEX = 13;

const FEEDBACK_BORDER: Record<TileFeedback, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  black: '#94a3b8',
  none: 'transparent',
};

export interface QueMiClosedHandInputProps {
  guess: (string | null)[];
  onChange: (guess: (string | null)[]) => void;
  dora?: string[];
  feedback?: TileFeedback[] | null;
  disabled?: boolean;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  onGiveUp?: () => void;
}

export function QueMiClosedHandInput({
  guess,
  onChange,
  dora = [],
  feedback,
  disabled,
  onSubmit,
  submitDisabled,
  onGiveUp,
}: QueMiClosedHandInputProps) {
  const { t } = useTranslation();
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const availability = useMemo(() => buildTileAvailability(dora), [dora]);
  const usedCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const tile of guess) {
      if (tile) c[tile] = (c[tile] ?? 0) + 1;
    }
    return c;
  }, [guess]);

  const handleSlotClick = useCallback(
    (index: number) => {
      if (disabled) return;
      if (guess[index]) {
        const next = [...guess];
        next[index] = null;
        onChange(next);
        setActiveSlot(index);
      } else {
        setActiveSlot((prev) => (prev === index ? null : index));
      }
    },
    [disabled, guess, onChange],
  );

  const handlePick = useCallback(
    (tile: string) => {
      if (disabled) return;
      let slot = activeSlot;
      if (slot == null) {
        slot = guess.findIndex((t) => !t);
        if (slot < 0) return;
      }
      const next = [...guess];
      next[slot] = tile;
      onChange(next);
      const nextEmpty = next.findIndex((t, i) => !t && i !== slot);
      setActiveSlot(nextEmpty >= 0 ? nextEmpty : null);
    },
    [activeSlot, disabled, guess, onChange],
  );

  const removeLast = useCallback(() => {
    if (disabled) return;
    for (let i = HAND_TILE_COUNT - 1; i >= 0; i--) {
      if (guess[i]) {
        const next = [...guess];
        next[i] = null;
        onChange(next);
        setActiveSlot(i);
        return;
      }
    }
  }, [disabled, guess, onChange]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          {t('queMi.yourGuess')}
        </div>
        <div className="flex flex-wrap items-end gap-0.5">
          {guess.map((tile, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => handleSlotClick(i)}
              className="relative flex items-center justify-center rounded"
              style={{
                minWidth: 36,
                minHeight: 52,
                border:
                  feedback?.[i] && feedback[i] !== 'none'
                    ? `2px solid ${FEEDBACK_BORDER[feedback[i]!]}`
                    : activeSlot === i
                      ? '2px solid var(--color-primary)'
                      : '2px dashed var(--color-border)',
                background: tile ? 'transparent' : 'rgba(0,0,0,0.03)',
                marginRight: i === DRAW_SLOT_INDEX - 1 ? 8 : 0,
              }}
              aria-label={i === DRAW_SLOT_INDEX ? t('queMi.draw') : `slot ${i + 1}`}
            >
              {tile ? (
                <MahjongTile tile={tile} height={44} />
              ) : (
                <span className="text-[10px]" style={{ color: 'var(--color-text-light)' }}>
                  {i === DRAW_SLOT_INDEX ? t('queMi.draw') : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {!disabled && (
        <>
          <QueMiTilePicker availability={availability} usedCounts={usedCounts} onPick={handlePick} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline" onClick={removeLast}>
              <Trash2 size={14} className="mr-1" />
              {t('queMi.deleteLast')}
            </button>
            {onSubmit && (
              <button
                type="button"
                className="btn-primary px-4 py-1.5 rounded-lg text-sm font-semibold"
                disabled={submitDisabled}
                onClick={onSubmit}
              >
                {t('queMi.submit')}
              </button>
            )}
            {onGiveUp && (
              <button type="button" className="btn btn-sm btn-outline" onClick={onGiveUp}>
                {t('queMi.giveUp')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
