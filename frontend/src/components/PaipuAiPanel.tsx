import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReplayRound } from '@/paipu/paipuReplayModel';
import {
  buildModelDiffRows,
  decisionForReplayFrame,
  decisionFrameIndices,
  replayFrameIndexForDecision,
  formatOptionLabel,
  gradeColor,
  modelDisplayLabel,
  optionShowsTileImage,
  playerAnalysisForSeat,
  topOptions,
  type AiAnalysisFull,
  type AiDecisionOption,
  type AiModelDiffRow,
  type AiModelInfo,
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
  const [allAnalyses, setAllAnalyses] = useState<Record<string, AiAnalysisFull>>({});
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [modelKey, setModelKey] = useState<string>('');
  const [compareKey, setCompareKey] = useState<string>('');
  const [showCompare, setShowCompare] = useState(false);
  const [status, setStatus] = useState<string>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getGameAiAnalysis(gameId)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.status);
        const list = res.models ?? [];
        setModels(list);
        setAllAnalyses(res.analyses ?? {});
        const key = res.model_key ?? list[0]?.key ?? '';
        setModelKey(key);
        if (list.length > 1) {
          setCompareKey((prev) => prev || list.find((m) => m.key !== key)?.key || '');
        }
        setAnalysis(res.analysis ?? (key ? res.analyses?.[key] : undefined) ?? null);
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!modelKey) return;
    const cached = allAnalyses[modelKey];
    if (cached) {
      setAnalysis(cached);
      return;
    }
    let cancelled = false;
    getGameAiAnalysis(gameId, { model: modelKey })
      .then((res) => {
        if (cancelled) return;
        if (res.analysis) {
          setAnalysis(res.analysis);
          setAllAnalyses((prev) => ({ ...prev, [modelKey]: res.analysis! }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gameId, modelKey]);

  const player = playerAnalysisForSeat(analysis, viewSeat);
  const decision = decisionForReplayFrame(player, roundIndex, round.frames, frameIdx, viewSeat);
  const top = topOptions(decision, 3);
  const viewPlayer = analysis?.players.find((p) => p.seat === viewSeat);
  const kyokuRow = viewPlayer?.kyoku.find((k) => k.kyoku_index === roundIndex);

  const decisionFrames = useMemo(
    () => decisionFrameIndices(player, roundIndex, round.frames, viewSeat, false),
    [player, roundIndex, round.frames, viewSeat],
  );
  const diffFrames = useMemo(
    () => decisionFrameIndices(player, roundIndex, round.frames, viewSeat, true),
    [player, roundIndex, round.frames, viewSeat],
  );

  const decisionPos = decisionFrames.indexOf(frameIdx);
  const diffPos = diffFrames.indexOf(frameIdx);

  const compareAnalysis = compareKey ? allAnalyses[compareKey] : null;
  const modelDiffRows: AiModelDiffRow[] =
    showCompare && analysis && compareAnalysis
      ? buildModelDiffRows(analysis, compareAnalysis, viewSeat, roundIndex)
      : [];
  const currentDiffRow = modelDiffRows.find((r) => {
    const d = kyokuRow?.decisions.find((x) => x.action_index === r.action_index);
    if (!d) return false;
    return replayFrameIndexForDecision(d, round.frames, viewSeat) === frameIdx;
  });

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
  if (!analysis) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <Brain size={15} style={{ color: '#4f46e5' }} />
          <span className="text-sm font-semibold" style={{ color: '#312e81' }}>
            {t('paipuAi.title')}
          </span>
        </div>
        {models.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            <label className="text-xs" style={{ color: 'var(--color-text-light)' }}>
              {t('paipuAi.model')}
              <select
                className="ml-1 mt-1 w-full text-xs rounded border px-2 py-1"
                value={modelKey}
                onChange={(e) => setModelKey(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.key} value={m.key}>
                    {modelDisplayLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            {models.length > 1 && (
              <>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCompare}
                    onChange={(e) => setShowCompare(e.target.checked)}
                  />
                  {t('paipuAi.compareModels')}
                </label>
                {showCompare && (
                  <label className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                    {t('paipuAi.compareWith')}
                    <select
                      className="ml-1 mt-1 w-full text-xs rounded border px-2 py-1"
                      value={compareKey}
                      onChange={(e) => setCompareKey(e.target.value)}
                    >
                      {models
                        .filter((m) => m.key !== modelKey)
                        .map((m) => (
                          <option key={m.key} value={m.key}>
                            {modelDisplayLabel(m)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        )}
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
          {showCompare && currentDiffRow ? (
            <ModelDiffStepTable row={currentDiffRow} modelA={modelKey} modelB={compareKey} t={t} />
          ) : null}
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
              {!showCompare ? <OptionsTable options={decision.options} t={t} /> : null}
              {showCompare && modelDiffRows.length > 0 && (
                <ModelDiffTable rows={modelDiffRows} modelA={modelKey} modelB={compareKey} t={t} />
              )}
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
  t: (key: string, opts?: Record<string, string>) => string;
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

function ModelDiffStepTable({
  row,
  modelA,
  modelB,
  t,
}: {
  row: AiModelDiffRow;
  modelA: string;
  modelB: string;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="text-xs rounded-md p-2"
      style={{ background: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)' }}
    >
      <div className="font-semibold mb-2">{t('paipuAi.modelDiffStep')}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <ModelDiffActionCell option={row.chosen_option} label={row.chosen_label} tileHeight={36} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <ModelDiffModelBlock name={modelA} score={row.score_a} top={row.top_option_a} t={t} />
        <ModelDiffModelBlock name={modelB} score={row.score_b} top={row.top_option_b} t={t} />
      </div>
      <div style={{ fontWeight: 700, marginTop: 8 }}>
        {t('paipuAi.scoreDiff')}: {row.score_diff > 0 ? '+' : ''}
        {row.score_diff}
      </div>
    </div>
  );
}

function ModelDiffTable({
  rows,
  modelA,
  modelB,
  t,
}: {
  rows: AiModelDiffRow[];
  modelA: string;
  modelB: string;
  t: (key: string) => string;
}) {
  const mismatches = rows.filter((r) => r.score_diff !== 0 || r.top_label_a !== r.top_label_b);
  if (mismatches.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold mb-1" style={{ color: '#4338ca' }}>
        {t('paipuAi.modelDiffTable')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>{t('paipuAi.modelDiffAction')}</th>
              <th style={thStyle}>{modelA}</th>
              <th style={thStyle}>{modelB}</th>
              <th style={thStyle}>{t('paipuAi.scoreDiff')}</th>
            </tr>
          </thead>
          <tbody>
            {mismatches.map((r) => (
              <tr key={r.action_index}>
                <td style={tdStyle}>
                  <ModelDiffActionCell option={r.chosen_option} label={r.chosen_label} tileHeight={32} />
                </td>
                <td style={tdStyle}>
                  <ModelDiffMetrics score={r.score_a} t={t} />
                </td>
                <td style={tdStyle}>
                  <ModelDiffMetrics score={r.score_b} t={t} />
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, verticalAlign: 'middle' }}>
                  {r.score_diff > 0 ? '+' : ''}
                  {r.score_diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelDiffActionCell({
  option,
  label,
  tileHeight = 32,
}: {
  option: AiDecisionOption | null;
  label: string;
  tileHeight?: number;
}) {
  if (option) {
    return <AiOptionCell option={option} tileHeight={tileHeight} showChosen={false} />;
  }
  return <span>{label}</span>;
}

function ModelDiffMetrics({ score, t }: { score: number; t: (key: string) => string }) {
  return (
    <div style={{ lineHeight: 1.35 }}>
      <span style={{ color: 'var(--color-text-light)' }}>{t('paipuAi.score')}: </span>
      <span style={{ fontWeight: 600 }}>{score}</span>
    </div>
  );
}

function ModelDiffModelBlock({
  name,
  score,
  top,
  t,
}: {
  name: string;
  score: number;
  top: AiDecisionOption | null;
  t: (key: string) => string;
}) {
  return (
    <div style={{ lineHeight: 1.4 }}>
      <div className="font-semibold mb-1">{name}</div>
      <ModelDiffMetrics score={score} t={t} />
      {top && !top.chosen ? (
        <div style={{ marginTop: 6, color: 'var(--color-text-light)' }}>
          <span>{t('paipuAi.modelDiffTop')}: </span>
          <AiOptionCell option={top} tileHeight={24} />
        </div>
      ) : null}
    </div>
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

function AiOptionCell({
  option: o,
  tileHeight = 24,
  showChosen = true,
}: {
  option: AiDecisionOption;
  tileHeight?: number;
  /** In model-diff tables the row is already the human action; omit ✓ / highlight. */
  showChosen?: boolean;
}) {
  const mark = showChosen && o.chosen;
  if (optionShowsTileImage(o) && o.pai) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <MahjongTile tile={o.pai} height={tileHeight} highlight={mark} ariaLabel={o.pai} />
        {mark ? <span aria-hidden>✓</span> : null}
      </span>
    );
  }
  const text = formatOptionLabel(o);
  return (
    <span>
      {text}
      {mark ? ' ✓' : ''}
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
