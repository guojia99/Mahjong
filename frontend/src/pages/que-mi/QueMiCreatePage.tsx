import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { MahjongTile } from '@/components/MahjongTile';
import { QueMiAdaptiveTilePicker } from '@/components/que-mi/QueMiAdaptiveTilePicker';
import { QueMiClosedHandInput } from '@/components/que-mi/QueMiClosedHandInput';
import { createEmptyOpenGuess, QueMiOpenHandInput } from '@/components/que-mi/QueMiOpenHandInput';
import { QueMiContextBar } from '@/components/que-mi/QueMiContextBar';
import { QueMiOptionGroup } from '@/components/que-mi/QueMiOptionGroup';
import { createPuzzle, getSuggestedPuzzleName } from '@/api/queMi';
import { isLoggedIn } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import { ATTEMPTS_BY_DIFFICULTY } from '@/mahjong-puzzle/types';
import type { AgariWay, HandMode, PuzzleDifficulty, PuzzleType, QueMiOpenGuess, QueMiPuzzle, Wind } from '@/mahjong-puzzle/types';
import { buildCanonicalAnswer, countTiles, tileToIndex } from '@/mahjong-puzzle/tiles';
import { buildOpenAnswerFromGuess, collectOpenGuessTiles, isOpenGuessComplete, meldsToBlocks } from '@/mahjong-puzzle/meld';
import { computeShanten } from '@/mahjong-puzzle/shanten';
import { isKokushiWin, isWinningHand, validateGuess } from '@/mahjong-puzzle/validate';

const DIFFICULTIES: PuzzleDifficulty[] = ['hard', 'advanced', 'medium', 'normal', 'easy'];
const PUZZLE_TYPES: PuzzleType[] = ['winnable', 'nonWinnable'];
const WINDS: Wind[] = ['east', 'south', 'west', 'north'];
const AGARI_WAYS: AgariWay[] = ['tsumo', 'ron'];
const HAND_MODES: HandMode[] = ['closed', 'open'];
const OPEN_MELD_COUNTS = [1, 2, 3, 4] as const;

function emptyGuess(): (string | null)[] {
  return Array(14).fill(null);
}

function validatePuzzleDefinition(puzzle: QueMiPuzzle): { key: string; n?: number } | null {
  const all: Record<string, number> = {};
  for (const d of puzzle.dora) all[d] = (all[d] ?? 0) + 1;

  if (puzzle.handMode === 'closed') {
    if (puzzle.answer.length !== 14 || puzzle.answer.some((t) => !t)) {
      return { key: 'queMi.error.incomplete' };
    }
    for (const t of puzzle.answer) all[t] = (all[t] ?? 0) + 1;
  } else if (puzzle.openAnswer && puzzle.openMeldCount != null) {
    if (puzzle.openAnswer.melds.length !== puzzle.openMeldCount) {
      return { key: 'queMiOnline.error.invalidStructure' };
    }
    for (const m of puzzle.openAnswer.melds) {
      if (m.length !== 3 || m.some((t) => !t)) return { key: 'queMi.error.incomplete' };
      for (const t of m) all[t] = (all[t] ?? 0) + 1;
    }
    if (puzzle.openAnswer.closedHand.length !== 13 - puzzle.openMeldCount * 3 || !puzzle.openAnswer.draw) {
      return { key: 'queMi.error.incomplete' };
    }
    for (const t of puzzle.openAnswer.closedHand) all[t] = (all[t] ?? 0) + 1;
    all[puzzle.openAnswer.draw] = (all[puzzle.openAnswer.draw] ?? 0) + 1;
  } else {
    return { key: 'queMiOnline.error.invalidStructure' };
  }

  for (const [, n] of Object.entries(all)) {
    if (n > 4) return { key: 'queMiOnline.error.duplicateTiles' };
  }
  for (const t of Object.keys(all)) {
    if (tileToIndex(t) < 0) return { key: 'queMiOnline.error.invalidTiles' };
  }

  if (puzzle.handMode === 'closed') {
    const vr = validateGuess(puzzle, puzzle.answer);
    if (!vr.ok) {
      if (vr.reason === 'shantenMismatch' && puzzle.shanten != null) {
        return { key: 'queMi.error.shantenMismatch', n: puzzle.shanten };
      }
      return { key: `queMi.error.${vr.reason}` };
    }
    if (puzzle.type === 'winnable') {
      const hand13 = puzzle.answer.slice(0, 13);
      const draw = puzzle.answer[13]!;
      if (isKokushiWin(hand13, draw, puzzle.fieldWind, puzzle.seatWind, puzzle.agariWay, puzzle.dora)) {
        return { key: 'queMiOnline.error.kokushi' };
      }
    }
  } else if (puzzle.openAnswer) {
    const { closedHand, draw, melds } = puzzle.openAnswer;
    const furu = meldsToBlocks(melds);
    const winning = isWinningHand(closedHand, draw, puzzle.fieldWind, puzzle.seatWind, puzzle.agariWay, puzzle.dora, furu);
    if (puzzle.type === 'winnable') {
      if (!winning) return { key: 'queMi.error.notWinning' };
      if (isKokushiWin(closedHand, draw, puzzle.fieldWind, puzzle.seatWind, puzzle.agariWay, puzzle.dora, furu)) {
        return { key: 'queMiOnline.error.kokushi' };
      }
    } else {
      if (winning) return { key: 'queMi.error.isWinning' };
      if (puzzle.shanten == null || computeShanten(closedHand) !== puzzle.shanten) {
        return { key: 'queMi.error.shantenMismatch', n: puzzle.shanten ?? 0 };
      }
    }
  }

  return null;
}

