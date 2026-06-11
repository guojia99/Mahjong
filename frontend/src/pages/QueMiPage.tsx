import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Maximize2,
  Minimize2,
  HelpCircle,
  Trash2,
  MousePointerClick,
  GripVertical,
  History,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { MahjongTile } from '@/components/MahjongTile';
import { buildTileAvailability, generatePuzzle } from '@/mahjong-puzzle/generator';
import { PUZZLE_TILE_ROWS } from '@/mahjong-puzzle/tiles';
import type {
  PuzzleDifficulty,
  PuzzleType,
  QueMiHistoryEntry,
  QueMiHistorySubmit,
  QueMiPuzzle,
  TileFeedback,
} from '@/mahjong-puzzle/types';
import { compareGuessFeedback, validateGuess } from '@/mahjong-puzzle/validate';

const HISTORY_KEY = 'quemi-history';
const GUIDE_KEY = 'quemi-guide-seen';

const DIFFICULTIES: PuzzleDifficulty[] = ['hard', 'advanced', 'medium', 'normal', 'easy'];
const PUZZLE_TYPES: PuzzleType[] = ['winnable', 'nonWinnable'];

type Phase = 'setup' | 'playing' | 'finished' | 'review';
type InputMode = 'click' | 'drag';

const PICKER_TILE_HEIGHT = 50;
const HAND_TILE_COUNT = 14;
const DRAW_SLOT_INDEX = 13;
const HAND_DRAW_GAP_PX = 8;

type ContextTagVariant = 'field' | 'seat' | 'agariTsumo' | 'agariRon' | 'dora' | 'shanten' | 'attempts';

const CONTEXT_TAG_STYLES: Record<ContextTagVariant, { bg: string; border: string; label: string; value: string }> = {
  field: { bg: '#dbeafe', border: '#3b82f6', label: '#1e40af', value: '#1d4ed8' },
  seat: { bg: '#fce7f3', border: '#ec4899', label: '#9d174d', value: '#be185d' },
  agariTsumo: { bg: '#fef3c7', border: '#f59e0b', label: '#92400e', value: '#b45309' },
  agariRon: { bg: '#ffedd5', border: '#f97316', label: '#9a3412', value: '#c2410c' },
  dora: { bg: '#d1fae5', border: '#10b981', label: '#065f46', value: '#047857' },
  shanten: { bg: '#ede9fe', border: '#8b5cf6', label: '#5b21b6', value: '#6d28d9' },
  attempts: { bg: '#fff5f9', border: '#e8a0bf', label: '#9d3d6b', value: '#d484a8' },
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

function useHandTileHeight(
  ref: RefObject<HTMLElement | null>,
  slotCount: number,
  hasLeading: boolean,
) {
  const [tileHeight, setTileHeight] = useState(40);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const leading = hasLeading ? 64 : 0;
      const handGaps = Math.max(0, DRAW_SLOT_INDEX) * 2;
      const slotW = (el.clientWidth - leading - handGaps - HAND_DRAW_GAP_PX) / slotCount;
      setTileHeight(Math.min(48, Math.max(18, slotW * 1.18)));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, slotCount, hasLeading]);

  return tileHeight;
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

function emptySlots(): (string | null)[] {
  return Array.from({ length: HAND_TILE_COUNT }, () => null);
}

function feedbackStyle(fb: TileFeedback | undefined, frozen: boolean): CSSProperties {
  if (frozen) {
    if (fb === 'green') return { background: 'rgba(34, 197, 94, 0.25)', borderColor: '#16a34a' };
    if (fb === 'yellow') return { background: 'rgba(234, 179, 8, 0.25)', borderColor: '#ca8a04' };
    if (fb === 'black') return { background: 'rgba(0, 0, 0, 0.12)', borderColor: '#525252' };
  }
  return { background: 'rgba(255,255,255,0.9)', borderColor: 'var(--color-border, #e5e7eb)' };
}

