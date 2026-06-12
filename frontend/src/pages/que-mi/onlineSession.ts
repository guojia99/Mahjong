import type { QueMiAttempt, QueMiPlayPuzzle, QueMiPuzzleDetail, QueMiSubmitRecord } from '@/types/queMi';
import type {
  QueMiHistorySubmit,
  QueMiOpenGuess,
  QueMiOpenSubmitFeedback,
  QueMiPuzzle,
  TileFeedback,
} from '@/mahjong-puzzle/types';
import { emptyOpenGuess } from '@/mahjong-puzzle/meld';
import { compareGuessFeedback, compareOpenGuessFeedback } from '@/mahjong-puzzle/validate';

export function normalizeQueMiPuzzle(puzzle: QueMiPuzzle): QueMiPuzzle {
  return {
    ...puzzle,
    answer: puzzle.answer ?? [],
    dora: puzzle.dora ?? [],
  };
}

export function puzzleHasAnswer(puzzle: QueMiPuzzle): boolean {
  if (puzzle.handMode === 'open') {
    return puzzle.openAnswer != null;
  }
  return (puzzle.answer?.length ?? 0) >= 14;
}

/** Convert API play payload (no answer) into offline `QueMiPuzzle` shape. */
export function playPuzzleToQueMi(p: QueMiPlayPuzzle): QueMiPuzzle {
  return {
    id: p.id,
    type: p.type,
    difficulty: p.difficulty,
    maxAttempts: p.max_attempts,
    handMode: p.hand_mode,
    openMeldCount: p.open_meld_count,
    answer: [],
    fieldWind: p.field_wind,
    seatWind: p.seat_wind,
    agariWay: p.agari_way,
    dora: p.dora,
    shanten: p.shanten,
    createdAt: Date.now(),
  };
}

export function detailPuzzleToQueMi(detail: QueMiPuzzleDetail): QueMiPuzzle {
  return normalizeQueMiPuzzle({ ...detail.puzzle, id: detail.id });
}

export function revealedPuzzleToQueMi(puzzleId: string, puzzle: QueMiPuzzle): QueMiPuzzle {
  return normalizeQueMiPuzzle({ ...puzzle, id: puzzleId });
}

export function resolveOnlineAttemptPuzzle(
  puzzleId: string,
  detail: QueMiPuzzleDetail,
  attempt: QueMiAttempt,
): QueMiPuzzle {
  if (attempt.revealed_puzzle) {
    return revealedPuzzleToQueMi(puzzleId, attempt.revealed_puzzle);
  }
  return detailPuzzleToQueMi(detail);
}

export function enrichSubmitHistory(
  records: QueMiHistorySubmit[],
  puzzle?: QueMiPuzzle | null,
): QueMiHistorySubmit[] {
  if (!puzzle || !puzzleHasAnswer(puzzle)) return records;
  return records.map((rec) => {
    if (rec.openGuess) {
      return {
        ...rec,
        openFeedback: compareOpenGuessFeedback(puzzle, rec.openGuess),
      };
    }
    if (rec.guess.length > 0) {
      return {
        ...rec,
        feedback: compareGuessFeedback(puzzle.answer, rec.guess),
      };
    }
    return rec;
  });
}

export function apiSubmitsToHistory(
  submits: QueMiSubmitRecord[] | undefined,
  puzzle?: QueMiPuzzle | null,
): QueMiHistorySubmit[] {
  if (!submits?.length) return [];
  const canRecompute = puzzle != null && puzzleHasAnswer(puzzle);
  return submits.map((s) => {
    const og = s.guess?.open_guess;
    if (og) {
      const openGuess = {
        melds: og.melds.map((m) => m.map((t) => t!)),
        hand: og.hand.map((t) => t!),
      };
      const openFeedback = canRecompute
        ? compareOpenGuessFeedback(puzzle, openGuess)
        : (s.feedback as QueMiOpenSubmitFeedback);
      return {
        attempt: s.attempt_no,
        guess: [],
        feedback: [],
        openGuess,
        openFeedback,
      };
    }
    const guess = s.guess?.guess ?? [];
    const feedback = canRecompute
      ? compareGuessFeedback(puzzle.answer, guess)
      : ((Array.isArray(s.feedback) ? s.feedback : []) as TileFeedback[]);
    return {
      attempt: s.attempt_no,
      guess,
      feedback,
    };
  });
}

export function startedAtMs(attempt: QueMiAttempt): number {
  return new Date(attempt.started_at).getTime();
}

export function emptyGuessSlots(): (string | null)[] {
  return Array(14).fill(null);
}

export function initialOpenGuess(puzzle: QueMiPuzzle): QueMiOpenGuess | null {
  if (puzzle.handMode === 'open' && puzzle.openMeldCount != null) {
    return emptyOpenGuess(puzzle.openMeldCount);
  }
  return null;
}
