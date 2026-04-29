import { Fragment, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';
import {
  buildMajsoulAccountBindings,
  buildPaipuDetailModel,
  displayPaipuSeat,
  extractPaipuActions,
} from '@/paipu/paipuDetailModel';

const WIND_KEYS = ['east', 'south', 'west', 'north'] as const;

type Props = {
  game: Game;
};

export function canShowPaipuDetailPanel(game: Game | null): boolean {
  if (!game || game.game_type !== 'online') return false;
  if (game.paipu_has_actions === true) return true;
  const pd = game.paipu_data as Record<string, unknown> | undefined;
  return extractPaipuActions(pd).length > 0;
}

function roundWindLabel(t: (k: string) => string, idx: number): string {
  const key = WIND_KEYS[idx] ?? 'east';
  return t(`paipuDetail.roundWind.${key}`);
}

const TABLE_WRAP: CSSProperties = {
  borderRadius: '0.75rem',
  border: '1px solid var(--color-border)',
  overflow: 'hidden',
  marginTop: '0.625rem',
  boxShadow: '0 1px 3px rgba(100, 80, 90, 0.06)',
};

const TABLE_HEAD: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(245, 205, 224, 0.45) 0%, rgba(208, 238, 247, 0.35) 100%)',
  borderBottom: '1px solid var(--color-border)',
};

const TABLE_TH: CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: 'var(--color-text-light)',
  padding: '0.625rem 0.75rem',
  textAlign: 'left',
};

const rowBg = (i: number): CSSProperties => ({
  background: i % 2 === 0 ? 'rgba(255,255,255,0.72)' : 'rgba(254, 249, 244, 0.85)',
});

function finalScoreStyle(v: number | null): CSSProperties {
  if (v == null) {
    return { color: 'var(--color-text-light)', fontVariantNumeric: 'tabular-nums' };
  }
  if (v > 25000) {
    return {
      color: '#14532d',
      fontWeight: 800,
      fontVariantNumeric: 'tabular-nums',
      fontSize: '0.9375rem',
      background: 'linear-gradient(180deg, rgba(220, 252, 231, 0.9) 0%, rgba(187, 247, 208, 0.5) 100%)',
      borderRadius: '0.5rem',
      padding: '0.2rem 0.55rem',
      border: '1px solid rgba(74, 222, 128, 0.35)',
    };
  }
  if (v < 25000) {
    return {
      color: '#991b1b',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      background: 'linear-gradient(180deg, rgba(254, 242, 242, 0.95) 0%, rgba(254, 226, 226, 0.45) 100%)',
      borderRadius: '0.5rem',
      padding: '0.2rem 0.55rem',
      border: '1px solid rgba(248, 113, 113, 0.25)',
    };
  }
  return {
    color: 'var(--color-text)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    background: 'rgba(255,255,255,0.65)',
    borderRadius: '0.5rem',
    padding: '0.2rem 0.55rem',
    border: '1px solid var(--color-border)',
  };
}

function rankBadgeStyle(rankIndex: number): CSSProperties {
  if (rankIndex === 0) {
    return {
      background: 'linear-gradient(145deg, #fffbeb 0%, #fde68a 55%, #fcd34d 100%)',
      color: '#92400e',
      border: '1px solid rgba(251, 191, 36, 0.65)',
      boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)',
    };
  }
  if (rankIndex === 1) {
    return {
      background: 'linear-gradient(145deg, #fafafa 0%, #e5e7eb 90%)',
      color: '#475569',
      border: '1px solid rgba(148, 163, 184, 0.45)',
      boxShadow: '0 1px 4px rgba(100, 116, 139, 0.12)',
    };
  }
  if (rankIndex === 2) {
    return {
      background: 'linear-gradient(145deg, #fff7ed 0%, #fed7aa 85%)',
      color: '#9a3412',
      border: '1px solid rgba(251, 146, 60, 0.4)',
      boxShadow: '0 1px 4px rgba(234, 88, 12, 0.12)',
    };
  }
  return {
    background: 'rgba(255,255,255,0.85)',
    color: 'var(--color-text-light)',
    border: '1px solid var(--color-border)',
  };
}

