/** Mahjong tile image (same assets as PaipuReplayPanel). */

export function tileSrc(tile: string, hidden = false, sideways = false): string {
  if (hidden) return '/marjongs/B.webp';
  if (sideways) return `/marjongs/H${tile}.webp`;
  return `/marjongs/${tile}.webp`;
}

type Props = {
  tile: string;
  hidden?: boolean;
  sideways?: boolean;
  dim?: boolean;
  highlight?: boolean;
  height?: number;
  ariaLabel?: string;
};

export function MahjongTile({
  tile,
  hidden,
  sideways,
  dim,
  highlight,
  height = 32,
  ariaLabel,
}: Props) {
  return (
    <img
      src={tileSrc(tile, hidden, sideways)}
      alt={ariaLabel ?? tile}
      draggable={false}
      style={{
        height: `${height}px`,
        width: 'auto',
        borderRadius: 3,
        opacity: dim ? 0.45 : 1,
        boxShadow: highlight ? '0 0 0 2px rgba(245, 158, 11, 0.85)' : '0 1px 1px rgba(0,0,0,0.12)',
        background: '#fff',
        display: 'block',
      }}
    />
  );
}
