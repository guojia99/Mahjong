import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Maximize2,
  Minimize2,
  HelpCircle,
  Trash2,
  Delete,
  MousePointerClick,
  GripVertical,
  History,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Timer,
} from 'lucide-react';
import { MahjongTile } from '@/components/MahjongTile';
import { buildTileAvailability, generatePuzzle } from '@/mahjong-puzzle/generator';
import { PUZZLE_TILE_ROWS } from '@/mahjong-puzzle/tiles';
import {
  emptyOpenGuess,
  MELD_GAP_PX,
  openDrawSlotIndex,
  openHandSlotCount,
} from '@/mahjong-puzzle/meld';
import {
  ATTEMPTS_BY_DIFFICULTY,
  HINT_DIFFICULTIES,
  OPEN_MELD_COUNT_PREFS,
  type HandMode,
  type OpenMeldCountPref,
  type PuzzleDifficulty,
  type PuzzleType,
  type QueMiHistoryEntry,
  type QueMiHistorySubmit,
  type QueMiOpenAnswer,
  type QueMiOpenGuess,
  SHANTEN_PREFERENCES,
  type QueMiPuzzle,
  type QueMiSession,
  type ShantenPreference,
  type TileFeedback,
} from '@/mahjong-puzzle/types';
import { QueMiGuide } from '@/pages/QueMiGuide';
import {
  compareGuessFeedback,
  compareOpenGuessFeedback,
  getAnswerYaku,
  getAnswerYakuHint,
  validateGuess,
  validateOpenGuess,
} from '@/mahjong-puzzle/validate';

const HISTORY_KEY = 'quemi-history';
const SESSION_KEY = 'quemi-session';
const GUIDE_KEY = 'quemi-guide-seen';

const DIFFICULTIES: PuzzleDifficulty[] = ['hard', 'advanced', 'medium', 'normal', 'easy'];
const PUZZLE_TYPES: PuzzleType[] = ['winnable', 'nonWinnable'];

type Phase = 'setup' | 'playing' | 'finished' | 'review';
type InputMode = 'click' | 'drag';

const PICKER_TILE_HEIGHT = 50;
const HAND_TILE_COUNT = 14;
const DRAW_SLOT_INDEX = 13;
const HAND_SLOT_GAP_PX = 2;
const HAND_DRAW_GAP_PX = 2;
const MELD_ROW_GAP_PX = 12;
const TILE_WIDTH_RATIO = 0.88;
const TILE_HEIGHT_MAX = 48;
const TILE_HEIGHT_MIN = 18;
/** 副露行预留边距，避免边框/阴影在窄屏右侧被裁切 */
const OPEN_BOARD_WIDTH_SAFETY_PX = 10;
const MELD_GROUP_BORDER_PX = 3;

const MELD_GROUP_BG = 'rgba(255, 255, 255, 0.88)';
const MELD_GROUP_STYLES = [
  { border: '#60a5fa', label: '#1e40af' },
  { border: '#fbbf24', label: '#92400e' },
  { border: '#a78bfa', label: '#5b21b6' },
  { border: '#34d399', label: '#065f46' },
] as const;

type SlotRef =
  | { area: 'closed'; index: number }
  | { area: 'meld'; meld: number; slot: number }
  | { area: 'hand'; index: number };

type DragSource = 'palette' | SlotRef;

function slotRefKey(ref: SlotRef): string {
  if (ref.area === 'closed') return `slot-${ref.index}`;
  if (ref.area === 'meld') return `meld-${ref.meld}-${ref.slot}`;
  return `hand-${ref.index}`;
}

function parseDropId(drop: string): SlotRef | null {
  const meld = drop.match(/^meld-(\d+)-(\d+)$/);
  if (meld) return { area: 'meld', meld: +meld[1]!, slot: +meld[2]! };
  const hand = drop.match(/^hand-(\d+)$/);
  if (hand) return { area: 'hand', index: +hand[1]! };
  const closed = drop.match(/^slot-(\d+)$/);
  if (closed) return { area: 'closed', index: +closed[1]! };
  return null;
}

function slotRefsEqual(a: SlotRef, b: SlotRef): boolean {
  return slotRefKey(a) === slotRefKey(b);
}

function getOpenTile(og: QueMiOpenGuess, ref: SlotRef): string | null {
  if (ref.area === 'meld') return og.melds[ref.meld]?.[ref.slot] ?? null;
  if (ref.area === 'hand') return og.hand[ref.index] ?? null;
  return null;
}

function setOpenTile(og: QueMiOpenGuess, ref: SlotRef, tile: string | null): QueMiOpenGuess {
  const next: QueMiOpenGuess = {
    melds: og.melds.map((m) => [...m]),
    hand: [...og.hand],
  };
  if (ref.area === 'meld') {
    next.melds[ref.meld]![ref.slot] = tile;
  } else if (ref.area === 'hand') {
    next.hand[ref.index] = tile;
  }
  return next;
}

function iterOpenSlots(meldCount: number): SlotRef[] {
  const refs: SlotRef[] = [];
  for (let m = 0; m < meldCount; m++) {
    for (let s = 0; s < 3; s++) refs.push({ area: 'meld', meld: m, slot: s });
  }
  const handLen = openHandSlotCount(meldCount);
  for (let h = 0; h < handLen; h++) refs.push({ area: 'hand', index: h });
  return refs;
}

function findFirstEmptyOpenSlot(og: QueMiOpenGuess, meldCount: number): SlotRef | null {
  for (const ref of iterOpenSlots(meldCount)) {
    if (!getOpenTile(og, ref)) return ref;
  }
  return null;
}

function collectOpenTiles(og: QueMiOpenGuess): (string | null)[] {
  const tiles: (string | null)[] = [];
  for (const m of og.melds) tiles.push(...m);
  tiles.push(...og.hand);
  return tiles;
}

function removeLastOpenTile(og: QueMiOpenGuess, meldCount: number): QueMiOpenGuess {
  const refs = iterOpenSlots(meldCount);
  for (let i = refs.length - 1; i >= 0; i--) {
    const ref = refs[i]!;
    if (getOpenTile(og, ref)) return setOpenTile(og, ref, null);
  }
  return og;
}

type ContextTagVariant = 'field' | 'seat' | 'agariTsumo' | 'agariRon' | 'dora' | 'shanten' | 'attempts' | 'timer';

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  children: ReactNode;
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

function tileWidthFromHeight(tileHeight: number): number {
  return tileHeight * TILE_WIDTH_RATIO;
}

function meldLayoutMetrics(meldCount: number) {
  const compact = meldCount >= 3;
  return {
    compact,
    innerGap: HAND_SLOT_GAP_PX,
    groupPaddingX: compact ? 8 : 12,
    groupGap: compact ? 6 : MELD_GAP_PX,
    minTileHeight: compact ? 10 : TILE_HEIGHT_MIN,
  };
}

