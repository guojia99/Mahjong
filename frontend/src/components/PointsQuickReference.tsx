import { useState, useEffect } from 'react';
import {
  QUICK_TABLE_FU,
  MANGAN_ROW_LABELS,
  MANGAN_ROWS_OYA,
  MANGAN_ROWS_KO,
  WIKI_SOURCE,
  buildFuRowSegments,
  quickCellParts,
  quickManganTableParts,
  type QuickCellParts,
} from '@/mahjong-calc/scoringQuickTable';
import { Rule } from '@/mahjong-calc/definition';
import { Table, X } from 'lucide-react';

const HAN_ROWS = [1, 2, 3, 4] as const;

function fuHeaderLabel(fu: number): string {
  if (fu === 20) return '20\n平和自摸';
  if (fu === 25) return '25\n七对子';
  return String(fu);
}

function QuickCellDisplay({ parts }: { parts: QuickCellParts }) {
  if (parts.kind === 'empty') {
    return <span style={{ color: 'var(--color-text-light)' }}>—</span>;
  }
  if (parts.kind === 'plain') {
    return (
      <span className="font-mono text-[0.7rem]" style={{ color: 'var(--color-text)' }}>
        {parts.text}
      </span>
    );
  }
  if (parts.kind !== 'twoLine') return null;
  const topHighlight = /^\d+$/.test(parts.top);
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 leading-tight py-0.5">
      {parts.badge ? (
        <span className="text-[0.62rem] font-bold tracking-wide" style={{ color: '#c2410c' }}>
          {parts.badge}
        </span>
      ) : null}
      <span
        className="font-mono text-[0.72rem] sm:text-[0.75rem]"
        style={{
          fontWeight: 700,
          color: topHighlight ? '#ea8c55' : 'var(--color-text-light)',
        }}
      >
        {parts.top}
      </span>
      <span
        className="font-mono text-[0.58rem] sm:text-[0.62rem]"
        style={{ color: 'var(--color-text-light)' }}
      >
        {parts.bottom}
      </span>
    </div>
  );
}

