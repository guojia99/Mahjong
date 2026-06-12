import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MahjongTile } from '@/components/MahjongTile';
import type { TileFeedback } from '@/mahjong-puzzle/types';

const GUIDE_TABS = ['basics', 'input', 'feedback', 'open', 'tips'] as const;
type GuideTab = (typeof GUIDE_TABS)[number];

const GUIDE_TILE_HEIGHT = 36;
const GUIDE_TILE_WIDTH = GUIDE_TILE_HEIGHT * 0.88;

function guideFeedbackStyle(fb: TileFeedback): CSSProperties {
  if (fb === 'green') {
    return {
      background: '#4ade80',
      borderColor: '#14532d',
      boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.45)',
    };
  }
  if (fb === 'yellow') {
    return {
      background: '#facc15',
      borderColor: '#92400e',
      boxShadow: '0 0 0 2px rgba(234, 179, 8, 0.45)',
    };
  }
  if (fb === 'black') {
    return {
      background: '#f1f5f9',
      borderColor: '#cbd5e1',
    };
  }
  return { background: 'rgba(255,255,255,0.9)', borderColor: 'var(--color-border, #e5e7eb)' };
}

function guideFeedbackOverlay(fb: TileFeedback): string | null {
  if (fb === 'green') return 'rgba(34, 197, 94, 0.15)';
  if (fb === 'yellow') return 'rgba(249, 115, 22, 0.15)';
  if (fb === 'black') return 'rgba(100, 116, 139, 0.15)';
  return null;
}

function GuideFeedbackTile({ tile, feedback }: { tile: string; feedback: TileFeedback }) {
  const overlay = guideFeedbackOverlay(feedback);
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: GUIDE_TILE_WIDTH,
        aspectRatio: '5 / 6',
        borderRadius: 6,
        border: '2px solid',
        ...guideFeedbackStyle(feedback),
      }}
    >
      <span
        className="relative inline-flex leading-none"
        style={feedback === 'black' ? { opacity: 0.72 } : undefined}
      >
        <MahjongTile tile={tile} height={GUIDE_TILE_HEIGHT} />
        {overlay && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ background: overlay, borderRadius: 3 }}
            aria-hidden
          />
        )}
      </span>
    </div>
  );
}

function GuideFeedbackExample({
  tile,
  feedback,
  label,
}: {
  tile: string;
  feedback: TileFeedback;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <GuideFeedbackTile tile={tile} feedback={feedback} />
      <p className="text-sm flex-1 leading-snug" style={{ color: 'var(--color-text)' }}>
        {label}
      </p>
    </div>
  );
}

function GuideMeldGroup({
  tiles,
  feedbacks,
  borderColor,
  label,
}: {
  tiles: string[];
  feedbacks: TileFeedback[];
  borderColor: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1 shrink-0">
      {label && (
        <span className="text-[10px] font-semibold leading-none" style={{ color: borderColor }}>
          {label}
        </span>
      )}
      <div
        className="rounded-lg px-1.5 py-1"
        style={{ background: 'rgba(255, 255, 255, 0.88)', border: `1.5px solid ${borderColor}` }}
      >
        <div className="flex flex-nowrap items-end" style={{ gap: 2 }}>
          {tiles.map((tile, i) => (
            <GuideFeedbackTile key={i} tile={tile} feedback={feedbacks[i] ?? 'none'} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GuideTabPanel({ children }: { children: ReactNode }) {
  return <div className="space-y-3 text-sm leading-relaxed">{children}</div>;
}

function GuideParagraph({ children }: { children: ReactNode }) {
  return <p style={{ color: 'var(--color-text)' }}>{children}</p>;
}

function GuideCallout({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-sm px-3 py-2 rounded-lg font-medium leading-snug"
      style={{ background: 'rgba(255, 247, 237, 0.9)', border: '1px solid #fcd34d', color: '#92400e' }}
    >
      {children}
    </p>
  );
}

export function QueMiGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<GuideTab>('basics');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div
        className="max-w-lg w-full rounded-2xl shadow-xl flex flex-col max-h-[min(90vh,640px)]"
        style={{ background: 'var(--color-card)' }}
      >
        <div className="p-5 pb-3 shrink-0">
          <h2 className="text-lg font-bold mb-3">{t('queMi.guideTitle')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {GUIDE_TABS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors"
                style={{
                  background: tab === id ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: tab === id ? '#fff' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {t(`queMi.guideTab.${id}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 min-h-0">
          {tab === 'basics' && (
            <GuideTabPanel>
              <GuideParagraph>{t('queMi.guide.basics.type')}</GuideParagraph>
              <GuideParagraph>{t('queMi.guide.basics.difficulty')}</GuideParagraph>
              <GuideParagraph>{t('queMi.guide.basics.winnable')}</GuideParagraph>
              <GuideParagraph>{t('queMi.guide.basics.nonWinnable')}</GuideParagraph>
            </GuideTabPanel>
          )}

          {tab === 'input' && (
            <GuideTabPanel>
              <GuideParagraph>{t('queMi.guide.input.overview')}</GuideParagraph>
              <GuideParagraph>{t('queMi.guide.input.order')}</GuideParagraph>
              <GuideCallout>{t('queMi.guide.input.draw')}</GuideCallout>
            </GuideTabPanel>
          )}

          {tab === 'feedback' && (
            <GuideTabPanel>
              <GuideParagraph>{t('queMi.guide.feedback.intro')}</GuideParagraph>
              <div className="space-y-2.5 py-1">
                <GuideFeedbackExample tile="1m" feedback="green" label={t('queMi.guide.feedback.green')} />
                <GuideFeedbackExample tile="5m" feedback="yellow" label={t('queMi.guide.feedback.yellow')} />
                <GuideFeedbackExample tile="7z" feedback="black" label={t('queMi.guide.feedback.black')} />
              </div>
            </GuideTabPanel>
          )}

          {tab === 'open' && (
            <GuideTabPanel>
              <GuideParagraph>{t('queMi.guide.open.layout')}</GuideParagraph>
              <div className="flex flex-wrap items-end gap-3 py-1">
                <GuideMeldGroup
                  tiles={['1m', '1m', '1m']}
                  feedbacks={['green', 'green', 'green']}
                  borderColor="#60a5fa"
                  label={t('queMi.guide.open.meldGreen')}
                />
                <GuideMeldGroup
                  tiles={['2p', '3p', '4p']}
                  feedbacks={['yellow', 'yellow', 'none']}
                  borderColor="#fbbf24"
                  label={t('queMi.guide.open.meldPartial')}
                />
              </div>
              <div className="flex items-center gap-3 py-1">
                <GuideFeedbackTile tile="5s" feedback="yellow" />
                <p className="text-sm flex-1 leading-snug" style={{ color: 'var(--color-text)' }}>
                  {t('queMi.guide.open.handOrange')}
                </p>
              </div>
              <GuideParagraph>{t('queMi.guide.open.swap')}</GuideParagraph>
            </GuideTabPanel>
          )}

          {tab === 'tips' && (
            <GuideTabPanel>
              <GuideParagraph>{t('queMi.guide.tips.tiles')}</GuideParagraph>
              <GuideParagraph>{t('queMi.guide.tips.input')}</GuideParagraph>
              <GuideParagraph>{t('queMi.guide.tips.save')}</GuideParagraph>
            </GuideTabPanel>
          )}
        </div>

        <div className="p-5 pt-3 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button type="button" onClick={onClose} className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold">
            {t('queMi.guideOk')}
          </button>
        </div>
      </div>
    </div>
  );
}