function maxTileHeightForMeldRow(width: number, meldCount: number): number {
  const { innerGap, groupPaddingX, groupGap } = meldLayoutMetrics(meldCount);
  const betweenGroups = Math.max(0, meldCount - 1) * groupGap;
  const fixed = meldCount * (groupPaddingX + 2 * innerGap + MELD_GROUP_BORDER_PX);
  return (width - betweenGroups - fixed) / (meldCount * 3 * TILE_WIDTH_RATIO);
}

function maxTileHeightForHandRow(width: number, slotCount: number, drawSlotIndex: number): number {
  const betweenHandGaps = Math.max(0, drawSlotIndex - 1) * HAND_SLOT_GAP_PX;
  const totalGaps = betweenHandGaps + HAND_DRAW_GAP_PX;
  return (width - totalGaps) / (slotCount * TILE_WIDTH_RATIO);
}

function useTileHeight(ref: RefObject<HTMLElement | null>, slotCount: number, drawSlotIndex: number) {
  const [tileHeight, setTileHeight] = useState(40);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const maxH = maxTileHeightForHandRow(el.clientWidth, slotCount, drawSlotIndex);
      setTileHeight(Math.min(TILE_HEIGHT_MAX, Math.max(TILE_HEIGHT_MIN, maxH)));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, slotCount, drawSlotIndex]);

  return tileHeight;
}

function useOpenBoardTileHeight(
  ref: RefObject<HTMLElement | null>,
  meldCount: number,
  handSlotCount: number,
  drawSlotIndex: number,
) {
  const [tileHeight, setTileHeight] = useState(40);
  const { minTileHeight } = meldLayoutMetrics(meldCount);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const w = Math.max(0, el.clientWidth - OPEN_BOARD_WIDTH_SAFETY_PX);
      const maxH = Math.min(
        maxTileHeightForHandRow(w, handSlotCount, drawSlotIndex),
        maxTileHeightForMeldRow(w, meldCount),
      );
      setTileHeight(Math.min(TILE_HEIGHT_MAX, Math.max(minTileHeight, maxH * 0.98)));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, meldCount, handSlotCount, drawSlotIndex, minTileHeight]);

  return tileHeight;
}

function SubmitAttemptBadge({ attempt, label }: { attempt: number; label: string }) {
  return (
    <span
      className="absolute top-0 left-2 z-10 -translate-y-1/2 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums leading-none"
      style={{
        background: 'var(--color-card)',
        border: '1.5px solid var(--color-border)',
        color: 'var(--color-text-light)',
      }}
      aria-label={label}
    >
      {attempt}
    </span>
  );
}

function loadHistory(): QueMiHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(entries: QueMiHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
}

function loadSession(): QueMiSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as QueMiSession;
    if (s.phase !== 'playing' || !s.puzzle?.id) return null;
    const hm: HandMode = s.handMode ?? s.puzzle.handMode ?? 'closed';
    if (hm === 'open') {
      const mc = s.puzzle.openMeldCount ?? 1;
      if (!s.openGuess || s.openGuess.melds.length !== mc) return null;
      if (s.openGuess.hand.length !== openHandSlotCount(mc)) return null;
    } else if (!Array.isArray(s.guess) || s.guess.length !== HAND_TILE_COUNT) {
      return null;
    }
    const startedAt = s.startedAt ?? s.puzzle.createdAt ?? Date.now();
    return { ...s, handMode: hm, startedAt };
  } catch {
    return null;
  }
}

function saveSession(session: QueMiSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

let initialSession: QueMiSession | null | undefined;

function getInitialSession(): QueMiSession | null {
  if (initialSession === undefined) initialSession = loadSession();
  return initialSession;
}

function emptySlots(): (string | null)[] {
  return Array.from({ length: HAND_TILE_COUNT }, () => null);
}

function feedbackStyle(fb: TileFeedback | undefined, frozen: boolean): CSSProperties {
  if (frozen && fb === 'green') {
    return {
      background: '#4ade80',
      borderColor: '#14532d',
      boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.45)',
    };
  }
  if (frozen && fb === 'yellow') {
    return {
      background: '#facc15',
      borderColor: '#92400e',
      boxShadow: '0 0 0 2px rgba(234, 179, 8, 0.45)',
    };
  }
  if (frozen && fb === 'black') {
    return {
      background: '#f1f5f9',
      borderColor: '#cbd5e1',
    };
  }
  return { background: 'rgba(255,255,255,0.9)', borderColor: 'var(--color-border, #e5e7eb)' };
}

function feedbackTileOverlay(fb: TileFeedback | undefined, frozen: boolean): string | null {
  if (!frozen) return null;
  if (fb === 'green') return 'rgba(34, 197, 94, 0.15)';
  if (fb === 'yellow') return 'rgba(249, 115, 22, 0.15)';
  if (fb === 'black') return 'rgba(100, 116, 139, 0.15)';
  return null;
}

function TileSlot({
  tile,
  index,
  feedback,
  frozen,
  draggable,
  tileHeight,
  fixedSize = true,
  label,
  dropId,
  onClick,
  onPointerDown,
}: {
  tile: string | null;
  index: number;
  feedback?: TileFeedback;
  frozen: boolean;
  draggable: boolean;
  tileHeight: number;
  fixedSize?: boolean;
  label?: string;
  dropId?: string;
  onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
}) {
  const tileOverlay = feedbackTileOverlay(feedback, frozen);
  const slotWidth = tileWidthFromHeight(tileHeight);

  return (
    <div
      className={fixedSize ? 'shrink-0 flex flex-col items-center gap-0.5' : 'flex-1 min-w-0 flex flex-col items-center gap-0.5'}
      style={fixedSize ? { width: slotWidth } : undefined}
      data-quemi-drop={frozen ? undefined : dropId}
    >
      {label && (
        <span className="text-[9px] sm:text-[10px] font-medium leading-none" style={{ color: 'var(--color-text-light)' }}>
          {label}
        </span>
      )}
      <div className="w-full flex justify-center">
      <button
        type="button"
        onClick={frozen ? undefined : onClick}
        onPointerDown={frozen ? undefined : onPointerDown}
        style={{
          width: '100%',
          maxWidth: `${slotWidth}px`,
          boxSizing: 'border-box',
          aspectRatio: '5 / 6',
          borderRadius: 6,
          border: '2px solid',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: frozen ? 'default' : 'pointer',
          padding: 0,
          touchAction: draggable && !frozen && tile ? 'none' : undefined,
          ...feedbackStyle(feedback, frozen),
        }}
        aria-label={`slot-${index}`}
      >
        {tile ? (
          <span
            className="relative inline-flex leading-none"
            style={frozen && feedback === 'black' ? { opacity: 0.72 } : undefined}
          >
            <MahjongTile tile={tile} height={tileHeight} />
            {tileOverlay && (
              <span
                className="absolute inset-0 pointer-events-none"
                style={{ background: tileOverlay, borderRadius: 3 }}
                aria-hidden
              />
            )}
          </span>
        ) : null}
      </button>
      </div>
    </div>
  );
}

type HandRowSlotHandlers = {
  onClick?: (index: number) => void;
  onPointerDown?: (index: number, e: ReactPointerEvent) => void;
};