function TablePanel({ dealer }: { dealer: boolean }) {
  const rule = new Rule();
  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
        <a
          href={WIKI_SOURCE}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: '#1565c0' }}
        >
          维基教科书 · 点数计算规则
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.75)' }}>
        <table className="w-full text-center border-collapse min-w-[720px]">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 px-2 py-2.5 text-xs font-bold whitespace-nowrap"
                style={{
                  background: 'linear-gradient(180deg, #2d5a48, #1d3d30)',
                  color: '#ecfdf5',
                  borderBottom: '2px solid rgba(0,0,0,0.15)',
                }}
              >
                翻 \ 符
              </th>
              {QUICK_TABLE_FU.map(fu => (
                <th
                  key={fu}
                  className="px-1.5 py-2 text-[0.65rem] font-bold leading-tight whitespace-pre-line border-l"
                  style={{
                    background: 'linear-gradient(180deg, #2d5a48, #1d3d30)',
                    color: '#ecfdf5',
                    borderColor: 'rgba(255,255,255,0.12)',
                    minWidth: '3.25rem',
                  }}
                >
                  {fuHeaderLabel(fu)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HAN_ROWS.map((han, ri) => (
              <tr
                key={han}
                style={{
                  background: ri % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(61,157,120,0.04)',
                }}
              >
                <td
                  className="sticky left-0 z-10 px-2 py-2 text-sm font-bold whitespace-nowrap border-t"
                  style={{
                    background: ri % 2 === 0 ? '#fafcfa' : '#f3faf6',
                    color: 'var(--color-primary-dark)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {han} 番
                </td>
                {buildFuRowSegments(han, rule).map((seg, si) => {
                  if (seg.type === 'single') {
                    const parts = quickCellParts(dealer, han, seg.fu, rule);
                    return (
                      <td
                        key={seg.fu}
                        className="px-1 py-2 border-t border-l leading-snug align-middle"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <QuickCellDisplay parts={parts} />
                      </td>
                    );
                  }
                  return (
                    <td
                      key={`mangan-${han}-${si}`}
                      colSpan={seg.colSpan}
                      className="px-2 py-2 border-t border-l align-middle"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: 'rgba(254, 243, 199, 0.35)',
                      }}
                    >
                      <QuickCellDisplay parts={quickManganTableParts(dealer)} />
                    </td>
                  );
                })}
              </tr>
            ))}
            {MANGAN_ROW_LABELS.map((label, i) => (
              <tr key={label} style={{ background: 'rgba(230, 126, 34, 0.06)' }}>
                <td
                  className="sticky left-0 z-10 px-2 py-2.5 text-xs font-bold border-t whitespace-nowrap"
                  style={{
                    background: '#fff8f0',
                    color: '#c2410c',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {label}
                </td>
                <td
                  colSpan={QUICK_TABLE_FU.length}
                  className="px-3 py-2.5 text-left text-sm font-mono font-semibold border-t border-l"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: '#7c2d12',
                  }}
                >
                  {dealer ? MANGAN_ROWS_OYA[i] : MANGAN_ROWS_KO[i]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-[0.68rem] leading-relaxed px-1" style={{ color: 'var(--color-text-light)' }}>
        表内为<strong>无场棒</strong>时的点数。荣和为点炮者支付总额；子家表自摸第二行为<strong>闲家/庄家</strong>各付（斜杠分隔）。
        20 符 1 翻、25 符 1 翻及 2–4 翻 20 符荣和格按常见速查表省略；计算与站内算分器规则一致。满贯为以下<strong>任一</strong>：<strong>3 翻且 70 符及以上</strong>、<strong>4 翻且 40 符及以上</strong>，或<strong>5 翻及以上</strong>（均按满贯基本点 2000 计）。
      </p>
    </>
  );
}

export default function PointsQuickReference() {
  const [tab, setTab] = useState<'oya' | 'ko'>('ko');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all border"
        style={{
          borderColor: 'var(--color-border)',
          background: 'linear-gradient(135deg, #e8f5e9, #fff8e1)',
          color: 'var(--color-primary-dark)',
          boxShadow: '0 2px 10px rgba(61,157,120,0.15)',
        }}
      >
        <Table size={18} className="text-[#2d7d5e]" />
        点数速查表
      </button>

      {open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 p-0"
            style={{ background: 'rgba(15, 23, 42, 0.55)' }}
            aria-label="关闭对话框"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="points-quick-ref-title"
            className="relative z-[1] w-[calc(100vw-1.5rem)] max-w-[58rem] max-h-[min(92vh,52rem)] rounded-2xl border shadow-2xl flex flex-col overflow-hidden outline-none"
            style={{
              borderColor: 'var(--color-border)',
              background: 'linear-gradient(165deg, #faf7f2 0%, #f0ebe3 42%, #e8f4ef 100%)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 py-3 shrink-0 border-b"
              style={{
                borderColor: 'var(--color-border)',
                background: 'linear-gradient(90deg, rgba(61,157,120,0.14), rgba(230, 81, 0, 0.08))',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Table size={22} className="shrink-0 text-[#2d7d5e]" />
                <h2 id="points-quick-ref-title" className="text-base font-bold truncate" style={{ color: 'var(--color-primary-dark)' }}>
                  点数速查表
                </h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="inline-flex rounded-full p-0.5 gap-0.5" style={{ background: 'rgba(0,0,0,0.06)' }}>
                  <button
                    type="button"
                    onClick={() => setTab('oya')}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all sm:text-sm sm:px-4 sm:py-1.5"
                    style={{
                      background: tab === 'oya' ? 'white' : 'transparent',
                      color: tab === 'oya' ? '#b45309' : 'var(--color-text-light)',
                      boxShadow: tab === 'oya' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    亲家
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('ko')}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all sm:text-sm sm:px-4 sm:py-1.5"
                    style={{
                      background: tab === 'ko' ? 'white' : 'transparent',
                      color: tab === 'ko' ? '#2d7d5e' : 'var(--color-text-light)',
                      boxShadow: tab === 'ko' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    子家
                  </button>
                </div>
                <button
                  type="button"
                  className="p-2 rounded-full transition-colors hover:bg-black/5 outline-none"
                  aria-label="关闭"
                  onClick={() => setOpen(false)}
                >
                  <X size={22} style={{ color: 'var(--color-text)' }} />
                </button>
              </div>
            </div>

            <p id="points-quick-ref-desc" className="sr-only">
              日麻荣和与子家自摸时的点数对照，可按亲家或子家切换查看。
            </p>

            <div className="overflow-y-auto flex-1 px-3 sm:px-4 py-3 min-h-0" aria-describedby="points-quick-ref-desc">
              <TablePanel dealer={tab === 'oya'} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
