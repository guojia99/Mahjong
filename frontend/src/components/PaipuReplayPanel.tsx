import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward, Eye, EyeOff, Layers } from 'lucide-react';
import { PaipuAiPanel } from '@/components/PaipuAiPanel';
import type { Game } from '@/types';
import {
  buildMajsoulAccountBindings,
  buildPaipuReplayModel,
  indicatorToDora,
  type Frame,
  type Meld,
  type ReplayRound,
  type SeatPlayerDisplay,
  type SeatState,
} from '@/paipu/paipuReplayModel';
import { extractPaipuActions } from '@/paipu/paipuDetailModel';

const ROUND_WIND_KEY = ['east', 'south', 'west', 'north'] as const;

type Props = {
  game: Game;
};

export function canShowPaipuReplay(game: Game | null): boolean {
  if (!game || game.game_type !== 'online') return false;
  if (game.paipu_has_actions === true) return true;
  const pd = game.paipu_data as Record<string, unknown> | undefined;
  return extractPaipuActions(pd).length > 0;
}

const TILE_H_UPRIGHT = 30; // 立牌高度 px
const TILE_H_SIDEWAYS = 20; // 河牌横置高度 px
/** 左右家手牌略小，旋转后纵向更省一点（不改 gap / marginTop 策略） */
const SIDE_TILE_H = 30;
const SIDE_STACK_PULL = -6; // 第二张起向上叠 0.5px（等同 gap: -0.5 效果）
const DRAW_TILE_GAP = 14; // 摸牌与手牌间距
const DORA_SLOT_COUNT = 5; // 表宝牌 / 里宝牌各 5 枚槽位

/** 牌河最多 3 行 × 6 列；为中央格预留固定空间，避免被场风盘挤压 */
const RIVER_MAX_COLS = 6;
const RIVER_MAX_ROWS = 3;
const RIVER_TILE_GAP = 1;
const RIVER_ROW_GAP = 2;
/** width:auto @ h=30/20 的保守宽度（雀魂比例约 3:4） */
const TILE_W_UPRIGHT = 24;
const TILE_W_SIDEWAYS = 28;
const H_RIVER_BAND_MIN = RIVER_MAX_ROWS * TILE_H_UPRIGHT + (RIVER_MAX_ROWS - 1) * RIVER_TILE_GAP;
const W_RIVER_BAND_MIN = RIVER_MAX_COLS * TILE_W_UPRIGHT + (RIVER_MAX_COLS - 1) * RIVER_TILE_GAP;
const W_SIDE_RIVER_MIN = RIVER_MAX_ROWS * TILE_W_SIDEWAYS + (RIVER_MAX_ROWS - 1) * RIVER_ROW_GAP;
const H_SIDE_RIVER_MIN = RIVER_MAX_COLS * TILE_H_SIDEWAYS + (RIVER_MAX_COLS - 1) * RIVER_TILE_GAP;
const CENTER_INFO_MIN_W = 118;
const CENTER_INFO_MIN_H = 108;
const CENTER_PLATE_MIN_W = W_SIDE_RIVER_MIN * 2 + CENTER_INFO_MIN_W + 16;
const CENTER_PLATE_MIN_H = H_RIVER_BAND_MIN * 2 + CENTER_INFO_MIN_H + 16;
/** 牌桌按此尺寸排版（含四家手牌/牌河），窄屏用容器查询等比缩放到 100% 宽度 */
const BOARD_DESIGN_SIZE = Math.max(
  720,
  W_SIDE_RIVER_MIN * 2 + W_RIVER_BAND_MIN * 2 + CENTER_INFO_MIN_W + 200,
  CENTER_PLATE_MIN_H + 280,
);

type TableSide = 'bottom' | 'right' | 'top' | 'left';

/** 以 viewSeat 为「自家」（下方），逆时针：下 → 右 → 对 → 左 */
function seatsForView(viewSeat: number): Record<TableSide, number> {
  return {
    bottom: viewSeat,
    right: (viewSeat + 1) % 4,
    top: (viewSeat + 2) % 4,
    left: (viewSeat + 3) % 4,
  };
}

function tileSrc(tile: string, hidden = false, sideways = false): string {
  if (hidden) return '/marjongs/B.webp';
  if (sideways) return `/marjongs/H${tile}.webp`;
  return `/marjongs/${tile}.webp`;
}

function Tile({
  tile,
  hidden,
  sideways,
  dim,
  highlight,
  height,
  ariaLabel,
}: {
  tile: string;
  hidden?: boolean;
  sideways?: boolean;
  dim?: boolean;
  highlight?: boolean;
  height?: number;
  ariaLabel?: string;
}) {
  const h = height ?? (sideways ? TILE_H_SIDEWAYS : TILE_H_UPRIGHT);
  return (
    <img
      src={tileSrc(tile, hidden, sideways)}
      alt={ariaLabel ?? tile}
      draggable={false}
      style={{
        height: `${h}px`,
        width: 'auto',
        flexShrink: 0,
        borderRadius: 3,
        opacity: dim ? 0.45 : 1,
        boxShadow: highlight ? '0 0 0 2px rgba(245, 158, 11, 0.85)' : '0 1px 1px rgba(0,0,0,0.12)',
        background: '#fff',
      }}
    />
  );
}