const STAT_CARD: CSSProperties = {
  borderRadius: '1rem',
  border: '1px solid color-mix(in srgb, var(--color-border) 80%, var(--color-primary-light) 20%)',
  overflow: 'hidden',
  boxShadow: '0 4px 22px rgba(120, 80, 100, 0.07), 0 1px 2px rgba(0,0,0,0.04)',
  background: 'linear-gradient(175deg, rgba(255, 253, 251, 0.98) 0%, rgba(248, 245, 241, 0.99) 48%, rgba(252, 248, 255, 0.35) 100%)',
};

const STAT_TABLE_HEAD: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(236, 200, 220, 0.55) 0%, rgba(190, 228, 240, 0.42) 55%, rgba(230, 220, 245, 0.25) 100%)',
  borderBottom: '2px solid color-mix(in srgb, var(--color-border) 70%, transparent)',
};

const statRowBg = (i: number): CSSProperties => ({
  background:
    i % 2 === 0
      ? 'rgba(255, 255, 255, 0.55)'
      : 'linear-gradient(90deg, rgba(255, 250, 245, 0.75) 0%, rgba(252, 248, 254, 0.4) 100%)',
});

function formatTableScore(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function deltaCellStyle(delta: number | null): CSSProperties {
  if (delta == null) {
    return { color: 'var(--color-text-light)', fontVariantNumeric: 'tabular-nums' };
  }
  if (delta > 0) {
    return {
      color: '#1d7a5c',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      background: 'rgba(45, 157, 120, 0.12)',
      borderRadius: '0.375rem',
      padding: '0.125rem 0.5rem',
    };
  }
  if (delta < 0) {
    return {
      color: '#a84848',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      background: 'rgba(196, 92, 92, 0.1)',
      borderRadius: '0.375rem',
      padding: '0.125rem 0.5rem',
    };
  }
  return { color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' };
}

function PaipuPlayerCell({ nickname, avatarUrl }: { nickname: string; avatarUrl?: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="shrink-0 rounded-full object-cover"
          style={{ width: '1.375rem', height: '1.375rem', border: '1px solid rgba(212, 132, 168, 0.25)' }}
        />
      ) : (
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
          style={{
            width: '1.375rem',
            height: '1.375rem',
            background: 'linear-gradient(145deg, #fff 0%, var(--color-primary-light) 100%)',
            color: 'var(--color-primary-dark)',
            border: '1px solid rgba(212, 132, 168, 0.35)',
          }}
        >
          {nickname.charAt(0) || '?'}
        </span>
      )}
      <span className="line-clamp-2 break-words min-w-0">{nickname}</span>
    </span>
  );
}