export default function QueMiCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast, ToastComponent } = useToast();

  const [puzzleType, setPuzzleType] = useState<PuzzleType>('winnable');
  const [handMode, setHandMode] = useState<HandMode>('closed');
  const [openMeldCount, setOpenMeldCount] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>('normal');
  const [fieldWind, setFieldWind] = useState<Wind>('east');
  const [seatWind, setSeatWind] = useState<Wind>('east');
  const [agariWay, setAgariWay] = useState<AgariWay>('tsumo');
  const [dora, setDora] = useState<string[]>(['5s']);
  const [guess, setGuess] = useState<(string | null)[]>(emptyGuess);
  const [openGuess, setOpenGuess] = useState<QueMiOpenGuess>(() => createEmptyOpenGuess(1));
  const [puzzleName, setPuzzleName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOpen = puzzleType === 'winnable' && handMode === 'open';

  useEffect(() => {
    (async () => {
      try {
        const name = await getSuggestedPuzzleName();
        setPuzzleName(name);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (puzzleType === 'nonWinnable' && handMode === 'open') {
      setHandMode('closed');
    }
  }, [puzzleType, handMode]);

  useEffect(() => {
    if (isOpen) {
      setOpenGuess(createEmptyOpenGuess(openMeldCount));
    }
  }, [isOpen, openMeldCount]);

  const answerTiles = useMemo(() => {
    if (isOpen) return collectOpenGuessTiles(openGuess);
    return guess.filter(Boolean) as string[];
  }, [isOpen, openGuess, guess]);

  const sortedAnswer = useMemo(() => {
    if (isOpen) return null;
    const tiles = guess.filter(Boolean) as string[];
    if (tiles.length !== 14) return null;
    const hand13 = tiles.slice(0, 13);
    const draw = tiles[13]!;
    return buildCanonicalAnswer(hand13, draw);
  }, [isOpen, guess]);

  const openAnswer = useMemo(() => {
    if (!isOpen) return null;
    return buildOpenAnswerFromGuess(openMeldCount, openGuess);
  }, [isOpen, openMeldCount, openGuess]);

  const answerComplete = isOpen
    ? isOpenGuessComplete(openMeldCount, openGuess.melds, openGuess.hand)
    : sortedAnswer != null;

  const previewShanten = useMemo(() => {
    if (puzzleType !== 'nonWinnable') return undefined;
    if (isOpen && openAnswer) return computeShanten(openAnswer.closedHand);
    if (sortedAnswer) return computeShanten(sortedAnswer.slice(0, 13));
    return undefined;
  }, [puzzleType, isOpen, openAnswer, sortedAnswer]);

  const openMeldCountLabel = (n: number) =>
    n === 4 ? t('queMi.openMeldTanki') : t('queMi.openMeldCount', { n });

  const addDora = useCallback(
    (tile: string) => {
      if (dora.length >= 5) return;
      const used = countTiles([...answerTiles, ...dora]);
      if ((used[tile] ?? 0) >= 4) return;
      setDora((prev) => [...prev, tile]);
    },
    [dora, answerTiles],
  );

  const removeDora = useCallback((index: number) => {
    setDora((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    if (!answerComplete) {
      showToast(t('queMi.error.incomplete'));
      return;
    }
    if (dora.length === 0) {
      showToast(t('queMiOnline.error.noDora'));
      return;
    }

    let puzzle: QueMiPuzzle;

    if (isOpen && openAnswer) {
      puzzle = {
        id: '',
        type: puzzleType,
        difficulty,
        maxAttempts: ATTEMPTS_BY_DIFFICULTY[difficulty],
        handMode: 'open',
        openMeldCount,
        openAnswer,
        answer: buildCanonicalAnswer(openAnswer.closedHand, openAnswer.draw),
        fieldWind,
        seatWind,
        agariWay,
        dora: [...dora],
        createdAt: Date.now(),
      };
    } else if (sortedAnswer) {
      const shanten = puzzleType === 'nonWinnable' ? computeShanten(sortedAnswer.slice(0, 13)) : undefined;
      puzzle = {
        id: '',
        type: puzzleType,
        difficulty,
        maxAttempts: ATTEMPTS_BY_DIFFICULTY[difficulty],
        handMode: 'closed',
        answer: sortedAnswer,
        fieldWind,
        seatWind,
        agariWay,
        dora: [...dora],
        shanten,
        createdAt: Date.now(),
      };
    } else {
      showToast(t('queMi.error.incomplete'));
      return;
    }

    const err = validatePuzzleDefinition(puzzle);
    if (err) {
      showToast(err.n != null ? t(err.key, { n: err.n }) : t(err.key));
      return;
    }

    setSubmitting(true);
    try {
      const created = await createPuzzle(puzzle, puzzleName);
      showToast(t('queMiOnline.createSuccess'), 'success');
      navigate(`/que-mi/online/${created.id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || t('queMiOnline.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  const cardClass = 'p-6 rounded-2xl border space-y-5';
  const cardStyle = { borderColor: 'var(--color-border)', background: 'var(--color-card)' };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {ToastComponent}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/que-mi/online" className="btn btn-sm btn-outline inline-flex items-center gap-1">
          <ArrowLeft size={14} />
          {t('queMiOnline.back')}
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('queMiOnline.createTitle')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-light)' }}>
            {t('queMiOnline.createSubtitle')}
          </p>
        </div>
      </div>

      <div className={cardClass} style={cardStyle}>
        <label className="block space-y-1">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {t('queMiOnline.puzzleName')}
          </span>
          <input
            type="text"
            className="input w-full text-sm"
            value={puzzleName}
            onChange={(e) => setPuzzleName(e.target.value)}
            maxLength={100}
            placeholder={t('queMiOnline.puzzleNamePlaceholder')}
          />
          <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
            {t('queMiOnline.puzzleNameHint')}
          </p>
        </label>
      </div>

      <div className={cardClass} style={cardStyle}>
        <QueMiOptionGroup
          label={t('queMi.selectType')}
          value={puzzleType}
          onChange={setPuzzleType}
          hint={t(`queMi.typeDesc.${puzzleType}`)}
          options={PUZZLE_TYPES.map((pt) => ({ value: pt, label: t(`queMi.type.${pt}`) }))}
        />
        <QueMiOptionGroup
          label={t('queMi.selectDifficulty')}
          value={difficulty}
          onChange={setDifficulty}
          options={DIFFICULTIES.map((d) => ({
            value: d,
            label: `${t(`queMi.difficulty.${d}`)} (${t('queMi.attempts', { count: ATTEMPTS_BY_DIFFICULTY[d] })})`,
          }))}
        />
        {puzzleType === 'winnable' && (
          <>
            <QueMiOptionGroup
              label={t('queMi.selectHandMode')}
              value={handMode}
              onChange={setHandMode}
              options={HAND_MODES.map((mode) => ({ value: mode, label: t(`queMi.handMode.${mode}`) }))}
            />
            {handMode === 'open' && (
              <QueMiOptionGroup
                label={t('queMi.openMelds')}
                value={openMeldCount}
                onChange={setOpenMeldCount}
                options={OPEN_MELD_COUNTS.map((n) => ({ value: n, label: openMeldCountLabel(n) }))}
              />
            )}
          </>
        )}
      </div>

      <div className={cardClass} style={cardStyle}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {t('queMiOnline.createContext')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <QueMiOptionGroup
            label={t('queMi.fieldWind')}
            value={fieldWind}
            onChange={setFieldWind}
            options={WINDS.map((w) => ({ value: w, label: t(`queMi.wind.${w}`) }))}
          />
          <QueMiOptionGroup
            label={t('queMi.seatWind')}
            value={seatWind}
            onChange={setSeatWind}
            options={WINDS.map((w) => ({ value: w, label: t(`queMi.wind.${w}`) }))}
          />
        </div>
        <QueMiOptionGroup
          label={t('queMi.agariWay')}
          value={agariWay}
          onChange={setAgariWay}
          options={AGARI_WAYS.map((a) => ({ value: a, label: t(`queMi.agari.${a}`) }))}
        />
        <div
          className="p-4 rounded-xl border"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.5)' }}
        >
          <QueMiContextBar
            fieldWind={fieldWind}
            seatWind={seatWind}
            agariWay={agariWay}
            dora={dora}
            shanten={previewShanten}
            handMode={isOpen ? 'open' : 'closed'}
            openMeldCount={isOpen ? openMeldCount : undefined}
          />
        </div>
      </div>

      <div className={cardClass} style={cardStyle}>
        <div>
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
            {t('queMi.dora')} ({dora.length}/5)
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-light)' }}>
            {t('queMiOnline.doraHint')}
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-3 min-h-[44px]">
            {dora.length === 0 ? (
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                {t('queMiOnline.error.noDora')}
              </span>
            ) : (
              dora.map((d, i) => (
                <button
                  key={`${d}-${i}`}
                  type="button"
                  className="relative rounded-md p-0.5 hover:bg-red-50 transition-colors"
                  onClick={() => removeDora(i)}
                  title={t('common.delete')}
                >
                  <MahjongTile tile={d} height={40} />
                </button>
              ))
            )}
          </div>
          <div className="rounded-xl border p-2 max-h-[194px] overflow-y-auto min-w-0" style={{ borderColor: 'var(--color-border)' }}>
            <QueMiAdaptiveTilePicker
              renderTile={(tile, tileHeight) => {
                const used = countTiles([...answerTiles, ...dora]);
                const atCapacity = (used[tile] ?? 0) >= 4 || dora.length >= 5;
                return (
                  <button
                    type="button"
                    disabled={atCapacity}
                    onClick={() => addDora(tile)}
                    className="p-0 rounded disabled:opacity-35"
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    <MahjongTile tile={tile} height={tileHeight} />
                  </button>
                );
              }}
            />
          </div>
        </div>
      </div>

      <div className={cardClass} style={cardStyle}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {t('queMiOnline.createAnswer')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
          {isOpen ? t('queMiOnline.createOpenAnswerHint') : t('queMiOnline.createAnswerHint')}
        </p>
        {isOpen ? (
          <QueMiOpenHandInput
            meldCount={openMeldCount}
            openGuess={openGuess}
            onChange={setOpenGuess}
            dora={dora}
            onSubmit={handleSubmit}
            submitDisabled={submitting || !answerComplete}
          />
        ) : (
          <QueMiClosedHandInput
            guess={guess}
            onChange={(g) => {
              const filled = g.filter(Boolean) as string[];
              if (filled.length <= 13) {
                setGuess(g);
              } else {
                const hand13 = filled.slice(0, 13);
                const draw = filled[13]!;
                setGuess(buildCanonicalAnswer(hand13, draw));
              }
            }}
            dora={dora}
            onSubmit={handleSubmit}
            submitDisabled={submitting || sortedAnswer == null}
          />
        )}
        {sortedAnswer && !isOpen && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--color-bg)', color: 'var(--color-text-light)' }}>
            {t('queMiOnline.sortedPreview')}: {sortedAnswer.join(' ')}
          </p>
        )}
        {openAnswer && isOpen && (
          <p className="text-xs px-3 py-2 rounded-lg space-y-1" style={{ background: 'var(--color-bg)', color: 'var(--color-text-light)' }}>
            <span className="block">{t('queMiOnline.sortedPreview')}:</span>
            {openAnswer.melds.map((m, i) => (
              <span key={i} className="block">
                {t('queMi.openMeldGroup', { n: i + 1 })}: {m.join(' ')}
              </span>
            ))}
            <span className="block">
              {t('queMi.yourGuess')}: {openAnswer.closedHand.join(' ')} · {t('queMi.draw')}: {openAnswer.draw}
            </span>
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl text-sm font-semibold"
        disabled={submitting || !answerComplete}
        onClick={handleSubmit}
      >
        <Plus size={16} />
        {submitting ? t('common.saving') : t('queMiOnline.publish')}
      </button>
    </div>
  );
}
