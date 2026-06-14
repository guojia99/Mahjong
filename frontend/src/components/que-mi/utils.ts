export function formatQueMiDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

type HandModeSummaryPuzzle = {
  handMode: 'closed' | 'open';
  openMeldCount?: number;
};

export function formatQueMiHandModeSummary(
  puzzle: HandModeSummaryPuzzle,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (puzzle.handMode === 'open' && puzzle.openMeldCount != null) {
    return puzzle.openMeldCount === 4
      ? t('queMi.openMeldTanki')
      : t('queMi.openMeldCount', { n: puzzle.openMeldCount });
  }
  return t('queMi.handMode.closed');
}