function MeldView({ meld }: { meld: Meld }) {
  // 副露：把 tiles 顺序渲染，sideways 横置；加杠叠加效果用绝对定位
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < meld.tiles.length) {
    const t = meld.tiles[i];
    // 加杠：相邻两张 sideways=true 且第二张 stacked=true → 叠成方块
    const next = meld.tiles[i + 1];
    if (t.sideways && next && next.sideways && next.stacked) {
      elements.push(
        <span key={`m${i}`} style={{ position: 'relative', display: 'inline-block', width: TILE_H_SIDEWAYS, height: TILE_H_SIDEWAYS * 2 + 2, alignSelf: 'flex-end' }}>
          <img
            src={tileSrc(t.tile, false, true)}
            alt={t.tile}
            draggable={false}
            style={{ position: 'absolute', bottom: 0, left: 0, height: TILE_H_SIDEWAYS, width: 'auto', borderRadius: 3, background: '#fff' }}
          />
          <img
            src={tileSrc(next.tile, false, true)}
            alt={next.tile}
            draggable={false}
            style={{ position: 'absolute', bottom: TILE_H_SIDEWAYS, left: 0, height: TILE_H_SIDEWAYS, width: 'auto', borderRadius: 3, background: '#fff' }}
          />
        </span>,
      );
      i += 2;
      continue;
    }
    if (t.sideways) {
      elements.push(
        <span key={`m${i}`} style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
          <Tile tile={t.tile} sideways />
        </span>,
      );
    } else {
      elements.push(
        <span key={`m${i}`} style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
          {/* 暗杠：盖牌使用 B.webp */}
          {meld.kind === 'ankan' && (i === 0 || i === meld.tiles.length - 1)
            ? <Tile tile={t.tile} hidden />
            : <Tile tile={t.tile} />}
        </span>,
      );
    }
    i += 1;
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1, padding: '0 2px' }}>
      {elements}
    </div>
  );
}

function HandRow({
  seat,
  faceUp,
  isActor,
  highlight,
}: {
  seat: SeatState;
  faceUp: boolean;
  isActor: boolean;
  highlight?: string;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1, flexWrap: 'nowrap' }}>
      {seat.hand.map((t, idx) => (
        <Tile key={`${t}-${idx}`} tile={t} hidden={!faceUp} highlight={highlight === t} />
      ))}
      {seat.draw && (
        <>
          <span style={{ width: DRAW_TILE_GAP, flexShrink: 0 }} aria-hidden />
          <Tile tile={seat.draw} hidden={!faceUp} highlight={isActor || highlight === seat.draw} />
        </>
      )}
      {seat.melds.length > 0 && (
        <>
          <span style={{ width: 8 }} />
          {seat.melds.map((m, mi) => (
            <MeldView key={`m-${mi}`} meld={m} />
          ))}
        </>
      )}
    </div>
  );
}

/** 将舍牌排成最多 3 行 × 6 列（日麻标准牌河密度） */
function buildDiscardRows(discards: SeatState['discards']): SeatState['discards'][] {
  const rows: SeatState['discards'][] = [[], [], []];
  let r = 0;
  for (const d of discards) {
    if (rows[r].length >= 6) {
      r = Math.min(r + 1, 2);
      if (rows[r].length >= 6 && r < 2) r += 1;
    }
    rows[r].push(d);
  }
  return rows.filter((row) => row.length > 0);
}

