import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReplayRound } from '@/paipu/paipuReplayModel';
import {
  decisionForReplayFrame,
  decisionFrameIndices,
  formatOptionLabel,
  gradeColor,
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
  seatPlayers: { nickname: string; avatar?: string }[];
  onNavigateFrame?: (frameIdx: number) => void;
  className?: string;
};

export function PaipuAiPanel({
  gameId,
  viewSeat,
  round,
  frameIdx,
  roundIndex,
  seatPlayers,
  onNavigateFrame,
  className,
}: Props) {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<AiAnalysisFull | null>(null);
  const [status, setStatus] = useState<string>('loading');

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

  const player = playerAnalysisForSeat(analysis, viewSeat);
  const decision = decisionForReplayFrame(player, roundIndex, round.frames, frameIdx);
  const top = topOptions(decision, 3);
  const viewPlayer = analysis?.players.find((p) => p.seat === viewSeat);
  const kyokuRow = viewPlayer?.kyoku.find((k) => k.kyoku_index === roundIndex);

  const decisionFrames = useMemo(
    () => decisionFrameIndices(player, roundIndex, round.frames, false),
    [player, roundIndex, round.frames],
  );
  const diffFrames = useMemo(
    () => decisionFrameIndices(player, roundIndex, round.frames, true),
    [player, roundIndex, round.frames],
  );

  const decisionPos = decisionFrames.indexOf(frameIdx);
  const diffPos = diffFrames.indexOf(frameIdx);

  const panelShell = (children: ReactNode) => (
    <aside
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
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

  const navBtnStyle = (disabled: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: '4px 6px',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: disabled ? '#f3f4f6' : '#fff',
    color: disabled ? '#9ca3af' : 'var(--color-text)',
    fontSize: 10,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    flex: 1,
    minWidth: 0,
  });

  const jumpFrames = (frames: number[], pos: number, delta: number) => {
    if (!onNavigateFrame || frames.length === 0) return;
    const nextPos = pos < 0 ? (delta > 0 ? 0 : frames.length - 1) : pos + delta;
    if (nextPos >= 0 && nextPos < frames.length) {
      onNavigateFrame(frames[nextPos]);
    }
  };

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
            <span style={{ fontWeight: 700 }}>{seatPlayers[viewSeat]?.nickname ?? `S${viewSeat + 1}`}</span>
            {': '}
            <GradeScore avg={viewPlayer.match_avg} grade={viewPlayer.match_grade} />
            <span style={{ fontWeight: 400, color: 'var(--color-text-light)', margin: '0 4px' }}>｜</span>
            {kyokuRow ? (
              <GradeScore avg={kyokuRow.avg} grade={kyokuRow.grade} />
            ) : (
              <span style={{ fontWeight: 400, color: 'var(--color-text-light)' }}>—</span>
            )}
          </div>
        )}
        {onNavigateFrame && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                style={navBtnStyle(decisionFrames.length === 0 || decisionPos <= 0)}
                disabled={decisionFrames.length === 0 || decisionPos <= 0}
                onClick={() => jumpFrames(decisionFrames, decisionPos, -1)}
                title={t('paipuAi.prevDecision')}
              >
                <ChevronLeft size={12} />
                {t('paipuAi.prevDecision')}
              </button>
              <button
                type="button"
                style={navBtnStyle(decisionFrames.length === 0 || (decisionPos >= 0 && decisionPos >= decisionFrames.length - 1))}
                disabled={decisionFrames.length === 0 || (decisionPos >= 0 && decisionPos >= decisionFrames.length - 1)}
                onClick={() => jumpFrames(decisionFrames, decisionPos, 1)}
                title={t('paipuAi.nextDecision')}
              >
                {t('paipuAi.nextDecision')}
                <ChevronRight size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                style={navBtnStyle(diffFrames.length === 0 || diffPos <= 0)}
                disabled={diffFrames.length === 0 || diffPos <= 0}
                onClick={() => jumpFrames(diffFrames, diffPos, -1)}
                title={t('paipuAi.prevDiff')}
              >
                <ChevronLeft size={12} />
                {t('paipuAi.prevDiff')}
              </button>
              <button
                type="button"
                style={navBtnStyle(diffFrames.length === 0 || (diffPos >= 0 && diffPos >= diffFrames.length - 1))}
                disabled={diffFrames.length === 0 || (diffPos >= 0 && diffPos >= diffFrames.length - 1)}
                onClick={() => jumpFrames(diffFrames, diffPos, 1)}
                title={t('paipuAi.nextDiff')}
              >
                {t('paipuAi.nextDiff')}
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px', minWidth: 0 }}>
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
      </div>
    </>,
  );
}

