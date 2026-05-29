import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CSSProperties, ReactNode } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { PlayerAiMatchScorePoint } from '@/types';
import { GAME_MODE_LABELS, GAME_MODE_FULL_LABELS } from '@/types';
import { gradeColor } from '@/paipu/aiAnalysis';

ChartJS.register(LinearScale, PointElement, LineElement, Filler);

function TooltipBody({ row }: { row: PlayerAiMatchScorePoint | null }) {
  const { t } = useTranslation();
  const cardStyle: CSSProperties = {
    minWidth: '200px',
    maxWidth: '260px',
    padding: '0.5rem 0.65rem',
    borderRadius: '0.5rem',
    background: 'white',
    border: '1px solid var(--color-border)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
    fontSize: '0.75rem',
    lineHeight: 1.45,
  };
  if (!row) return null;

  const pc = row.player_count;
  const modeLabel = row.game_mode
    ? (GAME_MODE_FULL_LABELS[row.game_mode] || GAME_MODE_LABELS[row.game_mode] || row.game_mode)
    : '—';

  return (
    <div style={cardStyle}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {pc === 3 && <span className="badge badge-sanma">{t('playerCount.sanma')}</span>}
        {pc === 4 && <span className="badge badge-yonma">{t('playerCount.yonma')}</span>}
        <span className="badge badge-mode" style={{ fontSize: '0.625rem' }}>{modeLabel}</span>
        <span className="badge badge-online" style={{ fontSize: '0.625rem' }}>{t('gameType.online')}</span>
      </div>
      <div style={{ color: 'var(--color-text-light)', marginBottom: '0.35rem' }}>{row.start_time || '—'}</div>
      <div>
        <strong>{t('playerProfile.aiMatchScoreLabel')}</strong>{' '}
        {row.match_avg}{' '}
        <span style={{ color: gradeColor(row.match_grade), fontWeight: 700 }}>({row.match_grade})</span>
      </div>
    </div>
  );
}

type Props = {
  series: PlayerAiMatchScorePoint[];
};

export default function PlayerAiMatchScoreChart({ series }: Props) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ ox: number; oy: number; wrapWidth: number; node: ReactNode } | null>(null);

  const points = useMemo(
    () =>
      series.length === 1
        ? [
            { x: 0, y: series[0].match_avg },
            { x: 1, y: series[0].match_avg },
          ]
        : series.map((s) => ({ x: s.game_index, y: s.match_avg })),
    [series],
  );

  const chartColors = useMemo(() => {
    if (typeof document === 'undefined') {
      return { border: '#4f46e5', fill: '#eef2ff' };
    }
    const root = document.documentElement;
    const border = getComputedStyle(root).getPropertyValue('--color-primary-dark').trim() || '#4f46e5';
    const fill = getComputedStyle(root).getPropertyValue('--color-primary-light').trim() || '#eef2ff';
    return { border, fill };
  }, []);

  const data: ChartData<'line'> = useMemo(
    () => ({
      datasets: [
        {
          label: t('playerProfile.aiMatchScoreChartLabel'),
          data: points.map((p) => ({ x: p.x, y: p.y })),
          borderColor: chartColors.border,
          backgroundColor: `${chartColors.border}18`,
          borderWidth: 2,
          tension: 0.28,
          fill: true,
          pointRadius: series.length > 30 ? 2 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: chartColors.border,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHitRadius: 12,
        },
      ],
    }),
    [chartColors.border, points, series.length, t],
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x',
      },
      layout: { padding: { top: 6, right: 8, bottom: 4, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: t('chart.gameIndexLabel'),
            color: '#888',
            font: { size: 10 },
            padding: { top: 4 },
          },
          ticks: {
            color: '#888',
            font: { size: 10 },
            maxTicksLimit: 14,
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: '#888',
            font: { size: 10 },
            stepSize: 20,
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
      onHover: (event, elements) => {
        const wrap = wrapRef.current;
        const native = event.native as MouseEvent | undefined;
        if (!elements.length || !wrap || !native) {
          setTip(null);
          return;
        }
        const idx = elements[0].index;
        const pt = points[idx];
        if (!pt) {
          setTip(null);
          return;
        }
        const si =
          series.length === 1
            ? 0
            : Math.max(0, Math.min(series.length - 1, Math.round(pt.x)));
        const rect = wrap.getBoundingClientRect();
        setTip({
          ox: native.clientX - rect.left,
          oy: native.clientY - rect.top,
          wrapWidth: wrap.clientWidth,
          node: <TooltipBody row={series[si] ?? null} />,
        });
      },
    }),
    [points, series, t],
  );

  const onMouseLeave = useCallback(() => setTip(null), []);

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      style={{ height: 200 }}
      onMouseLeave={onMouseLeave}
    >
      <Line data={data} options={options} />
      {tip && (
        <div
          className="pointer-events-none"
          style={{
            position: 'absolute',
            left: Math.min(tip.ox + 12, Math.max(0, tip.wrapWidth - 228)),
            top: tip.oy + 12,
            zIndex: 20,
          }}
        >
          {tip.node}
        </div>
      )}
    </div>
  );
}