/** 中央场风盘内的单侧牌河：本家/对家立牌展示，仅立直宣言牌横置；左右家河牌横置朝场心 */
function CenterDiscardRiver({ seat, side }: { seat: SeatState; side: TableSide }) {
  const rows = buildDiscardRows(seat.discards);
  const tileInRiver = (d: SeatState['discards'][0], key: string) => {
    const horizontalRiver = side === 'left' || side === 'right';
    const sideways = horizontalRiver ? true : d.sideways;
    const height = sideways ? TILE_H_SIDEWAYS : TILE_H_UPRIGHT;
    const flipFace = side === 'left';
    return (
    <span
      key={key}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexShrink: 0,
        transform: flipFace ? 'rotate(180deg)' : undefined,
      }}
    >
      <Tile
        tile={d.tile}
        sideways={sideways}
        dim={d.called}
        height={height}
      />
      {d.called && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            color: '#ce93d8',
            pointerEvents: 'none',
          }}
        >
          ◯
        </span>
      )}
    </span>
    );
  };

  const rowBlock = (row: SeatState['discards'], ri: number) => (
    <div
      key={`row-${ri}`}
      style={{
        display: 'flex',
        gap: RIVER_TILE_GAP,
        flexDirection: side === 'left' || side === 'right' ? 'column' : 'row',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {row.map((d, di) => tileInRiver(d, `${ri}-${di}`))}
    </div>
  );

  const outer: CSSProperties = {
    display: 'flex',
    gap: RIVER_ROW_GAP,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
    ...(side === 'left' || side === 'right'
      ? { minWidth: W_SIDE_RIVER_MIN, minHeight: H_SIDE_RIVER_MIN }
      : { minWidth: W_RIVER_BAND_MIN, minHeight: H_RIVER_BAND_MIN }),
  };

  if (side === 'bottom') {
    return (
      <div style={{ ...outer, flexDirection: 'column', alignItems: 'center' }}>
        {rows.map((row, ri) => rowBlock(row, ri))}
      </div>
    );
  }
  if (side === 'top') {
    return (
      <div style={{ ...outer, flexDirection: 'column-reverse', alignItems: 'center' }}>
        {rows.map((row, ri) => rowBlock(row, ri))}
      </div>
    );
  }
  if (side === 'left') {
    return (
      <div
        style={{
          ...outer,
          flexDirection: 'row-reverse',
        }}
      >
        {rows.map((row, ri) => (
          <div
            key={`col-${ri}`}
            style={{ display: 'flex', flexDirection: 'column', gap: RIVER_TILE_GAP, flexShrink: 0 }}
          >
            {row.map((d, di) => tileInRiver(d, `${ri}-${di}`))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ ...outer, flexDirection: 'row' }}>
      {rows.map((row, ri) => (
        <div
          key={`col-${ri}`}
          style={{ display: 'flex', flexDirection: 'column', gap: RIVER_TILE_GAP, flexShrink: 0 }}
        >
          {row.map((d, di) => tileInRiver(d, `${ri}-${di}`))}
        </div>
      ))}
    </div>
  );
}

function SeatHeader({
  player,
  isDealer,
  isActor,
  score,
  riichi,
  tingpais,
  showTingpai,
}: {
  player: SeatPlayerDisplay;
  isDealer: boolean;
  isActor: boolean;
  score: number;
  riichi: boolean;
  tingpais: { tile: string; count: number }[] | null;
  showTingpai: boolean;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        background: isActor
          ? 'linear-gradient(90deg, rgba(255, 236, 179, 0.85) 0%, rgba(255, 248, 224, 0.6) 100%)'
          : 'rgba(255,255,255,0.78)',
        border: isActor ? '1.5px solid #f0b830' : '1px solid var(--color-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      {player.avatar ? (
        <img
          src={player.avatar}
          alt={player.nickname}
          style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary-dark)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {player.nickname.charAt(0)}
        </span>
      )}
      {isDealer && (
        <span
          style={{
            fontSize: 10,
            background: '#fff3e0',
            color: '#e65100',
            border: '1px solid rgba(230, 120, 0, 0.35)',
            borderRadius: 4,
            padding: '1px 4px',
            fontWeight: 700,
          }}
        >
          ⚐
        </span>
      )}
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
        {player.nickname}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: score >= 25000 ? '#1d7a5c' : score >= 15000 ? 'var(--color-text)' : '#a84848',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {score.toLocaleString()}
      </span>
      {riichi && (
        <span
          style={{
            fontSize: 10,
            color: '#fff',
            background: '#d35400',
            borderRadius: 3,
            padding: '1px 5px',
            fontWeight: 800,
            letterSpacing: '0.05em',
          }}
        >
          R
        </span>
      )}
      {showTingpai && tingpais && tingpais.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>聴</span>
          {tingpais.slice(0, 6).map((t, i) => (
            <Tile key={i} tile={t.tile} height={18} />
          ))}
        </span>
      )}
    </div>
  );
}

function DoraIndicators({
  indicators,
  ura,
  showUra,
}: {
  indicators: string[];
  ura: string[];
  showUra: boolean;
}) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {Array.from({ length: DORA_SLOT_COUNT }, (_, i) =>
          indicators[i] ? (
            <Tile key={`d-${i}`} tile={indicators[i]} height={24} />
          ) : (
            <Tile key={`db-${i}`} tile="B" hidden height={24} />
          ),
        )}
      </div>
      <div style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {Array.from({ length: DORA_SLOT_COUNT }, (_, i) => {
          const t = showUra ? ura[i] : undefined;
          return t ? <Tile key={`u-${i}`} tile={t} height={20} /> : <Tile key={`u-${i}`} tile="B" hidden height={20} />;
        })}
      </div>
    </div>
  );
}

function WallSummary({
  remaining,
  honba,
  riichibou,
  t,
}: {
  remaining: number;
  honba: number;
  riichibou: number;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '4px 8px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.15)',
        minWidth: 72,
      }}
    >
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.06em' }}>
        {t('paipuReplay.wallRemaining')}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          lineHeight: 1,
          color: '#fff',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {remaining}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.35 }}>
        {honba}
        {t('paipuReplay.honbaUnit')} · {t('paipuReplay.riichiSticks', { count: riichibou })}
      </div>
    </div>
  );
}

/** 左右家：手牌沿桌边纵向紧凑排列，单张牌 ±90°（牌面朝场心） */
function SideHandColumn({
  seat,
  side,
  faceUp,
  isActor,
}: {
  seat: SeatState;
  side: 'left' | 'right';
  faceUp: boolean;
  isActor: boolean;
}) {
  const deg = side === 'left' ? -90 : 90;

  const wrapRotated = (child: ReactNode, key: string, stackIndex: number) => (
    <div
      key={key}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 0,
        marginTop: stackIndex > 0 ? SIDE_STACK_PULL : 0,
      }}
    >
      <div
        style={{
          transform: `rotate(${deg}deg)`,
          display: 'block',
          lineHeight: 0,
          fontSize: 0,
        }}
      >
        {child}
      </div>
    </div>
  );

  const handTiles = [...seat.hand];
  const handCol = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        gap: 0,
        lineHeight: 0,
        fontSize: 0,
      }}
    >
      {handTiles.map((t, idx) =>
        wrapRotated(<Tile tile={t} hidden={!faceUp} height={SIDE_TILE_H} />, `h-${t}-${idx}`, idx),
      )}
      {seat.draw && (
        <div style={{ marginTop: DRAW_TILE_GAP, flexShrink: 0 }}>
          {wrapRotated(
            <Tile tile={seat.draw} hidden={!faceUp} highlight={isActor} height={SIDE_TILE_H} />,
            'draw',
            handTiles.length,
          )}
        </div>
      )}
    </div>
  );

  const meldCol =
    seat.melds.length > 0 ? (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {seat.melds.map((m, mi) => wrapRotated(<MeldView meld={m} />, `m-${mi}`, mi))}
      </div>
    ) : null;

  // 左家：手牌靠外、副露靠场心；右家：副露靠场心、手牌靠外
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        flexShrink: 0,
        padding: '2px 0',
      }}
    >
      {side === 'left' ? (
        <>
          {handCol}
          {meldCol}
        </>
      ) : (
        <>
          {meldCol}
          {handCol}
        </>
      )}
    </div>
  );
}