function HandRow({
  tiles,
  drawSlotIndex,
  dropPrefix,
  tileHeight: tileHeightProp,
  measureRef,
  feedback,
  frozen,
  draggable,
  handlers,
  getSlotLabel,
}: {
  tiles: (string | null)[];
  drawSlotIndex: number;
  dropPrefix: 'slot' | 'hand';
  tileHeight?: number;
  measureRef?: RefObject<HTMLElement | null>;
  feedback?: TileFeedback[];
  frozen: boolean;
  draggable?: boolean;
  handlers?: HandRowSlotHandlers;
  getSlotLabel?: (index: number) => string | undefined;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const computedHeight = useTileHeight(measureRef ?? rowRef, tiles.length, drawSlotIndex);
  const tileHeight = tileHeightProp ?? computedHeight;
  const handTiles = tiles.slice(0, drawSlotIndex);
  const drawTile = tiles[drawSlotIndex] ?? null;

  return (
    <div
      ref={measureRef ? undefined : rowRef}
      className="flex flex-nowrap items-end w-full justify-start"
    >
      <div className="flex flex-nowrap items-end shrink-0" style={{ gap: HAND_SLOT_GAP_PX }}>
        {handTiles.map((tile, i) => (
          <TileSlot
            key={i}
            tile={tile}
            index={i}
            feedback={feedback?.[i]}
            frozen={frozen}
            draggable={!!draggable}
            tileHeight={tileHeight}
            label={getSlotLabel?.(i)}
            dropId={`${dropPrefix}-${i}`}
            onClick={handlers?.onClick ? () => handlers.onClick!(i) : undefined}
            onPointerDown={handlers?.onPointerDown ? (e) => handlers.onPointerDown!(i, e) : undefined}
          />
        ))}
      </div>
      <div className="shrink-0" style={{ width: HAND_DRAW_GAP_PX }} aria-hidden />
      <TileSlot
        tile={drawTile}
        index={drawSlotIndex}
        feedback={feedback?.[drawSlotIndex]}
        frozen={frozen}
        draggable={!!draggable}
        tileHeight={tileHeight}
        label={getSlotLabel?.(drawSlotIndex)}
        dropId={`${dropPrefix}-${drawSlotIndex}`}
        onClick={handlers?.onClick ? () => handlers.onClick!(drawSlotIndex) : undefined}
        onPointerDown={handlers?.onPointerDown ? (e) => handlers.onPointerDown!(drawSlotIndex, e) : undefined}
      />
    </div>
  );
}

type MeldRowHandlers = {
  onClick?: (meld: number, slot: number) => void;
  onPointerDown?: (meld: number, slot: number, e: ReactPointerEvent) => void;
};

function MeldRow({
  melds,
  tileHeight,
  feedback,
  frozen,
  draggable,
  handlers,
}: {
  melds: (string | null)[][];
  tileHeight: number;
  feedback?: TileFeedback[][];
  frozen: boolean;
  draggable?: boolean;
  handlers?: MeldRowHandlers;
}) {
  const { t } = useTranslation();
  const layout = meldLayoutMetrics(melds.length);

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-nowrap items-end justify-start max-w-full">
      {melds.map((meld, mi) => {
        const style = MELD_GROUP_STYLES[mi % MELD_GROUP_STYLES.length]!;
        return (
          <div key={mi} className="flex flex-nowrap items-end shrink-0">
            {mi > 0 && <div className="shrink-0" style={{ width: layout.groupGap }} aria-hidden />}
            <div className="flex flex-col gap-0.5 shrink-0">
              <span
                className="text-[9px] sm:text-[10px] font-semibold leading-none pl-0.5"
                style={{ color: style.label }}
              >
                {t('queMi.openMeldGroup', { n: mi + 1 })}
              </span>
              <div
                className={`rounded-lg py-1 ${layout.compact ? 'px-1' : 'px-1.5'}`}
                style={{ background: MELD_GROUP_BG, border: `1.5px solid ${style.border}` }}
              >
                <div className="flex flex-nowrap items-end shrink-0" style={{ gap: layout.innerGap }}>
                  {meld.map((tile, si) => (
                    <TileSlot
                      key={si}
                      tile={tile}
                      index={si}
                      feedback={feedback?.[mi]?.[si]}
                      frozen={frozen}
                      draggable={!!draggable}
                      tileHeight={tileHeight}
                      dropId={`meld-${mi}-${si}`}
                      onClick={handlers?.onClick ? () => handlers.onClick!(mi, si) : undefined}
                      onPointerDown={handlers?.onPointerDown ? (e) => handlers.onPointerDown!(mi, si, e) : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function OpenGuessBoard({
  meldCount,
  melds,
  hand,
  meldFeedback,
  handFeedback,
  frozen,
  draggable,
  meldHandlers,
  handHandlers,
  drawSlotLabel,
}: {
  meldCount: number;
  melds: (string | null)[][];
  hand: (string | null)[];
  meldFeedback?: TileFeedback[][];
  handFeedback?: TileFeedback[];
  frozen: boolean;
  draggable?: boolean;
  meldHandlers?: MeldRowHandlers;
  handHandlers?: HandRowSlotHandlers;
  drawSlotLabel?: (index: number) => string | undefined;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const drawSlotIndex = openDrawSlotIndex(meldCount);
  const tileHeight = useOpenBoardTileHeight(boardRef, meldCount, hand.length, drawSlotIndex);

  return (
    <div ref={boardRef} className="flex flex-col w-full min-w-0" style={{ gap: MELD_ROW_GAP_PX }}>
      <MeldRow
        melds={melds}
        tileHeight={tileHeight}
        feedback={meldFeedback}
        frozen={frozen}
        draggable={draggable}
        handlers={meldHandlers}
      />
      <HandRow
        tiles={hand}
        drawSlotIndex={drawSlotIndex}
        dropPrefix="hand"
        tileHeight={tileHeight}
        measureRef={boardRef}
        feedback={handFeedback}
        frozen={frozen}
        draggable={draggable}
        handlers={handHandlers}
        getSlotLabel={drawSlotLabel}
      />
    </div>
  );
}

function OpenAnswerBoard({
  answer,
  meldCount,
  drawSlotLabel,
}: {
  answer: QueMiOpenAnswer;
  meldCount: number;
  drawSlotLabel?: (index: number) => string | undefined;
}) {
  return (
    <OpenGuessBoard
      meldCount={meldCount}
      melds={answer.melds}
      hand={[...answer.closedHand, answer.draw]}
      frozen
      drawSlotLabel={drawSlotLabel}
    />
  );
}

export default function QueMiPage() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const restored = getInitialSession();

  const [phase, setPhase] = useState<Phase>(restored ? 'playing' : 'setup');
  const [puzzleType, setPuzzleType] = useState<PuzzleType>(restored?.puzzleType ?? 'winnable');
  const [handMode, setHandMode] = useState<HandMode>(restored?.handMode ?? 'closed');
  const [openMeldCountPref, setOpenMeldCountPref] = useState<OpenMeldCountPref>(
    restored?.openMeldCountPref ?? 'random',
  );
  const [shantenPreference, setShantenPreference] = useState<ShantenPreference>(
    restored?.shantenPreference ?? 'random',
  );
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>(restored?.difficulty ?? 'normal');
  const [puzzle, setPuzzle] = useState<QueMiPuzzle | null>(restored?.puzzle ?? null);
  const [inputMode, setInputMode] = useState<InputMode>(restored?.inputMode ?? 'click');
  const [guess, setGuess] = useState<(string | null)[]>(restored?.guess ?? emptySlots);
  const [openGuess, setOpenGuess] = useState<QueMiOpenGuess | null>(restored?.openGuess ?? null);
  const [attemptsLeft, setAttemptsLeft] = useState(restored?.attemptsLeft ?? 0);
  const [submitRecords, setSubmitRecords] = useState<QueMiHistorySubmit[]>(restored?.submitRecords ?? []);
  const [won, setWon] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [history, setHistory] = useState<QueMiHistoryEntry[]>(loadHistory);
  const [reviewEntryId, setReviewEntryId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem(GUIDE_KEY));
  const [showHistory, setShowHistory] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragTile, setDragTile] = useState<{ source: DragSource; tile: string } | null>(null);
  const [pointerDragPos, setPointerDragPos] = useState<{ x: number; y: number } | null>(null);
  const pointerDragging = useRef(false);
  const suppressClickAfterDrag = useRef(false);
  const dragTileRef = useRef(dragTile);
  dragTileRef.current = dragTile;
  const [yakuHintShown, setYakuHintShown] = useState(restored?.yakuHintShown ?? false);
  const [gameStartedAt, setGameStartedAt] = useState<number | null>(restored?.startedAt ?? null);
  const [gameDurationMs, setGameDurationMs] = useState<number | null>(null);
  const [timerTick, setTimerTick] = useState(0);

  const tileAvail = useMemo(
    () => (puzzle ? buildTileAvailability(puzzle.dora) : {}),
    [puzzle],
  );

  const answerYaku = useMemo(
    () => (puzzle?.type === 'winnable' ? getAnswerYaku(puzzle) : []),
    [puzzle],
  );

  const answerYakuHint = useMemo(
    () => (puzzle?.type === 'winnable' ? getAnswerYakuHint(puzzle) : []),
    [puzzle],
  );

  const hintAvailable =
    phase === 'playing'
    && puzzle?.type === 'winnable'
    && HINT_DIFFICULTIES.includes(puzzle.difficulty);

  const liveDurationMs =
    phase === 'playing' && gameStartedAt != null ? Date.now() - gameStartedAt : 0;
  void timerTick;

  const displayDurationMs = phase === 'playing' ? liveDurationMs : gameDurationMs;

  const isOpen = puzzle?.handMode === 'open' && puzzle.openMeldCount != null;
  const meldCount = puzzle?.openMeldCount ?? 0;

  const activeTiles = useMemo(() => {
    if (isOpen && openGuess) return collectOpenTiles(openGuess);
    return guess;
  }, [isOpen, openGuess, guess]);

  const usedCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const tile of activeTiles) {
      if (tile) c[tile] = (c[tile] ?? 0) + 1;
    }
    return c;
  }, [activeTiles]);

  const canAddTile = useCallback(
    (tile: string) => (usedCounts[tile] ?? 0) < (tileAvail[tile] ?? 4),
    [usedCounts, tileAvail],
  );

  const firstEmptyIndex = guess.findIndex((t) => !t);
  const firstEmptyOpenRef = isOpen && openGuess ? findFirstEmptyOpenSlot(openGuess, meldCount) : null;
  const hasAnyTile = activeTiles.some(Boolean);
  const draggingFromBoard =
    inputMode === 'drag' && dragTile !== null && dragTile.source !== 'palette';

  const startGame = () => {
    try {
      const mode: HandMode = puzzleType === 'winnable' ? handMode : 'closed';
      const p = generatePuzzle(puzzleType, difficulty, {
        shanten: puzzleType === 'nonWinnable' ? shantenPreference : undefined,
        handMode: mode,
        openMeldCount: mode === 'open' ? openMeldCountPref : undefined,
      });
      setPuzzle(p);
      setAttemptsLeft(p.maxAttempts);
      setGuess(emptySlots());
      setOpenGuess(p.handMode === 'open' && p.openMeldCount ? emptyOpenGuess(p.openMeldCount) : null);
      setSubmitRecords([]);
      setWon(false);
      setGaveUp(false);
      setYakuHintShown(false);
      setGameStartedAt(Date.now());
      setGameDurationMs(null);
      setErrorKey(null);
      setPhase('playing');
    } catch {
      setErrorKey('queMi.generateFail');
    }
  };

  const recordResult = (
    p: QueMiPuzzle,
    didWin: boolean,
    used: number,
    submits: QueMiHistorySubmit[],
    durationMs: number,
  ) => {
    const entry: QueMiHistoryEntry = {
      id: `${Date.now()}`,
      puzzleId: p.id,
      type: p.type,
      difficulty: p.difficulty,
      won: didWin,
      attemptsUsed: used,
      durationMs,
      timestamp: Date.now(),
      puzzle: p,
      submits,
    };
    const next = [entry, ...history].slice(0, 50);
    setHistory(next);
    saveHistory(next);
  };

  const finishGame = (
    didWin: boolean,
    p: QueMiPuzzle,
    used: number,
    submits: QueMiHistorySubmit[],
    surrendered = false,
  ) => {
    const durationMs = gameStartedAt != null ? Date.now() - gameStartedAt : 0;
    clearSession();
    setGameStartedAt(null);
    setGameDurationMs(durationMs);
    setWon(didWin);
    setGaveUp(surrendered);
    setPhase('finished');
    recordResult(p, didWin, used, submits, durationMs);
  };

  const giveUp = () => {
    if (!puzzle || phase !== 'playing') return;
    const used = puzzle.maxAttempts - attemptsLeft;
    finishGame(false, puzzle, used, submitRecords, true);
  };

  const openHistoryReview = (entry: QueMiHistoryEntry) => {
    if (!entry.puzzle || !entry.submits) {
      setErrorKey('queMi.historyNoReplay');
      return;
    }
    setErrorKey(null);
    setPuzzle(entry.puzzle);
    setSubmitRecords(entry.submits);
    setWon(entry.won);
    setReviewEntryId(entry.id);
    setGameDurationMs(entry.durationMs ?? null);
    setGameStartedAt(null);
    setPhase('review');
    setShowHistory(false);
  };

  const exitReview = () => {
    clearSession();
    setPhase('setup');
    setPuzzle(null);
    setSubmitRecords([]);
    setReviewEntryId(null);
    setGaveUp(false);
    setGameStartedAt(null);
    setGameDurationMs(null);
    setErrorKey(null);
  };

  const backToSetup = () => {
    clearSession();
    setPhase('setup');
    setPuzzle(null);
    setGaveUp(false);
    setGameStartedAt(null);
    setGameDurationMs(null);
  };

  const submitGuess = () => {
    if (!puzzle || phase !== 'playing') return;

    if (isOpen && openGuess) {
      const result = validateOpenGuess(puzzle, openGuess);
      if (!result.ok) {
        setErrorKey(`queMi.error.${result.reason}`);
        return;
      }
      setErrorKey(null);
      const openFb = compareOpenGuessFeedback(puzzle, openGuess);
      const guessTiles = collectOpenTiles(openGuess).filter(Boolean) as string[];
      const attemptNum = puzzle.maxAttempts - attemptsLeft + 1;
      const updatedSubmits: QueMiHistorySubmit[] = [
        ...submitRecords,
        {
          attempt: attemptNum,
          guess: guessTiles,
          feedback: [],
          openGuess: {
            melds: openGuess.melds.map((m) => m.map((t) => t!)) as string[][],
            hand: openGuess.hand.map((t) => t!) as string[],
          },
          openFeedback: openFb,
        },
      ];
      setSubmitRecords(updatedSubmits);
      if (result.correct) {
        finishGame(true, puzzle, attemptNum, updatedSubmits);
        return;
      }
      const nextAttempts = attemptsLeft - 1;
      setAttemptsLeft(nextAttempts);
      if (nextAttempts <= 0) {
        finishGame(false, puzzle, puzzle.maxAttempts, updatedSubmits);
      } else if (puzzle.openMeldCount) {
        setOpenGuess(emptyOpenGuess(puzzle.openMeldCount));
      }
      return;
    }

    const result = validateGuess(puzzle, guess);
    if (!result.ok) {
      setErrorKey(`queMi.error.${result.reason}`);
      return;
    }
    setErrorKey(null);
    const guessTiles = guess as string[];
    const fb = compareGuessFeedback(puzzle.answer, guessTiles);
    const attemptNum = puzzle.maxAttempts - attemptsLeft + 1;
    const updatedSubmits: QueMiHistorySubmit[] = [
      ...submitRecords,
      { attempt: attemptNum, guess: guessTiles, feedback: fb },
    ];
    setSubmitRecords(updatedSubmits);

    if (result.correct) {
      finishGame(true, puzzle, attemptNum, updatedSubmits);
      return;
    }

    const nextAttempts = attemptsLeft - 1;
    setAttemptsLeft(nextAttempts);
    if (nextAttempts <= 0) {
      finishGame(false, puzzle, puzzle.maxAttempts, updatedSubmits);
    } else {
      setGuess(emptySlots());
    }
  };

  const clearGuess = () => {
    if (phase !== 'playing') return;
    if (isOpen && puzzle?.openMeldCount) {
      setOpenGuess(emptyOpenGuess(puzzle.openMeldCount));
    } else {
      setGuess(emptySlots());
    }
    setErrorKey(null);
  };

  const addTileClick = (tile: string) => {
    if (phase !== 'playing' || inputMode !== 'click') return;
    if (!canAddTile(tile)) return;
    if (isOpen && openGuess && puzzle?.openMeldCount) {
      const ref = findFirstEmptyOpenSlot(openGuess, puzzle.openMeldCount);
      if (!ref) return;
      setOpenGuess(setOpenTile(openGuess, ref, tile));
      setErrorKey(null);
      return;
    }
    const idx = guess.findIndex((t) => !t);
    if (idx < 0) return;
    const next = [...guess];
    next[idx] = tile;
    setGuess(next);
    setErrorKey(null);
  };

  const removeFromClosedSlot = (index: number) => {
    if (phase !== 'playing') return;
    setGuess((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const removeFromOpenSlot = (ref: SlotRef) => {
    if (phase !== 'playing' || !openGuess) return;
    setOpenGuess(setOpenTile(openGuess, ref, null));
  };

  const removeLastTile = useCallback(() => {
    if (phase !== 'playing') return;
    if (isOpen && openGuess && puzzle?.openMeldCount) {
      setOpenGuess(removeLastOpenTile(openGuess, puzzle.openMeldCount));
    } else {
      setGuess((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i]) {
            const next = [...prev];
            next[i] = null;
            return next;
          }
        }
        return prev;
      });
    }
    setErrorKey(null);
  }, [phase, isOpen, openGuess, puzzle?.openMeldCount]);

  const placeClosedTileAt = useCallback((index: number, tile: string, from?: number) => {
    if (phase !== 'playing') return;
    setGuess((prev) => {
      const next = [...prev];
      if (from != null && from >= 0) {
        next[from] = next[index] ?? null;
      }
      next[index] = tile;
      return next;
    });
    setErrorKey(null);
  }, [phase]);

  const placeOpenTileAt = useCallback((target: SlotRef, tile: string, from?: SlotRef) => {
    if (phase !== 'playing') return;
    setOpenGuess((prev) => {
      if (!prev) return prev;
      let next = setOpenTile(prev, target, tile);
      if (from && !slotRefsEqual(from, target)) {
        next = setOpenTile(next, from, getOpenTile(prev, target));
      }
      return next;
    });
    setErrorKey(null);
  }, [phase]);

  const beginPointerDrag = useCallback(
    (source: DragSource, tile: string, e: ReactPointerEvent) => {
      if (phase !== 'playing' || inputMode !== 'drag') return;
      e.preventDefault();
      pointerDragging.current = true;
      setDragTile({ source, tile });
      setPointerDragPos({ x: e.clientX, y: e.clientY });
    },
    [phase, inputMode],
  );

  const finishPointerDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!pointerDragging.current) return;
      pointerDragging.current = false;
      const dt = dragTileRef.current;
      setDragTile(null);
      setPointerDragPos(null);
      suppressClickAfterDrag.current = true;
      if (!dt || phase !== 'playing') return;

      const dropEl = document.elementFromPoint(clientX, clientY)?.closest('[data-quemi-drop]') as HTMLElement | null;
      const drop = dropEl?.dataset.quemiDrop;

      if (drop === 'palette' && dt.source !== 'palette') {
        const from = dt.source;
        if (from.area === 'closed') {
          setGuess((prev) => {
            if (!prev[from.index]) return prev;
            const next = [...prev];
            next[from.index] = null;
            return next;
          });
        } else {
          setOpenGuess((prev) => (prev ? setOpenTile(prev, from, null) : prev));
        }
        setErrorKey(null);
      } else if (drop) {
        const target = parseDropId(drop);
        if (!target) return;

        if (dt.source === 'palette') {
          if (target.area === 'closed') {
            setGuess((prev) => {
              const used: Record<string, number> = {};
              for (const t of prev) {
                if (t) used[t] = (used[t] ?? 0) + 1;
              }
              const canAdd = (used[dt.tile] ?? 0) < (tileAvail[dt.tile] ?? 4);
              if (!canAdd && !prev[target.index]) return prev;
              const next = [...prev];
              next[target.index] = dt.tile;
              return next;
            });
          } else {
            setOpenGuess((prev) => {
              if (!prev) return prev;
              const used: Record<string, number> = {};
              for (const t of collectOpenTiles(prev)) {
                if (t) used[t] = (used[t] ?? 0) + 1;
              }
              const canAdd = (used[dt.tile] ?? 0) < (tileAvail[dt.tile] ?? 4);
              if (!canAdd && !getOpenTile(prev, target)) return prev;
              return setOpenTile(prev, target, dt.tile);
            });
          }
          setErrorKey(null);
        } else {
          if (target.area === 'closed' && dt.source.area === 'closed') {
            placeClosedTileAt(target.index, dt.tile, dt.source.index);
          } else if (target.area !== 'closed' && dt.source.area !== 'closed') {
            placeOpenTileAt(target, dt.tile, dt.source);
          }
        }
      }
    },
    [phase, tileAvail, placeClosedTileAt, placeOpenTileAt],
  );

  const finishPointerDragRef = useRef(finishPointerDrag);
  finishPointerDragRef.current = finishPointerDrag;

  useEffect(() => {
    if (!pointerDragPos) return;
    const onMove = (e: PointerEvent) => {
      setPointerDragPos({ x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      finishPointerDragRef.current(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [pointerDragPos]);

  useEffect(() => {
    const blockGhostClick = (e: MouseEvent) => {
      if (!suppressClickAfterDrag.current) return;
      suppressClickAfterDrag.current = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('click', blockGhostClick, true);
    return () => document.removeEventListener('click', blockGhostClick, true);
  }, []);

  useEffect(() => {
    if (inputMode !== 'drag') {
      pointerDragging.current = false;
      setDragTile(null);
      setPointerDragPos(null);
    }
  }, [inputMode]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || !puzzle) {
      if (phase !== 'playing') clearSession();
      return;
    }
    saveSession({
      phase: 'playing',
      puzzle,
      puzzleType,
      handMode: puzzle.handMode,
      openMeldCountPref,
      difficulty,
      shantenPreference,
      guess,
      openGuess: openGuess ?? undefined,
      attemptsLeft,
      submitRecords,
      inputMode,
      yakuHintShown,
      startedAt: gameStartedAt ?? Date.now(),
    });
  }, [phase, puzzle, puzzleType, handMode, openMeldCountPref, difficulty, shantenPreference, guess, openGuess, attemptsLeft, submitRecords, inputMode, yakuHintShown, gameStartedAt]);

  useEffect(() => {
    if (phase !== 'playing' || !gameStartedAt) return;
    const id = setInterval(() => setTimerTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [phase, gameStartedAt]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
      removeLastTile();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, removeLastTile]);

  const dismissGuide = () => {
    localStorage.setItem(GUIDE_KEY, '1');
    setShowGuide(false);
  };

  const windLabel = (w: string) => t(`queMi.wind.${w}`);
  const drawSlotLabel = (i: number, drawIdx = DRAW_SLOT_INDEX) => (i === drawIdx ? t('queMi.draw') : undefined);
  const openMeldCountLabel = (n: number) =>
    n === 4 ? t('queMi.openMeldTanki') : t('queMi.openMeldCount', { n });
  const openMeldPrefLabel = (pref: OpenMeldCountPref) =>
    pref === 'random' ? t('queMi.openMeldRandom') : openMeldCountLabel(pref);
  const errorMessage = useMemo(() => {
    if (!errorKey) return null;
    if (errorKey === 'queMi.error.shantenMismatch' && puzzle?.shanten != null) {
      return t(errorKey, { n: puzzle.shanten });
    }
    return t(errorKey);
  }, [errorKey, puzzle?.shanten, t]);
  const shantenPrefLabel = (pref: ShantenPreference) =>
    pref === 'random' ? t('queMi.shantenRandom') : t('queMi.shantenCount', { n: pref });

  return (
    <div
      ref={containerRef}
      className={fullscreen ? 'min-h-screen w-full flex flex-col items-center overflow-y-auto px-4 py-6 box-border' : 'max-w-4xl mx-auto pb-8'}
      style={{ background: fullscreen ? 'var(--color-bg)' : undefined }}
    >
      <div className={fullscreen ? 'w-full max-w-4xl' : 'w-full'}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{t('queMi.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-light)' }}>{t('queMi.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {phase === 'playing' && (
            <button
              type="button"
              onClick={giveUp}
              className="btn-secondary text-sm px-3 py-1.5 rounded-lg font-semibold"
              style={{ borderColor: '#dc2626', color: '#dc2626' }}
            >
              {t('queMi.giveUp')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="btn-secondary text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          >
            <History size={16} />
            {t('queMi.history')}
          </button>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="btn-secondary text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          >
            <HelpCircle size={16} />
            {t('queMi.guide')}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="btn-secondary text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {fullscreen ? t('queMi.exitFullscreen') : t('queMi.fullscreen')}
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="mb-6 p-4 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
          <h3 className="text-sm font-semibold mb-2">{t('queMi.historyTitle')}</h3>
          {history.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>{t('queMi.historyEmpty')}</p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-y-auto text-sm">
              {history.map((h) => {
                const canReplay = !!h.puzzle && !!h.submits;
                const isActive = reviewEntryId === h.id && phase === 'review';
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => openHistoryReview(h)}
                      disabled={!canReplay}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
                      style={{
                        background: isActive ? 'rgba(var(--color-primary-rgb, 236, 72, 153), 0.12)' : 'transparent',
                        border: isActive ? '1px solid var(--color-primary)' : '1px solid transparent',
                        cursor: canReplay ? 'pointer' : 'not-allowed',
                        opacity: canReplay ? 1 : 0.55,
                      }}
                    >
                      {h.won ? <CheckCircle2 size={14} className="text-green-600 shrink-0" /> : <XCircle size={14} className="text-red-500 shrink-0" />}
                      <span className="shrink-0">{new Date(h.timestamp).toLocaleString()}</span>
                      <span className="truncate" style={{ color: 'var(--color-text-light)' }}>
                        {t(`queMi.type.${h.type}`)} · {t(`queMi.difficulty.${h.difficulty}`)} · {h.attemptsUsed}/{ATTEMPTS_BY_DIFFICULTY[h.difficulty]}
                        {h.durationMs != null ? ` · ${formatDuration(h.durationMs)}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {errorKey && phase === 'setup' && (
        <p className="text-sm text-red-600 mb-4">{errorMessage}</p>
      )}

      {phase === 'setup' && (
        <div className="p-6 rounded-2xl border space-y-6" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
          <div>
            <h2 className="text-sm font-semibold mb-2">{t('queMi.selectType')}</h2>
            <div className="flex flex-wrap gap-2">
              {PUZZLE_TYPES.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setPuzzleType(tp)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: puzzleType === tp ? 'var(--color-primary)' : 'var(--color-bg)',
                    color: puzzleType === tp ? '#fff' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {t(`queMi.type.${tp}`)}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)' }}>
              {t(`queMi.typeDesc.${puzzleType}`)}
            </p>
          </div>

          {puzzleType === 'winnable' && (
            <div>
              <h2 className="text-sm font-semibold mb-2">{t('queMi.selectHandMode')}</h2>
              <div className="flex flex-wrap gap-2">
                {(['closed', 'open'] as HandMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setHandMode(mode)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: handMode === mode ? 'var(--color-primary)' : 'var(--color-bg)',
                      color: handMode === mode ? '#fff' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {t(`queMi.handMode.${mode}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {puzzleType === 'winnable' && handMode === 'open' && (
            <div>
              <h2 className="text-sm font-semibold mb-2">{t('queMi.selectOpenMeldCount')}</h2>
              <div className="flex flex-wrap gap-2">
                {OPEN_MELD_COUNT_PREFS.map((pref) => (
                  <button
                    key={String(pref)}
                    type="button"
                    onClick={() => setOpenMeldCountPref(pref)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: openMeldCountPref === pref ? 'var(--color-primary)' : 'var(--color-bg)',
                      color: openMeldCountPref === pref ? '#fff' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {openMeldPrefLabel(pref)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {puzzleType === 'nonWinnable' && (
            <div>
              <h2 className="text-sm font-semibold mb-2">{t('queMi.selectShanten')}</h2>
              <div className="flex flex-wrap gap-2">
                {SHANTEN_PREFERENCES.map((pref) => (
                  <button
                    key={String(pref)}
                    type="button"
                    onClick={() => setShantenPreference(pref)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: shantenPreference === pref ? 'var(--color-primary)' : 'var(--color-bg)',
                      color: shantenPreference === pref ? '#fff' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {shantenPrefLabel(pref)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold mb-2">{t('queMi.selectDifficulty')}</h2>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: difficulty === d ? 'var(--color-primary)' : 'var(--color-bg)',
                    color: difficulty === d ? '#fff' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {t(`queMi.difficulty.${d}`)}
                </button>
              ))}
            </div>
          </div>

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          <button type="button" onClick={startGame} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold">
            {t('queMi.start')}
          </button>
        </div>
      )}

      {(phase === 'playing' || phase === 'finished' || phase === 'review') && puzzle && (
        <div className="space-y-5">
          {phase === 'review' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t('queMi.reviewTitle')}</p>
              <button type="button" onClick={exitReview} className="btn-secondary text-sm px-3 py-1.5 rounded-lg">
                {t('queMi.backFromReview')}
              </button>
            </div>
          )}

          <div
            className="p-4 rounded-xl border flex flex-wrap items-center gap-2"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
          >
            {puzzle.type === 'winnable' ? (
              <>
                <ContextTag variant="field" label={t('queMi.fieldWind')}>
                  {windLabel(puzzle.fieldWind)}
                </ContextTag>
                <ContextTag variant="seat" label={t('queMi.seatWind')}>
                  {windLabel(puzzle.seatWind)}
                </ContextTag>
                <ContextTag
                  variant={puzzle.agariWay === 'tsumo' ? 'agariTsumo' : 'agariRon'}
                  label={t('queMi.agariWay')}
                >
                  {t(`queMi.agari.${puzzle.agariWay}`)}
                </ContextTag>
                <ContextTag variant="dora" label={t('queMi.dora')}>
                  <span className="inline-flex items-center gap-0.5">
                    {puzzle.dora.map((d) => <MahjongTile key={d} tile={d} height={24} />)}
                  </span>
                </ContextTag>
                {puzzle.handMode === 'open' && puzzle.openMeldCount != null && (
                  <ContextTag variant="shanten" label={t('queMi.openMelds')}>
                    {openMeldCountLabel(puzzle.openMeldCount)}
                  </ContextTag>
                )}
              </>
            ) : puzzle.shanten != null ? (
              <ContextTag variant="shanten" label={t('queMi.shanten')}>
                {puzzle.shanten}
              </ContextTag>
            ) : null}
            {phase === 'playing' && (
              <span className="ml-auto flex items-center gap-2">
                {hintAvailable && !yakuHintShown && (
                  <button
                    type="button"
                    onClick={() => setYakuHintShown(true)}
                    className="btn-secondary text-xs flex items-center gap-1 px-2.5 py-1 rounded-full"
                  >
                    <Lightbulb size={14} />
                    {t('queMi.hint')}
                  </button>
                )}
                <ContextTag variant="timer" label={t('queMi.timerTag')}>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Timer size={12} aria-hidden />
                    {formatDuration(liveDurationMs)}
                  </span>
                </ContextTag>
                <ContextTag variant="attempts" label={t('queMi.attemptsTag')}>
                  {t('queMi.attemptsCount', { count: attemptsLeft })}
                </ContextTag>
              </span>
            )}
          </div>

          {hintAvailable && yakuHintShown && answerYakuHint.length > 0 && (
            <div
              className="p-3 rounded-xl border"
              style={{ borderColor: 'var(--color-border)', background: 'rgba(255, 247, 237, 0.85)' }}
            >
              <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#b45309' }}>
                <Lightbulb size={14} />
                {t('queMi.hintYaku')}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {answerYakuHint.map((y) => (
                  <li
                    key={y}
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: '#fff', border: '1px solid #fcd34d', color: 'var(--color-text)' }}
                  >
                    {y}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitRecords.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-light)' }}>{t('queMi.submitRecords')}</p>
              <div className="flex flex-col" style={{ gap: 4 }}>
              {submitRecords.map((rec) => (
                <div
                  key={rec.attempt}
                  className="relative p-3 rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.4)' }}
                >
                  <SubmitAttemptBadge
                    attempt={rec.attempt}
                    label={t('queMi.submitRecord', { n: rec.attempt })}
                  />
                  {rec.openGuess && puzzle.openMeldCount ? (
                    <OpenGuessBoard
                      meldCount={puzzle.openMeldCount}
                      melds={rec.openGuess.melds}
                      hand={rec.openGuess.hand}
                      meldFeedback={rec.openFeedback?.meldFeedback}
                      handFeedback={rec.openFeedback?.handFeedback}
                      frozen
                      drawSlotLabel={(i) => drawSlotLabel(i, openDrawSlotIndex(puzzle.openMeldCount!))}
                    />
                  ) : (
                    <HandRow
                      tiles={rec.guess}
                      drawSlotIndex={DRAW_SLOT_INDEX}
                      dropPrefix="slot"
                      feedback={rec.feedback}
                      frozen
                      getSlotLabel={drawSlotLabel}
                    />
                  )}
                </div>
              ))}
              </div>
            </div>
          )}

          {phase === 'playing' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold">{t('queMi.yourGuess')}</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setInputMode('click')}
                  className="text-xs px-2 py-1 rounded-md flex items-center gap-1"
                  style={{ background: inputMode === 'click' ? 'var(--color-primary)' : 'var(--color-bg)', color: inputMode === 'click' ? '#fff' : 'var(--color-text)' }}
                >
                  <MousePointerClick size={12} />
                  {t('queMi.modeClick')}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('drag')}
                  className="text-xs px-2 py-1 rounded-md flex items-center gap-1"
                  style={{ background: inputMode === 'drag' ? 'var(--color-primary)' : 'var(--color-bg)', color: inputMode === 'drag' ? '#fff' : 'var(--color-text)' }}
                >
                  <GripVertical size={12} />
                  {t('queMi.modeDrag')}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border min-w-0" style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.5)' }}>
              {isOpen && openGuess && puzzle.openMeldCount ? (
                <OpenGuessBoard
                  meldCount={puzzle.openMeldCount}
                  melds={openGuess.melds}
                  hand={openGuess.hand}
                  frozen={false}
                  draggable={inputMode === 'drag'}
                  drawSlotLabel={(i) => drawSlotLabel(i, openDrawSlotIndex(puzzle.openMeldCount!))}
                  meldHandlers={{
                    onClick: (m, s) => {
                      if (inputMode === 'click' && openGuess.melds[m]?.[s]) {
                        removeFromOpenSlot({ area: 'meld', meld: m, slot: s });
                      }
                    },
                    onPointerDown: (m, s, e) => {
                      if (inputMode !== 'drag') return;
                      const tile = openGuess.melds[m]?.[s];
                      if (!tile) return;
                      beginPointerDrag({ area: 'meld', meld: m, slot: s }, tile, e);
                    },
                  }}
                  handHandlers={{
                    onClick: (i) => {
                      if (inputMode === 'click' && openGuess.hand[i]) {
                        removeFromOpenSlot({ area: 'hand', index: i });
                      }
                    },
                    onPointerDown: (i, e) => {
                      if (inputMode !== 'drag') return;
                      const tile = openGuess.hand[i];
                      if (!tile) return;
                      beginPointerDrag({ area: 'hand', index: i }, tile, e);
                    },
                  }}
                />
              ) : (
                <HandRow
                  tiles={guess}
                  drawSlotIndex={DRAW_SLOT_INDEX}
                  dropPrefix="slot"
                  frozen={false}
                  draggable={inputMode === 'drag'}
                  getSlotLabel={drawSlotLabel}
                  handlers={{
                    onClick: (i) => {
                      if (inputMode === 'click' && guess[i]) removeFromClosedSlot(i);
                    },
                    onPointerDown: (i, e) => {
                      if (inputMode !== 'drag') return;
                      const tile = guess[i];
                      if (!tile) return;
                      beginPointerDrag({ area: 'closed', index: i }, tile, e);
                    },
                  }}
                />
              )}
            </div>
          </div>
          )}

          {phase === 'playing' && (
            <>
              <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-medium shrink-0" style={{ color: 'var(--color-text-light)' }}>{t('queMi.tilePicker')}</p>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <button type="button" onClick={submitGuess} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold">
                      {t('queMi.submit')}
                    </button>
                    <button
                      type="button"
                      onClick={removeLastTile}
                      disabled={!hasAnyTile}
                      className="btn-secondary px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={t('queMi.deleteLast')}
                    >
                      <Delete size={14} />
                      {t('queMi.deleteLast')}
                    </button>
                    <button type="button" onClick={clearGuess} className="btn-secondary px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1">
                      <Trash2 size={14} />
                      {t('common.clear')}
                    </button>
                  </div>
                </div>
                <div className="relative rounded-lg">
                {draggingFromBoard && (
                  <div
                    data-quemi-drop="palette"
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-lg"
                    style={{
                      background: 'rgba(220, 38, 38, 0.58)',
                      border: '2px dashed rgba(255, 255, 255, 0.9)',
                      touchAction: 'none',
                    }}
                    aria-hidden
                  >
                    <Trash2 size={36} strokeWidth={2.25} color="#fff" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }} />
                    <span
                      className="text-xs sm:text-sm font-semibold text-white text-center px-2"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
                    >
                      {t('queMi.dropToRemove')}
                    </span>
                  </div>
                )}
                {PUZZLE_TILE_ROWS.map((row, ri) => (
                  <div key={ri} className="flex flex-wrap gap-1 justify-center mb-1">
                    {row.map((tile) => {
                      const atCapacity = !canAddTile(tile);
                      const clickDisabled = atCapacity || (isOpen ? !firstEmptyOpenRef : firstEmptyIndex < 0);
                      return (
                        <button
                          key={tile}
                          type="button"
                          disabled={inputMode === 'click' && clickDisabled}
                          onPointerDown={(e) => {
                            if (inputMode !== 'drag' || atCapacity) return;
                            beginPointerDrag('palette', tile, e);
                          }}
                          onClick={() => addTileClick(tile)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            padding: 0,
                            cursor: inputMode === 'click' && clickDisabled ? 'not-allowed' : 'pointer',
                            opacity: atCapacity ? 0.35 : 1,
                            touchAction: inputMode === 'drag' && !atCapacity ? 'none' : undefined,
                          }}
                        >
                          <MahjongTile tile={tile} height={PICKER_TILE_HEIGHT} />
                        </button>
                      );
                    })}
                  </div>
                ))}
                </div>
              </div>

              {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            </>
          )}

          {(phase === 'finished' || phase === 'review') && (
            <div className="p-5 rounded-xl border space-y-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-lg font-bold" style={{ color: won ? '#16a34a' : 'var(--color-text)' }}>
                  {won ? t('queMi.win') : gaveUp ? t('queMi.gaveUp') : t('queMi.lose')}
                </p>
                {displayDurationMs != null && (
                  <span className="text-sm tabular-nums inline-flex items-center gap-1" style={{ color: 'var(--color-text-light)' }}>
                    <Timer size={14} aria-hidden />
                    {t('queMi.duration', { time: formatDuration(displayDurationMs) })}
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>{t('queMi.answer')}</p>
                {puzzle.handMode === 'open' && puzzle.openAnswer && puzzle.openMeldCount ? (
                  <OpenAnswerBoard
                    answer={puzzle.openAnswer}
                    meldCount={puzzle.openMeldCount}
                    drawSlotLabel={(i) => drawSlotLabel(i, openDrawSlotIndex(puzzle.openMeldCount!))}
                  />
                ) : (
                  <HandRow
                    tiles={puzzle.answer}
                    drawSlotIndex={DRAW_SLOT_INDEX}
                    dropPrefix="slot"
                    frozen
                    getSlotLabel={drawSlotLabel}
                  />
                )}
              </div>
              {answerYaku.length > 0 && (
                <div>
                  <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>{t('queMi.answerYaku')}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {answerYaku.map((y) => (
                      <li
                        key={y}
                        className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      >
                        {y}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {phase === 'finished' ? (
                <button
                  type="button"
                  onClick={backToSetup}
                  className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold"
                >
                  {t('queMi.playAgain')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={exitReview}
                  className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold"
                >
                  {t('queMi.backFromReview')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {pointerDragPos && dragTile && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{
            left: pointerDragPos.x,
            top: pointerDragPos.y,
            transform: 'translate(-50%, -50%)',
            opacity: 0.92,
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))',
          }}
          aria-hidden
        >
          <MahjongTile tile={dragTile.tile} height={PICKER_TILE_HEIGHT} />
        </div>
      )}

      <QueMiGuide open={showGuide} onClose={dismissGuide} />
      </div>
    </div>
  );
}
