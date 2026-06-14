import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { MahjongTile } from '@/components/MahjongTile';
import { QueMiTilePicker } from '@/components/que-mi/QueMiTilePicker';
import { buildTileAvailability } from '@/mahjong-puzzle/generator';
import {
  MELD_TILE_COUNT,
  emptyOpenGuess,
  openDrawSlotIndex,
} from '@/mahjong-puzzle/meld';
import type { QueMiOpenGuess } from '@/mahjong-puzzle/types';

type SlotRef = { kind: 'meld'; meld: number; slot: number } | { kind: 'hand'; index: number };

const MELD_BORDER_COLORS = ['#3b82f6', '#ec4899', '#f59e0b', '#10b981'];

function slotKey(ref: SlotRef): string {
  return ref.kind === 'meld' ? `m-${ref.meld}-${ref.slot}` : `h-${ref.index}`;
}

function findFirstEmptySlot(openGuess: QueMiOpenGuess, meldCount: number): SlotRef | null {
  for (let mi = 0; mi < meldCount; mi++) {
    for (let si = 0; si < MELD_TILE_COUNT; si++) {
      if (!openGuess.melds[mi]?.[si]) return { kind: 'meld', meld: mi, slot: si };
    }
  }
  for (let i = 0; i < openGuess.hand.length; i++) {
    if (!openGuess.hand[i]) return { kind: 'hand', index: i };
  }
  return null;
}

function getSlotTile(openGuess: QueMiOpenGuess, ref: SlotRef): string | null {
  if (ref.kind === 'meld') return openGuess.melds[ref.meld]?.[ref.slot] ?? null;
  return openGuess.hand[ref.index] ?? null;
}

function setSlotTile(openGuess: QueMiOpenGuess, ref: SlotRef, tile: string | null): QueMiOpenGuess {
  if (ref.kind === 'meld') {
    const melds = openGuess.melds.map((m, mi) =>
      mi === ref.meld ? m.map((t, si) => (si === ref.slot ? tile : t)) : [...m],
    );
    return { ...openGuess, melds };
  }
  const hand = openGuess.hand.map((t, i) => (i === ref.index ? tile : t));
  return { ...openGuess, hand };
}

function removeLastTile(openGuess: QueMiOpenGuess, meldCount: number): QueMiOpenGuess {
  for (let mi = meldCount - 1; mi >= 0; mi--) {
    for (let si = MELD_TILE_COUNT - 1; si >= 0; si--) {
      if (openGuess.melds[mi]?.[si]) {
        return setSlotTile(openGuess, { kind: 'meld', meld: mi, slot: si }, null);
      }
    }
  }
  for (let i = openGuess.hand.length - 1; i >= 0; i--) {
    if (openGuess.hand[i]) {
      return setSlotTile(openGuess, { kind: 'hand', index: i }, null);
    }
  }
  return openGuess;
}

export interface QueMiOpenHandInputProps {
  meldCount: number;
  openGuess: QueMiOpenGuess;
  onChange: (openGuess: QueMiOpenGuess) => void;
  dora?: string[];
  disabled?: boolean;
  onSubmit?: () => void;
  submitDisabled?: boolean;
}

export function QueMiOpenHandInput({
  meldCount,
  openGuess,
  onChange,
  dora = [],
  disabled,
  onSubmit,
  submitDisabled,
}: QueMiOpenHandInputProps) {
  const { t } = useTranslation();
  const [activeSlot, setActiveSlot] = useState<SlotRef | null>(null);
  const drawSlotIndex = openDrawSlotIndex(meldCount);

  const availability = useMemo(() => buildTileAvailability(dora), [dora]);
  const usedCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of openGuess.melds) {
      for (const tile of m) {
        if (tile) c[tile] = (c[tile] ?? 0) + 1;
      }
    }
    for (const tile of openGuess.hand) {
      if (tile) c[tile] = (c[tile] ?? 0) + 1;
    }
    return c;
  }, [openGuess]);

  const handleSlotClick = useCallback(
    (ref: SlotRef) => {
      if (disabled) return;
      const tile = getSlotTile(openGuess, ref);
      if (tile) {
        onChange(setSlotTile(openGuess, ref, null));
        setActiveSlot(ref);
      } else {
        setActiveSlot((prev) => (prev && slotKey(prev) === slotKey(ref) ? null : ref));
      }
    },
    [disabled, onChange, openGuess],
  );

  const handlePick = useCallback(
    (tile: string) => {
      if (disabled) return;
      let ref = activeSlot;
      if (!ref) {
        ref = findFirstEmptySlot(openGuess, meldCount);
        if (!ref) return;
      }
      const next = setSlotTile(openGuess, ref, tile);
      onChange(next);
      setActiveSlot(findFirstEmptySlot(next, meldCount));
    },
    [activeSlot, disabled, meldCount, onChange, openGuess],
  );

  const removeLast = useCallback(() => {
    if (disabled) return;
    const next = removeLastTile(openGuess, meldCount);
    onChange(next);
    setActiveSlot(findFirstEmptySlot(next, meldCount));
  }, [disabled, meldCount, onChange, openGuess]);

  const renderSlot = (ref: SlotRef, label?: string, marginRight = 0) => {
    const tile = getSlotTile(openGuess, ref);
    const isActive = activeSlot && slotKey(activeSlot) === slotKey(ref);
    return (
      <button
        key={slotKey(ref)}
        type="button"
        disabled={disabled}
        onClick={() => handleSlotClick(ref)}
        className="relative flex items-center justify-center rounded"
        style={{
          minWidth: 36,
          minHeight: 52,
          border: isActive ? '2px solid var(--color-primary)' : '2px dashed var(--color-border)',
          background: tile ? 'transparent' : 'rgba(0,0,0,0.03)',
          marginRight,
        }}
        aria-label={label}
      >
        {tile ? (
          <MahjongTile tile={tile} height={44} />
        ) : (
          <span className="text-[10px]" style={{ color: 'var(--color-text-light)' }}>
            {label ?? ''}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {openGuess.melds.map((meld, mi) => (
          <div key={mi}>
            <div className="text-xs font-semibold mb-1" style={{ color: MELD_BORDER_COLORS[mi % MELD_BORDER_COLORS.length] }}>
              {t('queMi.openMeldGroup', { n: mi + 1 })}
            </div>
            <div
              className="inline-flex flex-wrap items-end gap-0.5 rounded-lg px-2 py-1.5"
              style={{ border: `1.5px solid ${MELD_BORDER_COLORS[mi % MELD_BORDER_COLORS.length]}` }}
            >
              {meld.map((_, si) => renderSlot({ kind: 'meld', meld: mi, slot: si }))}
            </div>
          </div>
        ))}
        <div>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>
              {t('queMi.yourGuess')}
            </div>
          <div className="flex flex-wrap items-end gap-0.5">
            {openGuess.hand.map((_, i) =>
              renderSlot(
                { kind: 'hand', index: i },
                i === drawSlotIndex ? t('queMi.draw') : undefined,
                i === drawSlotIndex - 1 ? 8 : 0,
              ),
            )}
          </div>
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
          </div>
        </>
      )}
    </div>
  );
}

export function createEmptyOpenGuess(meldCount: number): QueMiOpenGuess {
  return emptyOpenGuess(meldCount);
}