function TileSlot({
  tile,
  index,
  feedback,
  frozen,
  draggable,
  tileHeight,
  label,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  tile: string | null;
  index: number;
  feedback?: TileFeedback;
  frozen: boolean;
  draggable: boolean;
  tileHeight: number;
  label?: string;
  onClick?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <div
      className="flex-1 min-w-0 flex flex-col items-center gap-0.5"
      onDragOver={frozen ? undefined : onDragOver}
      onDrop={frozen ? undefined : onDrop}
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
        draggable={draggable && !frozen && !!tile}
        onDragStart={frozen ? undefined : onDragStart}
        onDragEnd={frozen ? undefined : onDragEnd}
        style={{
          width: '100%',
          maxWidth: `${tileHeight * 0.88}px`,
          aspectRatio: '5 / 6',
          borderRadius: 6,
          border: '2px solid',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: frozen ? 'default' : 'pointer',
          padding: 0,
          ...feedbackStyle(feedback, frozen && !!feedback && feedback !== 'none'),
        }}
        aria-label={`slot-${index}`}
      >
        {tile ? <MahjongTile tile={tile} height={tileHeight} /> : null}
      </button>
      </div>
    </div>
  );
}

type HandRowSlotHandlers = {
  onClick?: (index: number) => void;
  onDragStart?: (index: number, e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (index: number, e: DragEvent) => void;
};

function HandRow({
  leadingLabel,
  tiles,
  feedback,
  frozen,
  draggable,
  handlers,
  getSlotLabel,
}: {
  leadingLabel?: string;
  tiles: (string | null)[];
  feedback?: TileFeedback[];
  frozen: boolean;
  draggable?: boolean;
  handlers?: HandRowSlotHandlers;
  getSlotLabel?: (index: number) => string | undefined;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const tileHeight = useHandTileHeight(rowRef, tiles.length, !!leadingLabel);

  return (
    <div ref={rowRef} className="flex flex-nowrap items-end gap-0.5 w-full">
      {leadingLabel && (
        <span
          className="shrink-0 self-center text-[10px] sm:text-xs font-medium leading-tight whitespace-nowrap pr-1"
          style={{ color: 'var(--color-text-light)' }}
        >
          {leadingLabel}
        </span>
      )}
      <div className="flex flex-nowrap items-end flex-1 min-w-0">
        <div className="flex flex-nowrap items-end gap-0.5 flex-[13] min-w-0">
          {tiles.slice(0, DRAW_SLOT_INDEX).map((tile, i) => (
            <TileSlot
              key={i}
              tile={tile}
              index={i}
              feedback={feedback?.[i]}
              frozen={frozen}
              draggable={!!draggable}
              tileHeight={tileHeight}
              label={getSlotLabel?.(i)}
              onClick={handlers?.onClick ? () => handlers.onClick!(i) : undefined}
              onDragStart={handlers?.onDragStart ? (e) => handlers.onDragStart!(i, e) : undefined}
              onDragEnd={handlers?.onDragEnd}
              onDragOver={handlers?.onDragOver}
              onDrop={handlers?.onDrop ? (e) => handlers.onDrop!(i, e) : undefined}
            />
          ))}
        </div>
        <div className="shrink-0" style={{ width: HAND_DRAW_GAP_PX }} aria-hidden />
        <div className="flex flex-nowrap items-end flex-1 min-w-0">
          <TileSlot
            tile={tiles[DRAW_SLOT_INDEX] ?? null}
            index={DRAW_SLOT_INDEX}
            feedback={feedback?.[DRAW_SLOT_INDEX]}
            frozen={frozen}
            draggable={!!draggable}
            tileHeight={tileHeight}
            label={getSlotLabel?.(DRAW_SLOT_INDEX)}
            onClick={handlers?.onClick ? () => handlers.onClick!(DRAW_SLOT_INDEX) : undefined}
            onDragStart={handlers?.onDragStart ? (e) => handlers.onDragStart!(DRAW_SLOT_INDEX, e) : undefined}
            onDragEnd={handlers?.onDragEnd}
            onDragOver={handlers?.onDragOver}
            onDrop={handlers?.onDrop ? (e) => handlers.onDrop!(DRAW_SLOT_INDEX, e) : undefined}
          />
        </div>
      </div>
    </div>
  );
}

export default function QueMiPage() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>('setup');
  const [puzzleType, setPuzzleType] = useState<PuzzleType>('winnable');
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>('normal');
  const [puzzle, setPuzzle] = useState<QueMiPuzzle | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('click');
  const [guess, setGuess] = useState<(string | null)[]>(emptySlots);
  const [attemptsLeft, setAttemptsLeft] = useState(0);
  const [submitRecords, setSubmitRecords] = useState<QueMiHistorySubmit[]>([]);
  const [won, setWon] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [history, setHistory] = useState<QueMiHistoryEntry[]>(loadHistory);
  const [reviewEntryId, setReviewEntryId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem(GUIDE_KEY));
  const [showHistory, setShowHistory] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragTile, setDragTile] = useState<{ source: 'palette' | number; tile: string } | null>(null);

  const tileAvail = useMemo(
    () => (puzzle ? buildTileAvailability(puzzle.dora) : {}),
    [puzzle],
  );

  const usedCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const tile of guess) {
      if (tile) c[tile] = (c[tile] ?? 0) + 1;
    }
    return c;
  }, [guess]);

  const canAddTile = useCallback(
    (tile: string) => (usedCounts[tile] ?? 0) < (tileAvail[tile] ?? 4),
    [usedCounts, tileAvail],
  );

  const firstEmptyIndex = guess.findIndex((t) => !t);
  const draggingFromHand =
    inputMode === 'drag' && dragTile !== null && typeof dragTile.source === 'number';

  const endDrag = useCallback(() => setDragTile(null), []);

  const startGame = () => {
    try {
      const p = generatePuzzle(puzzleType, difficulty);
      setPuzzle(p);
      setAttemptsLeft(p.maxAttempts);
      setGuess(emptySlots());
      setSubmitRecords([]);
      setWon(false);
      setErrorKey(null);
      setPhase('playing');
    } catch {
      setErrorKey('queMi.generateFail');
    }
  };

  const recordResult = (p: QueMiPuzzle, didWin: boolean, used: number, submits: QueMiHistorySubmit[]) => {
    const entry: QueMiHistoryEntry = {
      id: `${Date.now()}`,
      puzzleId: p.id,
      type: p.type,
      difficulty: p.difficulty,
      won: didWin,
      attemptsUsed: used,
      timestamp: Date.now(),
      puzzle: p,
      submits,
    };
    const next = [entry, ...history].slice(0, 50);
    setHistory(next);
    saveHistory(next);
  };

  const finishGame = (didWin: boolean, p: QueMiPuzzle, used: number, submits: QueMiHistorySubmit[]) => {
    setWon(didWin);
    setPhase('finished');
    recordResult(p, didWin, used, submits);
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
    setPhase('review');
    setShowHistory(false);
  };

  const exitReview = () => {
    setPhase('setup');
    setPuzzle(null);
    setSubmitRecords([]);
    setReviewEntryId(null);
    setErrorKey(null);
  };

  const submitGuess = () => {
    if (!puzzle || phase !== 'playing') return;
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
    setGuess(emptySlots());
    setErrorKey(null);
  };

  const addTileClick = (tile: string) => {
    if (phase !== 'playing' || inputMode !== 'click') return;
    if (!canAddTile(tile)) return;
    const idx = guess.findIndex((t) => !t);
    if (idx < 0) return;
    const next = [...guess];
    next[idx] = tile;
    setGuess(next);
    setErrorKey(null);
  };

  const removeFromSlot = (index: number) => {
    if (phase !== 'playing') return;
    const next = [...guess];
    next[index] = null;
    setGuess(next);
  };

  const dropHandTileOnPalette = useCallback(
    (e: DragEvent) => {
      if (phase !== 'playing' || inputMode !== 'drag') return;
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData('application/x-quemi-hand');
      let idx = raw !== '' ? parseInt(raw, 10) : Number.NaN;
      if (Number.isNaN(idx) && typeof dragTile?.source === 'number') {
        idx = dragTile.source;
      }
      if (!Number.isNaN(idx) && idx >= 0 && idx < HAND_TILE_COUNT && guess[idx]) {
        removeFromSlot(idx);
        setErrorKey(null);
      }
      setDragTile(null);
    },
    [phase, inputMode, dragTile, guess],
  );

  const allowPaletteDrop = useCallback(
    (e: DragEvent) => {
      if (phase !== 'playing' || inputMode !== 'drag') return;
      if (e.dataTransfer.types.includes('application/x-quemi-hand')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    },
    [phase, inputMode],
  );

  const placeTileAt = (index: number, tile: string, from?: number) => {
    if (phase !== 'playing') return;
    const next = [...guess];
    if (from != null && from >= 0) {
      next[from] = next[index];
    }
    next[index] = tile;
    setGuess(next);
    setErrorKey(null);
  };

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

  const dismissGuide = () => {
    localStorage.setItem(GUIDE_KEY, '1');
    setShowGuide(false);
  };

  const windLabel = (w: string) => t(`queMi.wind.${w}`);
  const drawSlotLabel = (i: number) => (i === DRAW_SLOT_INDEX ? t('queMi.draw') : undefined);

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
        <div className="flex items-center gap-2">
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
                        {t(`queMi.type.${h.type}`)} · {t(`queMi.difficulty.${h.difficulty}`)} · {h.attemptsUsed}/{ATTEMPTS_LABEL(h)}
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
        <p className="text-sm text-red-600 mb-4">{t(errorKey)}</p>
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
                  {t(`queMi.difficulty.${d}`)} ({t('queMi.attempts', { count: ATTEMPTS_MAP[d] })})
                </button>
              ))}
            </div>
          </div>

          {errorKey && <p className="text-sm text-red-600">{t(errorKey)}</p>}

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
              </>
            ) : puzzle.shanten != null ? (
              <ContextTag variant="shanten" label={t('queMi.shanten')}>
                {puzzle.shanten}
              </ContextTag>
            ) : null}
            {phase === 'playing' && (
              <span className="ml-auto">
                <ContextTag variant="attempts" label={t('queMi.attemptsTag')}>
                  {t('queMi.attemptsCount', { count: attemptsLeft })}
                </ContextTag>
              </span>
            )}
          </div>

          {submitRecords.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-light)' }}>{t('queMi.submitRecords')}</p>
              <div className="flex flex-col" style={{ gap: 4 }}>
              {submitRecords.map((rec) => (
                <div
                  key={rec.attempt}
                  className="p-3 rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.4)' }}
                >
                  <HandRow
                    leadingLabel={t('queMi.submitRecord', { n: rec.attempt })}
                    tiles={rec.guess}
                    feedback={rec.feedback}
                    frozen
                    getSlotLabel={drawSlotLabel}
                  />
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

            <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.5)' }}>
              <HandRow
                tiles={guess}
                frozen={false}
                draggable={inputMode === 'drag'}
                getSlotLabel={drawSlotLabel}
                handlers={{
                  onClick: (i) => {
                    if (inputMode === 'click' && guess[i]) removeFromSlot(i);
                  },
                  onDragStart: (i, e) => {
                    const tile = guess[i];
                    if (!tile) return;
                    setDragTile({ source: i, tile });
                    e.dataTransfer.setData('text/plain', tile);
                    e.dataTransfer.setData('application/x-quemi-hand', String(i));
                    e.dataTransfer.effectAllowed = 'move';
                  },
                  onDragEnd: endDrag,
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: (i, e) => {
                    e.preventDefault();
                    const fromPalette = e.dataTransfer.getData('application/x-quemi-palette');
                    if (fromPalette) {
                      if (!canAddTile(fromPalette) && !guess[i]) return;
                      placeTileAt(i, fromPalette);
                      return;
                    }
                    if (dragTile?.source === 'palette') {
                      placeTileAt(i, dragTile.tile);
                    } else if (typeof dragTile?.source === 'number') {
                      placeTileAt(i, dragTile.tile, dragTile.source);
                    }
                    setDragTile(null);
                  },
                }}
              />
            </div>
          </div>
          )}

          {phase === 'playing' && (
            <>
              <div className="p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-medium shrink-0" style={{ color: 'var(--color-text-light)' }}>{t('queMi.tilePicker')}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={submitGuess} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold">
                      {t('queMi.submit')}
                    </button>
                    <button type="button" onClick={clearGuess} className="btn-secondary px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1">
                      <Trash2 size={14} />
                      {t('common.clear')}
                    </button>
                  </div>
                </div>
                <div
                  className="relative rounded-lg"
                  onDragOver={allowPaletteDrop}
                  onDrop={dropHandTileOnPalette}
                >
                {draggingFromHand && (
                  <div
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-lg pointer-events-none"
                    style={{
                      background: 'rgba(220, 38, 38, 0.58)',
                      border: '2px dashed rgba(255, 255, 255, 0.9)',
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
                      const clickDisabled = atCapacity || firstEmptyIndex < 0;
                      return (
                        <button
                          key={tile}
                          type="button"
                          disabled={inputMode === 'click' && clickDisabled}
                          draggable={inputMode === 'drag' && !atCapacity}
                          onDragOver={allowPaletteDrop}
                          onDrop={dropHandTileOnPalette}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-quemi-palette', tile);
                            e.dataTransfer.setData('text/plain', tile);
                            setDragTile({ source: 'palette', tile });
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onDragEnd={endDrag}
                          onClick={() => addTileClick(tile)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            padding: 0,
                            cursor: inputMode === 'click' && clickDisabled ? 'not-allowed' : 'pointer',
                            opacity: atCapacity ? 0.35 : 1,
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

              {errorKey && <p className="text-sm text-red-600">{t(errorKey)}</p>}
            </>
          )}

          {(phase === 'finished' || phase === 'review') && (
            <div className="p-5 rounded-xl border space-y-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
              <p className="text-lg font-bold" style={{ color: won ? '#16a34a' : 'var(--color-text)' }}>
                {won ? t('queMi.win') : t('queMi.lose')}
              </p>
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>{t('queMi.answer')}</p>
                <HandRow tiles={puzzle.answer} frozen getSlotLabel={drawSlotLabel} />
              </div>
              {phase === 'finished' ? (
                <button
                  type="button"
                  onClick={() => { setPhase('setup'); setPuzzle(null); }}
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

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="max-w-lg w-full p-6 rounded-2xl shadow-xl space-y-4" style={{ background: 'var(--color-card)' }}>
            <h2 className="text-lg font-bold">{t('queMi.guideTitle')}</h2>
            <ol className="text-sm space-y-2 list-decimal list-inside" style={{ color: 'var(--color-text)' }}>
              <li>{t('queMi.guideStep1')}</li>
              <li>{t('queMi.guideStep2')}</li>
              <li>{t('queMi.guideStep3')}</li>
              <li>{t('queMi.guideStep4')}</li>
              <li>{t('queMi.guideStep5')}</li>
            </ol>
            <button type="button" onClick={dismissGuide} className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold">
              {t('queMi.guideOk')}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

const ATTEMPTS_MAP: Record<PuzzleDifficulty, number> = {
  hard: 4,
  advanced: 5,
  medium: 6,
  normal: 7,
  easy: 8,
};

function ATTEMPTS_LABEL(h: QueMiHistoryEntry): number {
  return ATTEMPTS_MAP[h.difficulty];
}
