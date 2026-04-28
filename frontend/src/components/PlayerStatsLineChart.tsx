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
import type { PlayerStatsRecentPoint } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, GAME_MODE_FULL_LABELS } from '@/types';

ChartJS.register(LinearScale, PointElement, LineElement, Filler);

function fmtSignedPt(v: number) {
  const x = Math.round(v * 100) / 100;
  if (x > 0) return `+${x}`;
  return String(x);
}

function resolvePlayerCountForTip(row: PlayerStatsRecentPoint, filterPc: '' | '3' | '4'): number | undefined {
  if (row.player_count === 3 || row.player_count === 4) return row.player_count;
  if (filterPc === '3' || filterPc === '4') return parseInt(filterPc, 10);
  return undefined;
}

function StatGameTooltipBody({
  row,
  chartKind,
  filterPlayerCount,
}: {
  row: PlayerStatsRecentPoint | null;
  chartKind: 'rank' | 'cum_pt';
  filterPlayerCount: '' | '3' | '4';
}) {
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

  if (chartKind === 'cum_pt' && !row) {
    return (
      <div style={cardStyle}>
        <div className="font-bold" style={{ marginBottom: '0.25rem' }}>{t('chart.startPoint')}</div>
        <div style={{ color: 'var(--color-text-light)' }}>{t('chart.startPointDesc')}</div>
      </div>
    );
  }
  if (!row) return null;

  const pc = resolvePlayerCountForTip(row, filterPlayerCount);
  const modeLabel = row.game_mode
    ? (GAME_MODE_FULL_LABELS[row.game_mode] || GAME_MODE_LABELS[row.game_mode] || row.game_mode)
    : '—';
  const typeLabel = row.game_type ? (GAME_TYPE_LABELS[row.game_type] || row.game_type) : '—';
  const scoreDisp = row.score === null || row.score === undefined ? '—' : String(row.score);

  return (
    <div style={cardStyle}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {pc === 3 && <span className="badge badge-sanma">{t('playerCount.sanma')}</span>}
        {pc === 4 && <span className="badge badge-yonma">{t('playerCount.yonma')}</span>}
        {pc !== 3 && pc !== 4 && (
          <span className="badge" style={{ background: '#ececec', color: '#666', fontSize: '0.625rem' }}>{t('chart.sanmaYonmaUnknown')}</span>
        )}
        <span className="badge badge-mode" style={{ fontSize: '0.625rem' }}>{modeLabel}</span>
        <span
          className={`badge ${row.game_type === 'online' ? 'badge-online' : row.game_type === 'offline' ? 'badge-offline' : ''}`}
          style={{
            fontSize: '0.625rem',
            ...(row.game_type !== 'online' && row.game_type !== 'offline' ? { background: '#ececec', color: '#666' } : {}),
          }}
        >
          {typeLabel}
        </span>
      </div>
      <div style={{ color: 'var(--color-text-light)', marginBottom: '0.35rem' }}>{row.start_time || '—'}</div>
      <div><strong>{t('chart.rankLabel')}</strong> {t('chart.rankN')} {row.rank} {t('chart.rankPosition')}</div>
      <div><strong>{t('chart.scoreLabel')}</strong> {scoreDisp}</div>
      <div><strong>{t('chart.gamePt')}</strong> {fmtSignedPt(row.pt)} pt</div>
      {chartKind === 'cum_pt' && row.cumulative_pt !== undefined && (
        <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed var(--color-border)' }}>
          <strong>{t('chart.cumPtLabel')}</strong> {fmtSignedPt(row.cumulative_pt)} pt
        </div>
      )}
    </div>
  );
}

function rankTooltipSeriesIndex(chartSeriesLen: number, pt: { x: number; y: number }): number {
  if (chartSeriesLen <= 0) return 0;
  if (chartSeriesLen === 1) return 0;
  return Math.max(0, Math.min(chartSeriesLen - 1, Math.round(pt.x)));
}

