import { useTranslation } from 'react-i18next';
import { MahjongTile } from '@/components/MahjongTile';
import { openDrawSlotIndex } from '@/mahjong-puzzle/meld';
import type { QueMiHistorySubmit, QueMiPuzzle, TileFeedback } from '@/mahjong-puzzle/types';

const TILE_HEIGHT = 44;

function feedbackBorder(fb: TileFeedback | undefined): string {
  if (fb === 'green') return '#16a34a';
  if (fb === 'yellow') return '#d97706';
  if (fb === 'black') return '#94a3b8';
  return 'var(--color-border)';
}

function feedbackBg(fb: TileFeedback | undefined): string {
  if (fb === 'green') return '#4ade80';
  if (fb === 'yellow') return '#facc15';
  if (fb === 'black') return '#f1f5f9';
  return 'rgba(255,255,255,0.9)';
}

function FrozenTile({ tile, feedback }: { tile: string; feedback?: TileFeedback }) {
  return (
    <span
      className="inline-flex rounded-md border-2 p-0.5"
      style={{ borderColor: feedbackBorder(feedback), background: feedbackBg(feedback) }}
    >
      <MahjongTile tile={tile} height={TILE_HEIGHT} />
    </span>
  );
}

function ClosedGuessRow({
  tiles,
  feedback,
  drawSlotIndex,
  drawLabel,
}: {
  tiles: string[];
  feedback: TileFeedback[];
  drawSlotIndex: number;
  drawLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {tiles.map((tile, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          {i === drawSlotIndex && (
            <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-light)' }}>
              {drawLabel}
            </span>
          )}
          <FrozenTile tile={tile} feedback={feedback[i]} />
        </div>
      ))}
    </div>
  );
}

function OpenGuessRow({
  meldCount,
  openGuess,
  openFeedback,
  drawLabel,
}: {
  meldCount: number;
  openGuess: NonNullable<QueMiHistorySubmit['openGuess']>;
  openFeedback?: NonNullable<QueMiHistorySubmit['openFeedback']>;
  drawLabel: string;
}) {
  const drawSlotIndex = openDrawSlotIndex(meldCount);
  return (
    <div className="space-y-2">
      {openGuess.melds.map((meld, mi) => (
        <div key={mi} className="flex flex-wrap gap-1 justify-center">
          {meld.map((tile, ti) => (
            <FrozenTile key={ti} tile={tile} feedback={openFeedback?.meldFeedback?.[mi]?.[ti]} />
          ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-1 justify-center">
        {openGuess.hand.map((tile, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            {i === drawSlotIndex && (
              <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-light)' }}>
                {drawLabel}
              </span>
            )}
            <FrozenTile tile={tile} feedback={openFeedback?.handFeedback?.[i]} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function QueMiSubmitRecordsView({
  puzzle,
  records,
}: {
  puzzle: QueMiPuzzle;
  records: QueMiHistorySubmit[];
}) {
  const { t } = useTranslation();
  const drawLabel = t('queMi.draw');
  if (records.length === 0) {
    return (
      <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-light)' }}>
        {t('queMiOnline.attemptNoSubmits')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {records.map((rec) => (
        <div
          key={rec.attempt}
          className="relative p-3 rounded-xl border"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.4)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-light)' }}>
            {t('queMi.submitRecord', { n: rec.attempt })}
          </p>
          {rec.openGuess && puzzle.openMeldCount ? (
            <OpenGuessRow
              meldCount={puzzle.openMeldCount}
              openGuess={rec.openGuess}
              openFeedback={rec.openFeedback}
              drawLabel={drawLabel}
            />
          ) : (
            <ClosedGuessRow tiles={rec.guess} feedback={rec.feedback} drawSlotIndex={13} drawLabel={drawLabel} />
          )}
        </div>
      ))}
    </div>
  );
}