function GradeScore({ avg, grade }: { avg: number; grade: string }) {
  return (
    <>
      {avg}{' '}
      <span style={{ color: gradeColor(grade), fontWeight: 700 }}>({grade})</span>
    </>
  );
}

function cellStyle(highlight: boolean, bold = false): CSSProperties {
  return {
    ...tdStyle,
    textAlign: 'center',
    fontWeight: bold ? 700 : tdStyle.fontWeight,
    background: highlight ? 'rgba(99, 102, 241, 0.08)' : undefined,
  };
}

function scoreCell(k: { avg: number; grade: string } | undefined) {
  if (!k) return '—';
  return (
    <>
      {k.avg} <span style={{ color: gradeColor(k.grade), fontWeight: 700 }}>({k.grade})</span>
    </>
  );
}

function PlayerHeaderCell({
  nickname,
  avatar,
  highlight,
}: {
  nickname: string;
  avatar?: string;
  highlight: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '2px 4px',
        background: highlight ? 'rgba(99, 102, 241, 0.08)' : undefined,
      }}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={nickname}
          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <span
          style={{
            width: 28,
            height: 28,
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
          {nickname.slice(0, 1)}
        </span>
      )}
      <span style={{ fontWeight: 600, textAlign: 'center', lineHeight: 1.2, maxWidth: 72, wordBreak: 'break-word' }}>
        {nickname}
      </span>
    </div>
  );
}

export function PaipuAiMatchScoresTable({
  analysis,
  highlightSeat,
  kyokuCount,
  seatPlayers,
}: {
  analysis: AiAnalysisFull;
  highlightSeat: number;
  kyokuCount: number;
  seatPlayers: { nickname: string; avatar?: string }[];
}) {
  const { t } = useTranslation();
  const players = analysis.players;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle} />
            {players.map((p) => (
              <th
                key={p.seat}
                style={{
                  ...thStyle,
                  padding: '8px 6px',
                  textAlign: 'center',
                  verticalAlign: 'bottom',
                  background: highlightSeat >= 0 && p.seat === highlightSeat ? 'rgba(99, 102, 241, 0.08)' : undefined,
                }}
              >
                <PlayerHeaderCell
                  nickname={seatPlayers[p.seat]?.nickname ?? `S${p.seat + 1}`}
                  avatar={seatPlayers[p.seat]?.avatar}
                  highlight={highlightSeat >= 0 && p.seat === highlightSeat}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: kyokuCount }, (_, i) => (
            <tr key={i}>
              <th style={{ ...thStyle, padding: '10px 8px' }}>{t('paipuAi.kyokuN', { n: i + 1 })}</th>
              {players.map((p) => {
                const k = p.kyoku.find((x) => x.kyoku_index === i);
                return (
                  <td
                    key={p.seat}
                    style={{ ...cellStyle(highlightSeat >= 0 && p.seat === highlightSeat), padding: '10px 8px' }}
                  >
                    {scoreCell(k)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th style={{ ...thStyle, padding: '10px 8px' }}>{t('paipuAi.match')}</th>
            {players.map((p) => (
              <td
                key={p.seat}
                style={{
                  ...cellStyle(highlightSeat >= 0 && p.seat === highlightSeat, true),
                  padding: '10px 8px',
                }}
              >
                {p.match_avg}{' '}
                <span style={{ color: gradeColor(p.match_grade), fontWeight: 700 }}>({p.match_grade})</span>
              </td>
            ))}
          </tr>
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
    <table className="text-xs w-full max-w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
};