export type PlayerStatsLineChartProps = {
  chartKind: 'rank' | 'cum_pt';
  chartSeries: PlayerStatsRecentPoint[];
  filterPlayerCount: '' | '3' | '4';
  maxRankForChart: number;
  points: { x: number; y: number }[];
};

export default function PlayerStatsLineChart({
  chartKind,
  chartSeries,
  filterPlayerCount,
  maxRankForChart,
  points,
}: PlayerStatsLineChartProps) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ ox: number; oy: number; wrapWidth: number; node: ReactNode } | null>(null);

  const chartColors = useMemo(() => {
    if (typeof document === 'undefined') {
      return { border: '#d484a8', fill: '#f5cde0' };
    }
    const root = document.documentElement;
    const border = getComputedStyle(root).getPropertyValue('--color-primary-dark').trim() || '#d484a8';
    const fill = getComputedStyle(root).getPropertyValue('--color-primary-light').trim() || '#f5cde0';
    return { border, fill };
  }, []);

  const data: ChartData<'line'> = useMemo(
    () => ({
      datasets: [
        {
          label: chartKind === 'rank' ? t('chart.rankTrend') : t('chart.cumPt'),
          data: points.map((p) => ({ x: p.x, y: p.y })),
          borderColor: chartColors.border,
          backgroundColor:
            chartKind === 'cum_pt'
              ? `${chartColors.border}22`
              : `${chartColors.fill}55`,
          borderWidth: 2,
          tension: 0.28,
          fill: chartKind === 'cum_pt',
          pointRadius: chartSeries.length > 30 ? 2 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: chartColors.border,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHitRadius: 12,
        },
      ],
    }),
    [chartKind, chartColors.border, chartColors.fill, points, chartSeries.length],
  );

  const yBounds = useMemo(() => {
    if (chartKind === 'rank') {
      return { min: 1, max: maxRankForChart };
    }
    const ys = points.map((p) => p.y);
    const lo = Math.min(...ys, 0);
    const hi = Math.max(...ys, 0);
    const pad = Math.max(Math.abs(hi - lo) * 0.08, 0.5);
    return { min: lo - pad, max: hi + pad };
  }, [chartKind, maxRankForChart, points]);

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
            text: chartKind === 'rank' ? t('chart.gameIndexLabel') : t('chart.gameIndexZeroLabel'),
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
        y:
          chartKind === 'rank'
            ? {
                min: 1,
                max: maxRankForChart,
                ticks: {
                  color: '#888',
                  font: { size: 10 },
                  stepSize: 1,
                  precision: 0,
                  autoSkip: false,
                  callback: (tickValue) => {
                    const v = Number(tickValue);
                    const rank = maxRankForChart + 1 - Math.round(v);
                    return `${rank}${t('chart.rankPosition')}`;
                  },
                },
                grid: { color: 'rgba(0,0,0,0.06)' },
              }
            : {
                min: yBounds.min,
                max: yBounds.max,
                ticks: {
                  color: '#888',
                  font: { size: 10 },
                  callback: (tickValue) => {
                    const v = Number(tickValue);
                    return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
                  },
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

        let node: ReactNode = null;
        if (chartKind === 'rank') {
          const si = rankTooltipSeriesIndex(chartSeries.length, pt);
          node = <StatGameTooltipBody row={chartSeries[si]} chartKind="rank" filterPlayerCount={filterPlayerCount} />;
        } else {
          const x = Math.round(pt.x);
          if (x <= 0) {
            node = <StatGameTooltipBody row={null} chartKind="cum_pt" filterPlayerCount={filterPlayerCount} />;
          } else {
            const si = Math.max(0, Math.min(chartSeries.length - 1, x - 1));
            node = <StatGameTooltipBody row={chartSeries[si]} chartKind="cum_pt" filterPlayerCount={filterPlayerCount} />;
          }
        }

        const rect = wrap.getBoundingClientRect();
        setTip({
          ox: native.clientX - rect.left,
          oy: native.clientY - rect.top,
          wrapWidth: wrap.clientWidth,
          node,
        });
      },
    }),
    [chartKind, chartSeries, filterPlayerCount, maxRankForChart, points, yBounds.min, yBounds.max],
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