export function PaipuDetailPanel({ game }: Props) {
  const { t } = useTranslation();
  const model = useMemo(() => {
    const bindings = buildMajsoulAccountBindings(game.players);
    return buildPaipuDetailModel((game.paipu_data as Record<string, unknown> | undefined) ?? {}, {
      accountBindings: bindings,
    });
  }, [game.paipu_data, game.players, game.id]);

  const statRowsSorted = useMemo(() => {
    return [...model.seatStats].sort((a, b) => {
      const fa = a.finalScore;
      const fb = b.finalScore;
      if (fa != null && fb != null && fb !== fa) return fb - fa;
      if (fa != null && fb == null) return -1;
      if (fa == null && fb != null) return 1;
      return a.seat - b.seat;
    });
  }, [model.seatStats]);

  if (!model.hasData) {
    return (
      <div className="text-sm space-y-2" style={{ color: 'var(--color-text-light)' }}>
        <p>{t('paipuDetail.noHandData')}</p>
        {!extractPaipuActions(game.paipu_data as Record<string, unknown> | undefined).length && (
          <p className="text-xs">{t('paipuDetail.noActionsHint')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>
          {t('paipuDetail.statSectionTitle')}
        </h4>
        <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-text-light)' }}>
          {t('paipuDetail.statSortedByFinal')}
        </p>
        <div className="overflow-x-auto">
          <div style={STAT_CARD}>
            <table className="w-full min-w-[520px] border-collapse text-[13px] leading-snug">
              <thead>
                <tr style={STAT_TABLE_HEAD}>
                  <th style={{ ...TABLE_TH, width: '3rem', textAlign: 'center' }}>{t('paipuDetail.statRank')}</th>
                  <th style={{ ...TABLE_TH, width: '3.25rem' }}>{t('paipuDetail.colSeat')}</th>
                  <th style={{ ...TABLE_TH, minWidth: '7rem' }}>{t('paipuDetail.colPlayer')}</th>
                  <th style={{ ...TABLE_TH, textAlign: 'right', width: '5.5rem', whiteSpace: 'nowrap' }}>
                    {t('paipuDetail.statFinalScore')}
                  </th>
                  <th style={{ ...TABLE_TH, textAlign: 'right', width: '2.75rem' }}>{t('paipuDetail.statRon')}</th>
                  <th style={{ ...TABLE_TH, textAlign: 'right', width: '2.75rem' }}>{t('paipuDetail.statTsumo')}</th>
                  <th style={{ ...TABLE_TH, textAlign: 'right', width: '2.75rem' }}>{t('paipuDetail.statDealIn')}</th>
                  <th style={{ ...TABLE_TH, textAlign: 'right', width: '2.75rem' }}>{t('paipuDetail.statRiichi')}</th>
                  <th style={{ ...TABLE_TH, textAlign: 'right', width: '3.25rem', paddingRight: '1rem' }}>
                    {t('paipuDetail.statMax')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {statRowsSorted.map((row, ri) => (
                  <tr
                    key={row.seat}
                    className="transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-primary-light)_28%,transparent)]"
                    style={{ ...statRowBg(ri), color: 'var(--color-text)' }}
                  >
                    <td className="py-3 pl-2 pr-1 align-middle text-center">
                      <span
                        className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full text-xs font-extrabold tabular-nums"
                        style={{
                          ...rankBadgeStyle(ri),
                          padding: '0.35rem 0.45rem',
                          boxSizing: 'border-box',
                        }}
                      >
                        {ri + 1}
                      </span>
                    </td>
                    <td className="py-3 pl-1 pr-2 align-middle">
                      <span
                        className="inline-flex min-w-[1.625rem] items-center justify-center rounded-full text-xs font-bold tabular-nums"
                        style={{
                          background: 'linear-gradient(145deg, #fff 0%, var(--color-primary-light) 100%)',
                          color: 'var(--color-primary-dark)',
                          border: '1px solid rgba(212, 132, 168, 0.35)',
                          padding: '0.2rem 0.45rem',
                          boxShadow: '0 1px 2px rgba(180, 120, 150, 0.1)',
                        }}
                      >
                        {displayPaipuSeat(row.seat)}
                      </span>
                    </td>
                    <td className="py-3 pr-2 align-middle" style={{ maxWidth: '15rem' }}>
                      <PaipuPlayerCell nickname={row.nickname} avatarUrl={row.avatar} />
                    </td>
                    <td className="py-3 pr-2 text-right align-middle font-mono text-[13px]">
                      <span className="inline-block text-right" style={finalScoreStyle(row.finalScore)}>
                        {row.finalScore == null ? '—' : formatTableScore(row.finalScore)}
                      </span>
                    </td>
                    <td className="py-3 px-1.5 text-right align-middle font-mono tabular-nums text-[12px]">{row.ron}</td>
                    <td className="py-3 px-1.5 text-right align-middle font-mono tabular-nums text-[12px]">{row.tsumo}</td>
                    <td className="py-3 px-1.5 text-right align-middle font-mono tabular-nums text-[12px]">{row.dealIn}</td>
                    <td className="py-3 px-1.5 text-right align-middle font-mono tabular-nums text-[12px]">{row.riichi}</td>
                    <td className="py-3 pl-1.5 pr-4 text-right align-middle font-mono tabular-nums text-[12px] font-semibold">
                      {row.maxDealPoint}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--color-text-light)' }}>
          {t('paipuDetail.statFootnote')}
        </p>
      </section>

      <section>
        <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          {t('paipuDetail.scoreSectionTitle')}
        </h4>
        <div className="space-y-4">
          {model.handBlocks.map((block) => (
            <div
              key={block.id}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: 'var(--color-border, #e8e0d8)', background: '#faf8f6' }}
            >
              <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                {block.roundLabel}
                {block.benSuffix ? ` · ${block.benSuffix}` : ''}
                {' · '}
                {t(`paipuDetail.kind.${block.titleKey}`)}
                {block.extraNote ? ` — ${block.extraNote}` : ''}
              </div>

              {block.kind === 'notile' && (
                <p className="text-xs mt-1 mb-2" style={{ color: 'var(--color-text)' }}>
                  {t('paipuDetail.notileRuleLong')}
                </p>
              )}

              {block.kind === 'notile' && block.notileTenpai && block.scoreRows.length > 0 && (
                <div className="text-xs mb-2 space-y-1" style={{ color: 'var(--color-text)' }}>
                  <div className="flex flex-wrap items-center gap-x-0 gap-y-1">
                    <span className="font-medium shrink-0">{t('paipuDetail.tenpaiColon')}</span>
                    {(() => {
                      const seats = [0, 1, 2, 3].filter((s) => block.notileTenpai![s]);
                      if (seats.length === 0) return t('paipuDetail.none');
                      return seats.map((s, i) => {
                        const r = block.scoreRows[s];
                        return (
                          <Fragment key={s}>
                            {i > 0 ? <span className="shrink-0">{t('paipuDetail.listSeparator')}</span> : null}
                            <span className="inline-flex items-center gap-1">
                              <span>{roundWindLabel(t, r.roundWindIndex)}</span>
                              <PaipuPlayerCell nickname={r.nickname} avatarUrl={r.avatar} />
                            </span>
                          </Fragment>
                        );
                      });
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-0 gap-y-1">
                    <span className="font-medium shrink-0">{t('paipuDetail.notenColon')}</span>
                    {(() => {
                      const seats = [0, 1, 2, 3].filter((s) => !block.notileTenpai![s]);
                      if (seats.length === 0) return t('paipuDetail.none');
                      return seats.map((s, i) => {
                        const r = block.scoreRows[s];
                        return (
                          <Fragment key={s}>
                            {i > 0 ? <span className="shrink-0">{t('paipuDetail.listSeparator')}</span> : null}
                            <span className="inline-flex items-center gap-1">
                              <span>{roundWindLabel(t, r.roundWindIndex)}</span>
                              <PaipuPlayerCell nickname={r.nickname} avatarUrl={r.avatar} />
                            </span>
                          </Fragment>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {block.scoreRows.length > 0 && (
                <div style={TABLE_WRAP}>
                  <table className="w-full border-collapse text-[13px] leading-snug">
                    <thead>
                      <tr style={TABLE_HEAD}>
                        <th style={{ ...TABLE_TH, width: '3.25rem' }}>{t('paipuDetail.colSeat')}</th>
                        <th style={{ ...TABLE_TH, width: '4.5rem' }}>{t('paipuDetail.colRoundWind')}</th>
                        <th style={{ ...TABLE_TH, minWidth: '5rem' }}>{t('paipuDetail.colPlayer')}</th>
                        <th style={{ ...TABLE_TH, width: '2.75rem', textAlign: 'center' }}>{t('paipuDetail.colRiichi')}</th>
                        <th style={{ ...TABLE_TH, textAlign: 'right', width: '4rem', whiteSpace: 'nowrap' }}>
                          {t('paipuDetail.colRiichiDeposit')}
                        </th>
                        <th style={{ ...TABLE_TH, textAlign: 'right', width: '4.25rem', whiteSpace: 'nowrap' }}>
                          {t('paipuDetail.colStickHonba')}
                        </th>
                        <th style={{ ...TABLE_TH, textAlign: 'right', width: '5rem' }}>{t('paipuDetail.colDelta')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.scoreRows.map((row, ri) => (
                        <tr
                          key={row.seat}
                          className="transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-primary-light)_35%,transparent)]"
                          style={rowBg(ri)}
                        >
                          <td className="py-2.5 pl-3 pr-2 align-middle">
                            <span
                              className="inline-flex min-w-[1.625rem] items-center justify-center rounded-full text-xs font-bold tabular-nums"
                              style={{
                                background: 'linear-gradient(145deg, #fff 0%, var(--color-primary-light) 100%)',
                                color: 'var(--color-primary-dark)',
                                border: '1px solid rgba(212, 132, 168, 0.35)',
                                padding: '0.2rem 0.45rem',
                                boxShadow: '0 1px 2px rgba(180, 120, 150, 0.12)',
                              }}
                            >
                              {displayPaipuSeat(row.seat)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-2 align-middle">
                            <span
                              className="inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold"
                              style={{
                                background: 'rgba(168, 216, 234, 0.35)',
                                color: '#3d7a92',
                                border: '1px solid rgba(126, 200, 227, 0.35)',
                              }}
                            >
                              {roundWindLabel(t, row.roundWindIndex)}
                            </span>
                          </td>
                          <td
                            className="py-2.5 pr-2 align-middle font-medium"
                            style={{ color: 'var(--color-text)', maxWidth: '14rem' }}
                          >
                            <PaipuPlayerCell nickname={row.nickname} avatarUrl={row.avatar} />
                          </td>
                          <td className="py-2.5 px-1 align-middle text-center">
                            <span
                              className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                              style={{
                                background: row.wasRiichi ? 'rgba(46, 125, 50, 0.14)' : 'rgba(138, 138, 138, 0.1)',
                                color: row.wasRiichi ? '#2e7d32' : 'var(--color-text-light)',
                              }}
                            >
                              {row.wasRiichi ? t('paipuDetail.riichiYes') : t('paipuDetail.riichiNo')}
                            </span>
                          </td>
                          <td className="py-2.5 pr-1 text-right align-middle font-mono text-[12px]">
                            <span
                              className="inline-block min-w-[2.75rem] text-right"
                              style={deltaCellStyle(row.riichiDeposit === 0 ? null : row.riichiDeposit)}
                            >
                              {row.riichiDeposit === 0
                                ? '—'
                                : row.riichiDeposit > 0
                                  ? `+${row.riichiDeposit}`
                                  : String(row.riichiDeposit)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-2 text-right align-middle font-mono text-[12px]">
                            <span
                              className="inline-block min-w-[3.25rem] text-right"
                              style={deltaCellStyle(row.stickHonbaDelta)}
                            >
                              {row.stickHonbaDelta == null
                                ? '—'
                                : row.stickHonbaDelta > 0
                                  ? `+${row.stickHonbaDelta}`
                                  : String(row.stickHonbaDelta)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right align-middle font-mono text-[13px]">
                            <span className="inline-block min-w-[3.5rem] text-right" style={deltaCellStyle(row.delta)}>
                              {row.delta == null ? '—' : row.delta > 0 ? `+${row.delta}` : String(row.delta)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {block.hules.length > 0 && (
                <ul className="mt-2 text-xs space-y-1 list-disc pl-4" style={{ color: 'var(--color-text)' }}>
                  {block.hules.map((h, idx) => (
                    <li key={`${block.id}-h-${idx}`} className="[&::marker]:text-[var(--color-text-light)]">
                      <span className="font-medium">{t('paipuDetail.huleWho')}</span>
                      <span className="inline-flex items-center gap-1 align-middle">
                        <span>{roundWindLabel(t, h.roundWindIndex)}</span>
                        <PaipuPlayerCell nickname={h.nickname} avatarUrl={h.avatar} />
                      </span>
                      {' — '}
                      {h.zimo ? t('paipuDetail.zimo') : t('paipuDetail.ron')}
                      {' · '}
                      {t('paipuDetail.points')}: {h.points}
                      {h.fanSummary ? `（${h.fanSummary}）` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
