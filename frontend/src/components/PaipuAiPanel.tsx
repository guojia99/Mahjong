import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';
import type { ReplayRound } from '@/paipu/paipuReplayModel';
import {
  decisionForReplayFrame,
  formatOptionLabel,
  optionShowsTileImage,
  playerAnalysisForSeat,
  topOptions,
  type AiAnalysisFull,
  type AiDecisionOption,
} from '@/paipu/aiAnalysis';
import { getGameAiAnalysis } from '@/api/games';
import { MahjongTile } from '@/components/MahjongTile';

type Props = {
  gameId: string;
  viewSeat: number;
  round: ReplayRound;
  frameIdx: number;
  roundIndex: number;
  seatPlayers: { nickname: string }[];
};

type AiTab = 'step' | 'match';

export function PaipuAiPanel({ gameId, viewSeat, round, frameIdx, roundIndex, seatPlayers }: Props) {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<AiAnalysisFull | null>(null);
  const [status, setStatus] = useState<string>('loading');
  const [tab, setTab] = useState<AiTab>('step');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getGameAiAnalysis(gameId)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.status);
        setAnalysis(res.analysis ?? null);
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const panelShell = (children: ReactNode) => (
    <aside
      style={{
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'min(72vh, 640px)',
        borderRadius: 10,
        border: '1px solid rgba(99, 102, 241, 0.35)',
        background: 'linear-gradient(180deg, rgba(238, 242, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%)',
        overflow: 'hidden',
      }}
    >
      {children}
    </aside>
  );

  if (status === 'loading') {
    return panelShell(
      <p className="text-xs" style={{ padding: 12, color: 'var(--color-text-light)' }}>
        {t('paipuAi.loading')}
      </p>,
    );
  }
  if (status !== 'done' || !analysis) {
    return panelShell(
      <p className="text-xs" style={{ padding: 12, color: 'var(--color-text-light)' }}>
        {t('paipuAi.notReady', { status })}
      </p>,
    );
  }

  const player = playerAnalysisForSeat(analysis, viewSeat);
  const kyokuCount = Math.max(0, ...analysis.players.map((p) => p.kyoku.length));
  const decision = decisionForReplayFrame(player, roundIndex, round.frames, frameIdx);
  const top = topOptions(decision, 3);
  const viewPlayer = analysis.players.find((p) => p.seat === viewSeat);

  return panelShell(
    <>
      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Brain size={15} style={{ color: '#4f46e5' }} />
          <span className="text-sm font-semibold" style={{ color: '#312e81' }}>
            {t('paipuAi.title')}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-light)', display: 'block', marginBottom: 8 }}>
          {analysis.model_tag}
        </span>
        {viewPlayer && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#4338ca',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(79, 70, 229, 0.08)',
            }}
          >
            {seatPlayers[viewSeat]?.nickname ?? `S${viewSeat + 1}`}
            <span style={{ fontWeight: 400, color: 'var(--color-text-light)', marginLeft: 6 }}>
              {t('paipuAi.match')}: {viewPlayer.match_avg} ({viewPlayer.match_grade})
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid rgba(99, 102, 241, 0.15)',
          padding: '0 8px',
          gap: 4,
        }}
      >
        <TabButton active={tab === 'step'} onClick={() => setTab('step')}>
          {t('paipuAi.tabStep')}
        </TabButton>
        <TabButton active={tab === 'match'} onClick={() => setTab('match')}>
          {t('paipuAi.tabMatchScores')}
        </TabButton>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        {tab === 'step' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {decision ? (
              <>
                <div className="text-xs font-medium" style={{ color: '#4338ca' }}>
                  {t('paipuAi.stepScore', {
                    score: decision.chosen_score,
                    pi: (decision.chosen_pi * 100).toFixed(1),
                  })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {top.map((o) => (
                    <AiOptionChip key={`${o.label}-${o.pai}-${o.action_id}`} option={o} />
                  ))}
                </div>
                <OptionsTable options={decision.options} t={t} />
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                {t('paipuAi.noDecision')}
              </p>
            )}
          </div>
        ) : (
          <MatchScoresTable
            analysis={analysis}
            viewSeat={viewSeat}
            kyokuCount={kyokuCount}
            seatPlayers={seatPlayers}
            t={t}
          />
        )}
      </div>
    </>,
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 6px',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        color: active ? '#4f46e5' : 'var(--color-text-light)',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #4f46e5' : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function MatchScoresTable({
  analysis,
  viewSeat,
  kyokuCount,
  seatPlayers,
  t,
}: {
  analysis: AiAnalysisFull;
  viewSeat: number;
  kyokuCount: number;
  seatPlayers: { nickname: string }[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>{t('paipuAi.seat')}</th>
            {Array.from({ length: kyokuCount }, (_, i) => (
              <th key={i} style={thStyle}>
                {t('paipuAi.kyokuN', { n: i + 1 })}
              </th>
            ))}
            <th style={thStyle}>{t('paipuAi.match')}</th>
          </tr>
        </thead>
        <tbody>
          {analysis.players.map((p) => (
            <tr key={p.seat} style={p.seat === viewSeat ? { background: 'rgba(99,102,241,0.08)' } : undefined}>
              <td style={tdStyle}>{seatPlayers[p.seat]?.nickname ?? `S${p.seat + 1}`}</td>
              {Array.from({ length: kyokuCount }, (_, i) => {
                const k = p.kyoku.find((x) => x.kyoku_index === i);
                return (
                  <td key={i} style={tdStyle}>
                    {k ? (
                      <>
                        {k.avg}{' '}
                        <span style={{ color: 'var(--color-text-light)' }}>({k.grade})</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                );
              })}
              <td style={{ ...tdStyle, fontWeight: 700 }}>
                {p.match_avg} ({p.match_grade})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptionsTable({
  options,
  t,
}: {
  options: AiDecisionOption[];
  t: (key: string) => string;
}) {
  const sorted = [...options].sort((a, b) => b.pi - a.pi);
  return (
    <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle}>{t('paipuAi.option')}</th>
          <th style={thStyle}>π</th>
          <th style={thStyle}>{t('paipuAi.score')}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((o, i) => (
          <tr key={i} style={o.chosen ? { background: 'rgba(79, 70, 229, 0.08)' } : undefined}>
            <td style={tdStyle}>
              <AiOptionCell option={o} />
            </td>
            <td style={tdStyle}>{(o.pi * 100).toFixed(1)}%</td>
            <td style={{ ...tdStyle, fontWeight: o.chosen ? 700 : 400 }}>{o.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AiOptionChip({ option: o }: { option: AiDecisionOption }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 11,
        border: o.chosen ? '2px solid #4f46e5' : '1px solid var(--color-border)',
        background: o.chosen ? 'rgba(79, 70, 229, 0.12)' : '#fff',
      }}
    >
      <AiOptionCell option={o} tileHeight={28} />
      <span style={{ color: 'var(--color-text-light)' }}>
        π{(o.pi * 100).toFixed(0)}% · {o.score}
      </span>
    </span>
  );
}

function AiOptionCell({ option: o, tileHeight = 24 }: { option: AiDecisionOption; tileHeight?: number }) {
  if (optionShowsTileImage(o) && o.pai) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <MahjongTile tile={o.pai} height={tileHeight} highlight={o.chosen} ariaLabel={o.pai} />
        {o.chosen ? <span aria-hidden>✓</span> : null}
      </span>
    );
  }
  const text = formatOptionLabel(o);
  return (
    <span>
      {text}
      {o.chosen ? ' ✓' : ''}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  padding: '4px 6px',
  textAlign: 'left',
  borderBottom: '1px solid var(--color-border)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
};