/** 四边之一：仅手牌 + 副露 */
function HandEdgeStrip({
  seat,
  side,
  faceUp,
  isActor,
}: {
  seat: SeatState;
  side: TableSide;
  faceUp: boolean;
  isActor: boolean;
}) {
  if (side === 'left' || side === 'right') {
    return <SideHandColumn seat={seat} side={side} faceUp={faceUp} isActor={isActor} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '2px 4px',
        width: 'max-content',
        maxWidth: 'none',
        margin: '0 auto',
      }}
    >
      <HandRow seat={seat} faceUp={faceUp} isActor={isActor} />
    </div>
  );
}

const ROUND_NAME = ['東', '南', '西', '北'] as const;

function formatRoundLabel(r: ReplayRound, t: (k: string, o?: Record<string, unknown>) => string): string {
  const wind = ROUND_NAME[r.chang] ?? '?';
  const ju = r.ju + 1;
  const ben = r.ben > 0 ? ` · ${r.ben}${t('paipuReplay.honbaUnit')}` : '';
  return `${wind} ${ju} ${t('paipuReplay.roundUnit')}${ben}`;
}

function formatFrameDescription(
  frame: Frame,
  seatPlayers: SeatPlayerDisplay[],
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const seatName = (seat: number) => seatPlayers[seat]?.nickname ?? `${seat + 1}`;
  switch (frame.summary.kind) {
    case 'newround':
      return t('paipuReplay.frameStart');
    case 'deal':
      return t('paipuReplay.frameDeal', { who: seatName(frame.summary.seat), tile: frame.summary.tile });
    case 'discard':
      if (frame.summary.riichi) {
        return t('paipuReplay.frameRiichi', { who: seatName(frame.summary.seat), tile: frame.summary.tile });
      }
      return t(frame.summary.tedashi ? 'paipuReplay.frameDiscardTedashi' : 'paipuReplay.frameDiscardMoqie', {
        who: seatName(frame.summary.seat),
        tile: frame.summary.tile,
      });
    case 'chipenggang': {
      const kindMap = { chi: 'paipuReplay.chi', pon: 'paipuReplay.pon', minkan: 'paipuReplay.minkan' } as const;
      return t('paipuReplay.frameCall', {
        who: seatName(frame.summary.seat),
        action: t(kindMap[frame.summary.meldKind]),
        tile: frame.summary.tile,
        from: seatName(frame.summary.fromSeat),
      });
    }
    case 'gangadd':
      return t(
        frame.summary.meldKind === 'ankan' ? 'paipuReplay.frameAnkan' : 'paipuReplay.frameKakan',
        { who: seatName(frame.summary.seat), tile: frame.summary.tile },
      );
    case 'hule':
      return t(frame.summary.zimo ? 'paipuReplay.frameTsumo' : 'paipuReplay.frameRon');
    case 'liuju':
      return t('paipuReplay.frameLiuJu');
    case 'notile':
      return t('paipuReplay.frameNoTile');
    default:
      return '';
  }
}

function tileLabel(tile: string): string {
  if (!tile || tile.length !== 2) return tile;
  const n = tile[0];
  const s = tile[1];
  if (s === 'z') {
    const map = ['', '東', '南', '西', '北', '白', '發', '中'];
    return map[parseInt(n, 10)] ?? tile;
  }
  if (n === '0') return `0${s}`;
  return tile;
}

