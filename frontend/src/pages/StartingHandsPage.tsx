import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getStartingHands,
  getStartingHandPlayerAverages,
  type StartingHandItem,
  type StartingHandListResponse,
  type StartingHandPlayerAverage,
} from '@/api/games';
import { getPlayers } from '@/api/players';
import type { Player } from '@/types';
import { useToast } from '@/hooks/useToast';

const SELECT_STYLE: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.75rem',
  borderRadius: '0.5rem',
  border: '2px solid var(--color-border)',
  background: 'white',
  color: 'var(--color-text)',
  outline: 'none',
  cursor: 'pointer',
};

const MEDAL_COLORS = ['#f0b830', '#a8d8ea', '#e8a0bf'];
const PAGE_SIZE_OPTIONS = [10, 20, 50];

function tileSrc(tile: string): string {
  return `/marjongs/${tile}.webp`;
}

// 起手牌展示顺序：索子 → 万子 → 筒子 → 字牌；同色内 1 2 3 4 0 5 6 7 8 9（红 5 排在 4 后、普通 5 前）；字牌按 1z..7z（东南西北白发中）
const TILE_SUIT_ORDER: Record<string, number> = { s: 0, m: 1, p: 2, z: 3 };
const TILE_RANK_ORDER: Record<string, number> = {
  '1': 0, '2': 1, '3': 2, '4': 3, '0': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

function sortStartingTiles(tiles: string[]): string[] {
  return [...tiles].sort((a, b) => {
    const sa = TILE_SUIT_ORDER[a[1] ?? ''] ?? 99;
    const sb = TILE_SUIT_ORDER[b[1] ?? ''] ?? 99;
    if (sa !== sb) return sa - sb;
    const ra = TILE_RANK_ORDER[a[0] ?? ''] ?? 99;
    const rb = TILE_RANK_ORDER[b[0] ?? ''] ?? 99;
    return ra - rb;
  });
}

function HandTiles({ tiles, doraSet }: { tiles: string[]; doraSet?: Set<string> }) {
  const sorted = useMemo(() => sortStartingTiles(tiles), [tiles]);
  return (
    <div className="flex flex-wrap items-end gap-0.5">
      {sorted.map((t, i) => {
        const isDora = doraSet?.has(t) || (t.startsWith('0') && t.length === 2);
        return (
          <img
            key={`${t}-${i}`}
            src={tileSrc(t)}
            alt={t}
            draggable={false}
            style={{
              height: '1.85rem',
              width: 'auto',
              borderRadius: '0.2rem',
              boxShadow: isDora ? '0 0 0 1.5px #f0b830' : '0 0 0 1px rgba(0,0,0,0.05)',
              background: 'white',
            }}
          />
        );
      })}
    </div>
  );
}

function changLabel(chang: number, t: (k: string) => string): string {
  if (chang === 0) return t('startingHands.changEast');
  if (chang === 1) return t('startingHands.changSouth');
  if (chang === 2) return t('startingHands.changWest');
  return `${chang}`;
}

function doraTileFromIndicator(ind: string): string | null {
  if (!ind || ind.length < 2) return null;
  const r = parseInt(ind[0], 10);
  const suit = ind[1];
  if (Number.isNaN(r)) return null;
  if (suit === 'm' || suit === 'p' || suit === 's') {
    const n = r === 0 ? 5 : r;
    if (n < 1 || n > 9) return null;
    return `${n === 9 ? 1 : n + 1}${suit}`;
  }
  if (suit === 'z') {
    if (r >= 1 && r <= 4) return `${r === 4 ? 1 : r + 1}z`;
    if (r >= 5 && r <= 7) return `${r === 7 ? 5 : r + 1}z`;
  }
  return null;
}

function HandCard({ item, rank, showPlayer }: { item: StartingHandItem; rank: number; showPlayer: boolean }) {
  const { t } = useTranslation();
  const doraSet = useMemo(() => {
    const s = new Set<string>();
    for (const ind of item.dora_indicators) {
      const dt = doraTileFromIndicator(ind);
      if (dt) s.add(dt);
    }
    return s;
  }, [item.dora_indicators]);

  const medalColor = rank <= 3 ? MEDAL_COLORS[rank - 1] : undefined;

  return (
    <div className="card p-3" style={{ background: 'white', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-3 mb-2">
        <div
          className="text-base font-bold"
          style={{ color: medalColor || 'var(--color-text-light)', minWidth: '2rem', textAlign: 'center' }}
        >
          {rank}
        </div>
        {showPlayer && (
          <Link
            to={`/player-list/${item.player.id}`}
            className="flex items-center gap-2 min-w-0"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            {item.player.avatar ? (
              <img src={item.player.avatar} alt={item.player.nickname} className="avatar" style={{ width: '1.75rem', height: '1.75rem' }} />
            ) : (
              <div className="avatar-placeholder" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.75rem' }}>{item.player.nickname.charAt(0)}</div>
            )}
            <span className="font-semibold text-sm truncate">{item.player.nickname}</span>
          </Link>
        )}
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xl font-bold" style={{ color: '#c45cdd' }}>{item.score.toFixed(1)}</div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-light)' }}>{t('startingHands.scoreLabel')}</div>
        </div>
      </div>

      <HandTiles tiles={item.tiles} doraSet={doraSet} />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--color-text-light)' }}>
        <span>
          {changLabel(item.chang, t)} {item.ju + 1} {t('startingHands.kyokuUnit')}
          {item.ben > 0 ? ` · ${item.ben} ${t('startingHands.benUnit')}` : ''}
        </span>
        <span>·</span>
        <span>{item.is_dealer ? t('startingHands.dealer') : `${t('startingHands.seat')} ${item.seat + 1}`}</span>
        <span>·</span>
        <span>
          {t('startingHands.shanten')}: <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{item.breakdown.shanten}</span>
        </span>
        {item.breakdown.dora_count > 0 && (
          <>
            <span>·</span>
            <span>{t('startingHands.dora')}: {item.breakdown.dora_count}</span>
          </>
        )}
        {item.breakdown.red_dora > 0 && (
          <>
            <span>·</span>
            <span style={{ color: '#e74c3c' }}>{t('startingHands.redDora')}: {item.breakdown.red_dora}</span>
          </>
        )}
        {item.dora_indicators.length > 0 && (
          <span className="flex items-center gap-1">
            <span>·</span>
            <span>{t('startingHands.doraIndicator')}:</span>
            {item.dora_indicators.map((d, i) => (
              <img key={`${d}-${i}`} src={tileSrc(d)} alt={d} style={{ height: '1.1rem', width: 'auto', borderRadius: '0.15rem' }} />
            ))}
          </span>
        )}
        <Link
          to={`/games/${item.game_id}`}
          className="ml-auto"
          style={{ color: 'var(--color-primary-dark)', textDecoration: 'none' }}
        >
          {t('startingHands.viewGame')} →
        </Link>
      </div>

      {item.breakdown.yaku_potential && Object.keys(item.breakdown.yaku_potential).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(item.breakdown.yaku_potential)
            .sort((a, b) => b[1] - a[1])
            .map(([key, val]) => {
              const color = YAKU_COLORS[key] || '#7e57c2';
              const label = t(`startingHands.yaku.${key}`, { defaultValue: key });
              return (
                <span
                  key={key}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: color + '1a', color, border: `1px solid ${color}55` }}
                >
                  {label} +{val.toFixed(1)}
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
}

const YAKU_COLORS: Record<string, string> = {
  tanyao: '#27ae60',
  chiitoitsu: '#3498db',
  ittsuu: '#16a085',
  sanshoku_doujun: '#e67e22',
  sanshoku_doukou: '#d35400',
  sanankou: '#8e44ad',
  toitoi: '#9b59b6',
  chinitsu: '#c0392b',
  honitsu: '#e74c3c',
  junchan: '#2980b9',
  chanta: '#1abc9c',
  honroutou: '#7f8c8d',
};

export default function StartingHandsPage() {
  const { t } = useTranslation();
  const { showToast, ToastComponent } = useToast();

  const [tab, setTab] = useState<'overall' | 'personal'>('overall');
  const [playerCount, setPlayerCount] = useState<'' | '3' | '4'>('4');
  const [gameMode, setGameMode] = useState<'' | 'east_wind' | 'half_match'>('half_match');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [overall, setOverall] = useState<StartingHandListResponse | null>(null);

  const [averages, setAverages] = useState<StartingHandPlayerAverage[]>([]);
  const [minHands, setMinHands] = useState(8);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [personal, setPersonal] = useState<StartingHandListResponse | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  useEffect(() => {
    let active = true;
    getPlayers()
      .then((arr) => {
        if (active) setAllPlayers(arr);
      })
      .catch(() => {
        // non-fatal
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (tab !== 'overall') return;
    const params: Parameters<typeof getStartingHands>[0] = {
      tab: 'overall',
      page,
      page_size: pageSize,
    };
    if (playerCount) params.player_count = playerCount;
    if (gameMode) params.game_mode = gameMode;
    let active = true;
    getStartingHands(params)
      .then((data) => {
        if (active) setOverall(data);
      })
      .catch(() => {
        if (active) showToast(t('startingHands.loadFailed'));
      });
    return () => {
      active = false;
    };
  }, [tab, page, pageSize, playerCount, gameMode, showToast, t]);

  useEffect(() => {
    if (tab !== 'personal') return;
    const params: Parameters<typeof getStartingHandPlayerAverages>[0] = { min_hands: minHands };
    if (playerCount) params.player_count = playerCount;
    if (gameMode) params.game_mode = gameMode;
    let active = true;
    getStartingHandPlayerAverages(params)
      .then((rows) => {
        if (!active) return;
        setAverages(rows);
        if (rows.length > 0 && !rows.some((r) => r.player.id === selectedPlayerId)) {
          setSelectedPlayerId(rows[0].player.id);
        }
      })
      .catch(() => {
        if (active) showToast(t('startingHands.loadFailed'));
      });
    return () => {
      active = false;
    };
  }, [tab, playerCount, gameMode, minHands, selectedPlayerId, showToast, t]);

  useEffect(() => {
    if (tab !== 'personal' || !selectedPlayerId) return;
    const params: Parameters<typeof getStartingHands>[0] = {
      tab: 'personal',
      player_id: selectedPlayerId,
      page,
      page_size: pageSize,
    };
    if (playerCount) params.player_count = playerCount;
    if (gameMode) params.game_mode = gameMode;
    let active = true;
    getStartingHands(params)
      .then((data) => {
        if (active) setPersonal(data);
      })
      .catch(() => {
        if (active) showToast(t('startingHands.loadFailed'));
      });
    return () => {
      active = false;
    };
  }, [tab, selectedPlayerId, page, pageSize, playerCount, gameMode, showToast, t]);

  const setTabReset = (next: 'overall' | 'personal') => {
    setTab(next);
    setPage(1);
  };

  const renderPagination = (count: number) => {
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    return (
      <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
        <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
          {t('startingHands.totalHands', { count })} · {t('startingHands.pageOf', { page, total: totalPages })}
        </div>
        <div className="flex items-center gap-2">
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={SELECT_STYLE}>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}/{t('startingHands.pageUnit')}</option>
            ))}
          </select>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded-md border"
            style={{ borderColor: 'var(--color-border)', background: 'white', opacity: page <= 1 ? 0.5 : 1 }}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('startingHands.prev')}
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded-md border"
            style={{ borderColor: 'var(--color-border)', background: 'white', opacity: page >= totalPages ? 0.5 : 1 }}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t('startingHands.next')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={22} style={{ color: '#c45cdd' }} />
          <h2 className="text-lg font-bold">{t('startingHands.title')}</h2>
        </div>
        <Link to="/paipu-stats" className="text-xs font-medium" style={{ color: 'var(--color-primary-dark)' }}>
          {t('startingHands.linkPaipuStats')}
        </Link>
      </div>

      <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--color-text-light)' }}>
        {t('startingHands.intro')}
      </p>

      <div className="flex gap-2 mb-4">
        {([
          { v: 'overall' as const, label: t('startingHands.tabOverall') },
          { v: 'personal' as const, label: t('startingHands.tabPersonal') },
        ]).map(({ v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => setTabReset(v)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all"
            style={{
              background: tab === v ? '#fdf2ff' : 'white',
              color: tab === v ? '#9b3aae' : 'var(--color-text-light)',
              border: tab === v ? '2px solid #c45cdd' : '2px solid var(--color-border)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select value={playerCount} onChange={(e) => { setPlayerCount(e.target.value as '' | '3' | '4'); setPage(1); }} style={SELECT_STYLE}>
          <option value="">{t('startingHands.allPlayerCount')}</option>
          <option value="4">{t('playerCount.yonma')}</option>
          <option value="3">{t('playerCount.sanma')}</option>
        </select>
        <select value={gameMode} onChange={(e) => { setGameMode(e.target.value as '' | 'east_wind' | 'half_match'); setPage(1); }} style={SELECT_STYLE}>
          <option value="">{t('startingHands.allMode')}</option>
          <option value="east_wind">{t('gameMode.eastWind')}</option>
          <option value="half_match">{t('gameMode.halfMatch')}</option>
        </select>
        {tab === 'personal' && (
          <select value={minHands} onChange={(e) => setMinHands(Number(e.target.value))} style={SELECT_STYLE}>
            <option value="1">{t('startingHands.minHandsPrefix')}1{t('startingHands.minHandsUnit')}</option>
            <option value="4">{t('startingHands.minHandsPrefix')}4{t('startingHands.minHandsUnit')}</option>
            <option value="8">{t('startingHands.minHandsPrefix')}8{t('startingHands.minHandsUnit')}</option>
            <option value="16">{t('startingHands.minHandsPrefix')}16{t('startingHands.minHandsUnit')}</option>
            <option value="32">{t('startingHands.minHandsPrefix')}32{t('startingHands.minHandsUnit')}</option>
          </select>
        )}
      </div>

      {tab === 'overall' ? (
        <div>
          {!overall ? (
            <div className="empty-state card"><p className="text-sm">{t('common.loading')}</p></div>
          ) : overall.results.length === 0 ? (
            <div className="empty-state card"><p className="text-sm">{t('startingHands.noData')}</p></div>
          ) : (
            <>
              <div className="space-y-2">
                {overall.results.map((item, idx) => (
                  <HandCard
                    key={`${item.game_id}-${item.chang}-${item.ju}-${item.ben}-${item.seat}`}
                    item={item}
                    rank={(page - 1) * pageSize + idx + 1}
                    showPlayer
                  />
                ))}
              </div>
              {renderPagination(overall.count)}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="card p-3"
            style={{ background: '#fdf2ff', border: '1px solid #efc9f0' }}
          >
            <div className="text-xs font-semibold mb-2" style={{ color: '#9b3aae' }}>
              {t('startingHands.avgRankingTitle')}
            </div>
            {averages.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t('startingHands.noData')}</p>
            ) : (
              <div className="space-y-1.5">
                {averages.map((row, idx) => {
                  const active = row.player.id === selectedPlayerId;
                  return (
                    <button
                      key={row.player.id}
                      type="button"
                      onClick={() => { setSelectedPlayerId(row.player.id); setPage(1); }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg text-left transition-all"
                      style={{
                        background: active ? 'white' : 'transparent',
                        border: active ? '2px solid #c45cdd' : '2px solid transparent',
                      }}
                    >
                      <div className="text-sm font-bold" style={{ color: idx < 3 ? MEDAL_COLORS[idx] : 'var(--color-text-light)', minWidth: '1.5rem', textAlign: 'center' }}>
                        {idx + 1}
                      </div>
                      {row.player.avatar ? (
                        <img src={row.player.avatar} alt={row.player.nickname} className="avatar" style={{ width: '1.75rem', height: '1.75rem' }} />
                      ) : (
                        <div className="avatar-placeholder" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.75rem' }}>{row.player.nickname.charAt(0)}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{row.player.nickname}</div>
                        <div className="text-[11px]" style={{ color: 'var(--color-text-light)' }}>
                          {t('startingHands.handsCount', { count: row.total_hands })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold" style={{ color: '#c45cdd' }}>{row.average_score.toFixed(2)}</div>
                        <div className="text-[10px]" style={{ color: 'var(--color-text-light)' }}>{t('startingHands.avgScore')}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {averages.length === 0 && allPlayers.length > 0 && (
              <div className="mt-2">
                <select
                  value={selectedPlayerId}
                  onChange={(e) => { setSelectedPlayerId(e.target.value); setPage(1); }}
                  style={SELECT_STYLE}
                >
                  <option value="">{t('startingHands.selectPlayer')}</option>
                  {allPlayers.map((p) => (
                    <option key={p.id} value={p.id}>{p.nickname}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {personal?.summary && (
            <div
              className="card p-3 flex flex-wrap items-center gap-4 text-xs"
              style={{ background: 'white', border: '1px solid var(--color-border)' }}
            >
              <span>
                {t('startingHands.summaryAvg')}:{' '}
                <span className="font-bold text-base" style={{ color: '#c45cdd' }}>{personal.summary.average_score.toFixed(2)}</span>
              </span>
              <span>·</span>
              <span>
                {t('startingHands.summaryTotal')}:{' '}
                <span className="font-bold text-sm">{personal.summary.total_hands}</span>
              </span>
              <span>·</span>
              <span>
                {t('startingHands.summaryMax')}:{' '}
                <span className="font-bold text-sm" style={{ color: '#27ae60' }}>{personal.summary.max_score.toFixed(1)}</span>
              </span>
              <span>·</span>
              <span>
                {t('startingHands.summaryMin')}:{' '}
                <span className="font-bold text-sm" style={{ color: '#e74c3c' }}>{personal.summary.min_score.toFixed(1)}</span>
              </span>
            </div>
          )}

          {!personal ? (
            <div className="empty-state card"><p className="text-sm">{selectedPlayerId ? t('common.loading') : t('startingHands.selectPlayer')}</p></div>
          ) : personal.results.length === 0 ? (
            <div className="empty-state card"><p className="text-sm">{t('startingHands.noData')}</p></div>
          ) : (
            <>
              <div className="space-y-2">
                {personal.results.map((item, idx) => (
                  <HandCard
                    key={`${item.game_id}-${item.chang}-${item.ju}-${item.ben}-${item.seat}`}
                    item={item}
                    rank={(page - 1) * pageSize + idx + 1}
                    showPlayer={false}
                  />
                ))}
              </div>
              {renderPagination(personal.count)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
