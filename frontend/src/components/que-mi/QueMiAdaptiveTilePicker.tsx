import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PUZZLE_TILE_ROWS } from '@/mahjong-puzzle/tiles';

const TILE_WIDTH_RATIO = 0.88;
const TILE_HEIGHT_MAX = 50;
const TILE_HEIGHT_MIN = 22;
const MAX_TILES_PER_ROW = 9;
const GAP_PX = 2;

export function useAdaptivePickerTileHeight(containerRef: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(36);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const gaps = (MAX_TILES_PER_ROW - 1) * GAP_PX;
      const next = (w - gaps) / (MAX_TILES_PER_ROW * TILE_WIDTH_RATIO);
      setHeight(Math.min(TILE_HEIGHT_MAX, Math.max(TILE_HEIGHT_MIN, Math.floor(next))));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return height;
}

export interface QueMiAdaptiveTilePickerProps {
  rows?: readonly (readonly string[])[];
  renderTile: (tile: string, tileHeight: number) => ReactNode;
  className?: string;
  onTileHeightChange?: (height: number) => void;
}

export function QueMiAdaptiveTilePicker({
  rows = PUZZLE_TILE_ROWS,
  renderTile,
  className,
  onTileHeightChange,
}: QueMiAdaptiveTilePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tileHeight = useAdaptivePickerTileHeight(ref);

  useEffect(() => {
    onTileHeightChange?.(tileHeight);
  }, [tileHeight, onTileHeightChange]);

  return (
    <div ref={ref} className={className} style={{ width: '100%', minWidth: 0 }}>
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="flex flex-nowrap justify-center items-center"
          style={{ gap: GAP_PX, marginBottom: ri < rows.length - 1 ? GAP_PX : 0 }}
        >
          {row.map((tile) => (
            <span key={tile} className="shrink-0 leading-none">
              {renderTile(tile, tileHeight)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