export function PaipuReplayPanel({ game }: Props) {
  const { t } = useTranslation();
  const model = useMemo(() => {
    const bindings = buildMajsoulAccountBindings(game.players);
    return buildPaipuReplayModel((game.paipu_data as Record<string, unknown> | undefined) ?? {}, {
      accountBindings: bindings,
    });
  }, [game.paipu_data, game.players, game.id]);

  const [cursor, setCursor] = useState<{ round: number; frame: number }>({ round: 0, frame: 0 });
  const [viewSeat, setViewSeat] = useState(0);
  const [showOthers, setShowOthers] = useState(true);
  const [showTingpai, setShowTingpai] = useState(true);
  const [showWall, setShowWall] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700); // ms per step
  const playRef = useRef<number | null>(null);

  const roundIdx = cursor.round;
  const frameIdx = cursor.frame;
  const jumpToRound = (next: number) => {
    setCursor({ round: next, frame: 0 });
    setPlaying(false);
  };
  const setFrameIdx = (next: number | ((prev: number) => number)) =>
    setCursor((prev) => ({ round: prev.round, frame: typeof next === 'function' ? next(prev.frame) : next }));

  const round: ReplayRound | undefined = model.rounds[roundIdx];
  const frame: Frame | undefined = round?.frames[frameIdx];
  const totalFrames = round?.frames.length ?? 0;

  // 自动播放：在 setTimeout 回调里推进 frame，并在到达末帧时停止播放
  useEffect(() => {
    if (!playing || !round) return;
    if (frameIdx >= totalFrames - 1) {
      // 末帧不再调度；下一次按播放才会触发新 effect
      return;
    }
    playRef.current = window.setTimeout(() => {
      setCursor((prev) => {
        const ttl = model.rounds[prev.round]?.frames.length ?? 0;
        const nextFrame = Math.min(prev.frame + 1, ttl - 1);
        if (nextFrame >= ttl - 1) {
          setPlaying(false);
        }
        return { round: prev.round, frame: nextFrame };
      });
    }, speed);
    return () => {
      if (playRef.current != null) window.clearTimeout(playRef.current);
    };
  }, [playing, frameIdx, totalFrames, round, speed, model.rounds]);

  if (!model.hasData) {
    return (
      <div className="text-sm space-y-2" style={{ color: 'var(--color-text-light)' }}>
        <p>{t('paipuReplay.noData')}</p>
        <p className="text-xs">{t('paipuReplay.noDataHint')}</p>
      </div>
    );
  }

  if (!round || !frame) {
    return <div className="text-sm" style={{ color: 'var(--color-text-light)' }}>{t('paipuReplay.noRound')}</div>;
  }

  const seatPlayers = model.seatPlayers;
  const layout = seatsForView(viewSeat);

  const navigatePrevRound = () => jumpToRound(Math.max(0, roundIdx - 1));
  const navigateNextRound = () => jumpToRound(Math.min(model.rounds.length - 1, roundIdx + 1));
  const navigatePrevFrame = () => setFrameIdx((i) => Math.max(0, i - 1));
  const navigateNextFrame = () => setFrameIdx((i) => Math.min(totalFrames - 1, i + 1));
  const skipToStart = () => setFrameIdx(0);
  const skipToEnd = () => setFrameIdx(totalFrames - 1);

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden flex flex-col gap-3">
      {/* 控制条 */}
      <div
        className="w-full min-w-0"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          background: 'linear-gradient(180deg, rgba(255, 251, 246, 0.95) 0%, rgba(248, 244, 239, 0.95) 100%)',
        }}
      >
        <select
          value={roundIdx}
          onChange={(e) => jumpToRound(parseInt(e.target.value, 10))}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: '#fff',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-text)',
          }}
        >
          {model.rounds.map((r, i) => (
            <option key={i} value={i}>
              {formatRoundLabel(r, t)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={navigatePrevRound}
          disabled={roundIdx === 0}
          title={t('paipuReplay.prevRound')}
        >
          <ChevronLeft size={14} />
          {t('paipuReplay.prevRound')}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={navigateNextRound}
          disabled={roundIdx >= model.rounds.length - 1}
          title={t('paipuReplay.nextRound')}
        >
          {t('paipuReplay.nextRound')}
          <ChevronRight size={14} />
        </button>

        <span style={{ flex: 1 }} />

        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={skipToStart}
          disabled={frameIdx === 0}
          title={t('paipuReplay.skipStart')}
        >
          <SkipBack size={14} />
        </button>
        <button type="button" className="btn btn-sm btn-outline" onClick={navigatePrevFrame} disabled={frameIdx === 0}>
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => setPlaying((p) => !p)}
          disabled={frameIdx >= totalFrames - 1 && !playing}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? t('paipuReplay.pause') : t('paipuReplay.play')}
        </button>
        <button type="button" className="btn btn-sm btn-outline" onClick={navigateNextFrame} disabled={frameIdx >= totalFrames - 1}>
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={skipToEnd}
          disabled={frameIdx >= totalFrames - 1}
          title={t('paipuReplay.skipEnd')}
        >
          <SkipForward size={14} />
        </button>
        <select
          value={speed}
          onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: '#fff',
            fontSize: 12,
            color: 'var(--color-text)',
          }}
        >
          <option value={1200}>0.5x</option>
          <option value={700}>1.0x</option>
          <option value={400}>2.0x</option>
          <option value={200}>4.0x</option>
        </select>
      </div>

      {/* 步进条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={frameIdx}
          onChange={(e) => setFrameIdx(parseInt(e.target.value, 10))}
          style={{ flex: 1, minWidth: 0, width: '100%' }}
        />
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-light)' }}>
          {frameIdx + 1} / {totalFrames}
        </span>
      </div>

      {/* 当前一帧描述 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'rgba(255, 244, 230, 0.65)',
          border: '1px solid rgba(245, 158, 11, 0.28)',
          color: 'var(--color-text)',
          fontSize: 13,
          fontWeight: 600,
          minHeight: 36,
        }}
      >
        <span>{formatRoundLabel(round, t)}</span>
        <span style={{ color: 'var(--color-text-light)' }}>·</span>
        <span>{formatFrameDescription(frame, seatPlayers, t)}</span>
      </div>

      {/* 选项 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>{t('paipuReplay.viewSeat')}</span>
          <select
            value={viewSeat}
            onChange={(e) => setViewSeat(parseInt(e.target.value, 10))}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: '#fff',
              fontSize: 12,
              maxWidth: 160,
            }}
          >
            {[0, 1, 2, 3].map((s) => (
              <option key={s} value={s}>
                {t('paipuReplay.viewSeatOption', {
                  seat: s + 1,
                  name: seatPlayers[s]?.nickname ?? '',
                })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => setShowOthers((v) => !v)}
        >
          {showOthers ? <Eye size={14} /> : <EyeOff size={14} />}
          {showOthers ? t('paipuReplay.hideOthers') : t('paipuReplay.showOthers')}
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={showTingpai} onChange={(e) => setShowTingpai(e.target.checked)} />
          <span>{t('paipuReplay.showTingpai')}</span>
        </label>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => setShowWall((v) => !v)}
        >
          <Layers size={14} />
          {showWall ? t('paipuReplay.hideWall') : t('paipuReplay.showWall')}
        </button>
      </div>

      <div className="@container w-full min-w-0">
        <div className="grid grid-cols-1 gap-3 @[50rem]:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="flex flex-col gap-3 min-w-0 w-full">
          <ReplayTable
            round={round}
            frame={frame}
            layout={layout}
            seatPlayers={seatPlayers}
            viewSeat={viewSeat}
            showTingpai={showTingpai}
            showOthers={showOthers}
          />

          {frame.kind === 'hule' && frame.hules && (
            <HuleSummary frame={frame} seatPlayers={seatPlayers} />
          )}
          {frame.kind === 'notile' && frame.noTileInfo && (
            <NoTileSummary frame={frame} seatPlayers={seatPlayers} />
          )}
          {frame.kind === 'liuju' && <LiuJuSummary frame={frame} />}

          {showWall && (
            <PaishanView round={round} doraIndicators={frame.doraIndicators} uraDora={frame.uraDoraIndicators} />
          )}
        </div>

        <PaipuAiPanel
          className="w-full min-w-0 max-w-full @[50rem]:w-[300px] @[50rem]:max-w-[300px]"
          gameId={game.id}
          viewSeat={viewSeat}
          round={round}
          frameIdx={frameIdx}
          roundIndex={roundIdx}
          seatPlayers={seatPlayers}
          onNavigateFrame={(next) => {
            setPlaying(false);
            setFrameIdx(next);
          }}
        />
        </div>
      </div>
    </div>
  );
}

function EdgePlayerBadge({
  seatNum,
  player,
  state,
  round,
  isActor,
  showTingpai,
  compact,
}: {
  seatNum: number;
  player: SeatPlayerDisplay;
  state: SeatState;
  round: ReplayRound;
  isActor: boolean;
  showTingpai: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
        marginBottom: compact ? 2 : 4,
        width: '100%',
      }}
    >
      <SeatHeader
        player={player}
        isDealer={round.dealerSeat === seatNum}
        isActor={isActor}
        score={state.score}
        riichi={state.riichi}
        tingpais={state.tingpais}
        showTingpai={showTingpai}
      />
      <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
        {t(`paipuReplay.windPosition.${ROUND_WIND_KEY[((seatNum - round.dealerSeat + 4) % 4)]}`)}
      </span>
    </div>
  );
}

function ReplayTable({
  round,
  frame,
  layout,
  seatPlayers,
  viewSeat,
  showTingpai,
  showOthers,
}: {
  round: ReplayRound;
  frame: Frame;
  layout: Record<TableSide, number>;
  seatPlayers: SeatPlayerDisplay[];
  viewSeat: number;
  showTingpai: boolean;
  showOthers: boolean;
}) {
  const { t } = useTranslation();
  const showUra = frame.kind === 'hule' && frame.uraDoraIndicators.length > 0;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return Math.min(window.innerWidth - 32, BOARD_DESIGN_SIZE);
  });

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setViewportSize(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boardScale = viewportSize > 0 ? viewportSize / BOARD_DESIGN_SIZE : 1;

  const sideProps = (side: TableSide) => {
    const seatNum = layout[side];
    const state = frame.seats[seatNum];
    const isSelf = seatNum === viewSeat;
    return {
      seatNum,
      state,
      player: seatPlayers[seatNum],
      faceUp: isSelf || showOthers,
      isActor: frame.actorSeat === seatNum,
    };
  };

  const boardStyle: CSSProperties = {
    width: BOARD_DESIGN_SIZE,
    height: BOARD_DESIGN_SIZE,
    background: 'linear-gradient(165deg, #0e7a5a 0%, #064a36 48%, #053625 100%)',
    border: '2px solid #032a1e',
    borderRadius: 12,
    boxShadow: 'inset 0 0 40px rgba(0,0,0,0.35), 0 4px 20px rgba(0,0,0,0.12)',
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    gridTemplateColumns: 'minmax(44px, max-content) 1fr minmax(44px, max-content)',
    gap: 4,
    padding: 6,
    color: '#fff',
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  const centerPlate: CSSProperties = {
    display: 'grid',
    gridTemplateRows: `minmax(${H_RIVER_BAND_MIN}px, auto) auto minmax(${H_RIVER_BAND_MIN}px, auto)`,
    gridTemplateColumns: `minmax(${W_SIDE_RIVER_MIN}px, auto) auto minmax(${W_SIDE_RIVER_MIN}px, auto)`,
    gap: 4,
    minWidth: CENTER_PLATE_MIN_W,
    minHeight: CENTER_PLATE_MIN_H,
    width: 'max-content',
    maxWidth: '100%',
    margin: '0 auto',
    background: 'rgba(0,0,0,0.22)',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    padding: 4,
  };

  const riverSlot = (side: TableSide): CSSProperties => {
    const base: CSSProperties = {
      display: 'flex',
      overflow: 'visible',
      flexShrink: 0,
    };
    if (side === 'top') {
      return {
        ...base,
        gridColumn: 2,
        gridRow: 1,
        alignItems: 'flex-end',
        justifyContent: 'center',
        minWidth: W_RIVER_BAND_MIN,
        minHeight: H_RIVER_BAND_MIN,
      };
    }
    if (side === 'bottom') {
      return {
        ...base,
        gridColumn: 2,
        gridRow: 3,
        alignItems: 'flex-start',
        justifyContent: 'center',
        minWidth: W_RIVER_BAND_MIN,
        minHeight: H_RIVER_BAND_MIN,
      };
    }
    if (side === 'left') {
      return {
        ...base,
        gridColumn: 1,
        gridRow: 2,
        alignItems: 'center',
        justifyContent: 'flex-end',
        minWidth: W_SIDE_RIVER_MIN,
        minHeight: H_SIDE_RIVER_MIN,
      };
    }
    return {
      ...base,
      gridColumn: 3,
      gridRow: 2,
      alignItems: 'center',
      justifyContent: 'flex-start',
      minWidth: W_SIDE_RIVER_MIN,
      minHeight: H_SIDE_RIVER_MIN,
    };
  };

  const renderEdge = (side: TableSide) => {
    const p = sideProps(side);
    const isSide = side === 'left' || side === 'right';
    const isHorizontal = side === 'top' || side === 'bottom';
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: isHorizontal ? undefined : 0,
          minHeight: isSide ? 0 : undefined,
          width: isHorizontal ? 'max-content' : '100%',
          maxWidth: isHorizontal ? '100%' : undefined,
          overflow: 'hidden',
          alignSelf: 'center',
        }}
      >
        <EdgePlayerBadge
          seatNum={p.seatNum}
          player={p.player}
          state={p.state}
          round={round}
          isActor={p.isActor}
          showTingpai={showTingpai}
          compact={isSide}
        />
        <HandEdgeStrip seat={p.state} side={side} faceUp={p.faceUp} isActor={p.isActor} />
      </div>
    );
  };

  return (
    <div className="w-full min-w-0 mx-auto" style={{ maxWidth: BOARD_DESIGN_SIZE }}>
      <div
        ref={viewportRef}
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '1', contain: 'strict' }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: BOARD_DESIGN_SIZE,
            height: BOARD_DESIGN_SIZE,
            transform: `scale(${boardScale})`,
            transformOrigin: 'top left',
          }}
        >
      <div style={boardStyle}>
      {/* 上：横跨整行，手牌可完整展开 */}
      <div style={{ gridColumn: '1 / -1', gridRow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
        {renderEdge('top')}
      </div>

      {/* 左 */}
      <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        {renderEdge('left')}
      </div>

      {/* 中央：四家牌河 + 场风盘（宝牌五枚 / 里宝五枚） */}
      <div
        style={{
          gridColumn: 2,
          gridRow: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <div style={centerPlate}>
        <div style={riverSlot('top')}>
          <CenterDiscardRiver seat={frame.seats[layout.top]} side="top" />
        </div>
        <div style={riverSlot('left')}>
          <CenterDiscardRiver seat={frame.seats[layout.left]} side="left" />
        </div>
        <div
          style={{
            gridColumn: 2,
            gridRow: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '4px 6px',
            flexShrink: 0,
            minWidth: CENTER_INFO_MIN_W,
            minHeight: CENTER_INFO_MIN_H,
            background: 'rgba(0,0,0,0.35)',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.75)' }}>
            {t('paipuReplay.doraIndicators')}
          </div>
          <DoraIndicators indicators={frame.doraIndicators} ura={frame.uraDoraIndicators} showUra={showUra} />
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>{t('paipuReplay.uraDora')}</div>
          <WallSummary
            remaining={frame.wallRemaining}
            honba={round.ben}
            riichibou={frame.riichibou}
            t={t}
          />
        </div>
        <div style={riverSlot('right')}>
          <CenterDiscardRiver seat={frame.seats[layout.right]} side="right" />
        </div>
        <div style={riverSlot('bottom')}>
          <CenterDiscardRiver seat={frame.seats[layout.bottom]} side="bottom" />
        </div>
        </div>
      </div>

      {/* 右 */}
      <div style={{ gridColumn: 3, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        {renderEdge('right')}
      </div>

      {/* 下（视角座位）：横跨整行，手牌可完整展开 */}
      <div style={{ gridColumn: '1 / -1', gridRow: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
        {renderEdge('bottom')}
      </div>
      </div>
        </div>
      </div>
    </div>
  );
}

function HuleSummary({ frame, seatPlayers }: { frame: Frame; seatPlayers: SeatPlayerDisplay[] }) {
  const { t } = useTranslation();
  if (!frame.hules || frame.hules.length === 0) return null;
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid rgba(245, 158, 11, 0.4)',
        padding: 12,
        background: 'linear-gradient(180deg, rgba(255, 247, 230, 0.95) 0%, rgba(254, 243, 199, 0.6) 100%)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#92400e' }}>
        {t('paipuReplay.huleSummaryTitle')}
      </div>
      {frame.hules.map((h, i) => (
        <Fragment key={i}>
          {i > 0 && <div style={{ height: 8 }} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#7c2d12' }}>
                {seatPlayers[h.seat]?.nickname ?? `${h.seat + 1}`}
              </span>
              <span style={{ fontSize: 11, color: '#9a3412' }}>
                {h.zimo ? t('paipuReplay.tsumo') : t('paipuReplay.ron')}
              </span>
              {!h.zimo && h.fromSeat >= 0 && (
                <span style={{ fontSize: 11, color: '#7c2d12' }}>
                  {t('paipuReplay.from')} {seatPlayers[h.fromSeat]?.nickname ?? `${h.fromSeat + 1}`}
                </span>
              )}
              <span style={{ fontWeight: 800, fontSize: 14, color: '#92400e' }}>{h.points}</span>
              {h.fu > 0 && (
                <span style={{ fontSize: 11, color: '#7c2d12' }}>
                  {t('paipuReplay.fu')}: {h.fu}
                </span>
              )}
            </div>
            {h.fans.length > 0 && (
              <div style={{ fontSize: 11, color: '#7c2d12', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {h.fans.map((f, fi) => (
                  <span key={fi}>
                    {f.name}
                    {f.val > 0 ? ` ×${f.val}` : ''}
                  </span>
                ))}
              </div>
            )}
            {h.hand.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
                {h.hand.map((t2, ti) => (
                  <Tile key={ti} tile={t2} height={28} />
                ))}
                {h.huTile && (
                  <>
                    <span style={{ width: 6 }} />
                    <Tile tile={h.huTile} height={28} highlight />
                  </>
                )}
              </div>
            )}
            {h.liDoras.length > 0 && (
              <div style={{ fontSize: 11, color: '#92400e' }}>
                {t('paipuReplay.uraDora')}:
                <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, marginLeft: 6 }}>
                  {h.liDoras.map((u, ui) => (
                    <Tile key={ui} tile={u} height={22} />
                  ))}
                </span>
                <span style={{ marginLeft: 8, color: '#7c2d12' }}>
                  ({h.liDoras.map((u) => tileLabel(indicatorToDora(u))).join('·')})
                </span>
              </div>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function NoTileSummary({ frame, seatPlayers }: { frame: Frame; seatPlayers: SeatPlayerDisplay[] }) {
  const { t } = useTranslation();
  if (!frame.noTileInfo) return null;
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        padding: 12,
        background: '#f9f5f2',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--color-text)' }}>
        {t('paipuReplay.noTileTitle')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[0, 1, 2, 3].map((s) => (
          <div
            key={s}
            style={{
              padding: 8,
              borderRadius: 8,
              background: '#fff',
              border: '1px solid var(--color-border)',
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {seatPlayers[s]?.nickname ?? `${s + 1}`}
            </div>
            <div style={{ color: frame.noTileInfo!.tenpai[s] ? '#1d7a5c' : 'var(--color-text-light)' }}>
              {frame.noTileInfo!.tenpai[s] ? t('paipuReplay.tenpai') : t('paipuReplay.noten')}
            </div>
            <div style={{ fontWeight: 700, color: frame.noTileInfo!.deltas[s] > 0 ? '#1d7a5c' : frame.noTileInfo!.deltas[s] < 0 ? '#a84848' : 'var(--color-text-light)' }}>
              {frame.noTileInfo!.deltas[s] > 0 ? '+' : ''}
              {frame.noTileInfo!.deltas[s]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiuJuSummary({ frame }: { frame: Frame }) {
  const { t } = useTranslation();
  const key =
    frame.liujuType === 1
      ? 'paipuReplay.liuju.nagashi'
      : frame.liujuType === 2
        ? 'paipuReplay.liuju.kyuushu'
        : frame.liujuType === 3
          ? 'paipuReplay.liuju.suufon'
          : frame.liujuType === 4
            ? 'paipuReplay.liuju.suukaikan'
            : frame.liujuType === 5
              ? 'paipuReplay.liuju.suucharii'
              : 'paipuReplay.liuju.other';
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        padding: 12,
        background: '#f9f5f2',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
        {t('paipuReplay.liuJuTitle')}: {t(key)}
      </div>
    </div>
  );
}

function PaishanView({
  round,
  doraIndicators,
  uraDora,
}: {
  round: ReplayRound;
  doraIndicators: string[];
  uraDora: string[];
}) {
  const { t } = useTranslation();
  // 把 paishan 排成 4 行 × 34 列展示
  const ROW = 34;
  const tiles = round.paishan;
  const rows: string[][] = [];
  for (let i = 0; i < tiles.length; i += ROW) {
    rows.push(tiles.slice(i, i + ROW));
  }
  const doraSet = new Set(doraIndicators);
  const uraSet = new Set(uraDora);
  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        padding: 10,
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
          {t('paipuReplay.paishanTitle')}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-light)' }}>
          {t('paipuReplay.paishanHint')}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', alignItems: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
            {row.map((tile, ci) => {
              const isDora = doraSet.has(tile);
              const isUra = uraSet.has(tile);
              return (
                <span key={`${ri}-${ci}`} style={{ position: 'relative', display: 'inline-flex' }}>
                  <Tile tile={tile} height={20} highlight={isDora || isUra} />
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PaipuReplayPanel;
