import { useTranslation } from 'react-i18next';
import { MahjongTile } from '@/components/MahjongTile';
import { PUZZLE_TILE_ROWS } from '@/mahjong-puzzle/tiles';

export interface QueMiTilePickerProps {
  availability: Record<string, number>;
  usedCounts?: Record<string, number>;
  onPick: (tile: string) => void;
  disabled?: boolean;
}

export function QueMiTilePicker({ availability, usedCounts = {}, onPick, disabled }: QueMiTilePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>
        {t('queMi.tilePicker')}
      </div>
      <div className="space-y-1">
        {PUZZLE_TILE_ROWS.map((row, ri) => (
          <div key={ri} className="flex flex-wrap gap-1">
            {row.map((tile) => {
              const left = (availability[tile] ?? 0) - (usedCounts[tile] ?? 0);
              const canPick = !disabled && left > 0;
              return (
                <button
                  key={tile}
                  type="button"
                  disabled={!canPick}
                  onClick={() => canPick && onPick(tile)}
                  className="p-0.5 rounded transition-opacity"
                  style={{
                    opacity: canPick ? 1 : 0.35,
                    cursor: canPick ? 'pointer' : 'not-allowed',
                    background: 'transparent',
                    border: 'none',
                  }}
                  aria-label={tile}
                >
                  <MahjongTile tile={tile} height={36} dim={!canPick} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
