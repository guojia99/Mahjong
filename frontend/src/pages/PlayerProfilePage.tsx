import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPlayer, getPlayerGames } from '@/api/players';
import { getPlayerStats } from '@/api/games';
import { getPlayerYakumans } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import type { Player, Game, PlayerStats, PlayerStatsRecentPoint, HandRecord } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, PLAYER_COUNT_LABELS, GAME_MODE_FULL_LABELS } from '@/types';
import { ArrowLeft, Sparkles } from 'lucide-react';
import YakumanCard from '@/components/YakumanCard';
import PlayerStatsLineChart from '@/components/PlayerStatsLineChart';

function ScoreTag({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const tone = score > 0 ? 'score-tag-positive' : score < 0 ? 'score-tag-negative' : 'score-tag-zero';
  return <span className={`score-tag ${tone}`}>{score}</span>;
}

const GAME_TABS = [
  { player_count: 4, game_mode: 'east_wind', label: '四麻东风' },
  { player_count: 4, game_mode: 'half_match', label: '四麻半庄' },
  { player_count: 3, game_mode: 'east_wind', label: '三麻东风' },
  { player_count: 3, game_mode: 'half_match', label: '三麻半庄' },
];

const RANK_RATE_ORDER = ['1位率', '2位率', '3位率', '4位率'] as const;

const RECENT_LIMIT_OPTIONS = [10, 20, 50, 100] as const;

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [yakumans, setYakumans] = useState<HandRecord[]>([]);
  const [tab, setTab] = useState<'stats' | 'games' | 'yakumans' | 'info'>('stats');
  const [filterPlayerCount, setFilterPlayerCount] = useState<'' | '3' | '4'>('4');
  const [filterGameMode, setFilterGameMode] = useState<'' | 'east_wind' | 'half_match'>('half_match');
  const [filterGameType, setFilterGameType] = useState<'' | 'offline' | 'online'>('');
  const [recentLimit, setRecentLimit] = useState<(typeof RECENT_LIMIT_OPTIONS)[number]>(50);
  const { showToast, ToastComponent } = useToast();

  const loadStats = useCallback(
    (pc?: string, gm?: string, gt?: string, rl?: number) => {
      if (!id) return;
      const params: Record<string, string | number> = {};
      if (pc) params.player_count = pc;
      if (gm) params.game_mode = gm;
      if (gt) params.game_type = gt;
      params.recent_limit = rl ?? recentLimit;
      getPlayerStats(id, params).then(setStats).catch(() => setStats(null));
    },
    [id, recentLimit],
  );

  useEffect(() => {
    if (!id) return;
    getPlayer(id).then(setPlayer).catch(() => showToast('加载雀士失败'));
    getPlayerGames(id).then(setGames).catch(() => showToast('加载对局失败'));
    getPlayerYakumans(id).then(setYakumans).catch(() => setYakumans([]));
  }, [id, showToast]);

  useEffect(() => {
    loadStats(filterPlayerCount || undefined, filterGameMode || undefined, filterGameType, recentLimit);
  }, [filterPlayerCount, filterGameMode, filterGameType, recentLimit, loadStats]);

  const chartSeries: PlayerStatsRecentPoint[] = useMemo(() => {
    const enrich = (r: PlayerStatsRecentPoint): PlayerStatsRecentPoint => {
      const g = games.find((x) => x.id === r.game_id);
      if (!g) return r;
      return {
        ...r,
        player_count: r.player_count ?? g.player_count,
        game_mode: r.game_mode ?? g.game_mode,
        game_type: r.game_type ?? g.game_type,
      };
    };
    if (stats?.recent_series?.length) {
      return stats.recent_series.map(enrich);
    }
    if (stats?.recent_ranking?.length) {
      const chrono = [...stats.recent_ranking].reverse();
      return chrono.map((r, idx, arr) => {
        let cum = 0;
        for (let j = 0; j <= idx; j += 1) cum += arr[j].pt;
        return enrich({ ...r, game_index: idx, cumulative_pt: Math.round(cum * 100) / 100 });
      });
    }
    return [];
  }, [stats, games]);

  if (!player) {
    return <div className="card text-center py-8" style={{ color: 'var(--color-text-light)' }}>加载中...</div>;
  }

  const filteredGames = games.filter((g) => {
    if (filterPlayerCount && g.player_count !== parseInt(filterPlayerCount)) return false;
    if (filterGameMode && g.game_mode !== filterGameMode) return false;
    return true;
  });

  const activeTabLabel = filterPlayerCount && filterGameMode
    ? `${PLAYER_COUNT_LABELS[parseInt(filterPlayerCount)]}${GAME_MODE_FULL_LABELS[filterGameMode] || GAME_MODE_LABELS[filterGameMode]}`
    : '全部';

  const activeSourceLabel =
    filterGameType === 'offline' ? '线下' : filterGameType === 'online' ? '线上' : '';

  const currentTab = GAME_TABS.find(
    (t) => t.player_count === parseInt(filterPlayerCount || '0') && t.game_mode === filterGameMode
  );

  const maxRankForChart =
    filterPlayerCount === '3'
      ? 3
      : filterPlayerCount === '4'
        ? 4
        : chartSeries.length === 0
          ? 4
          : Math.min(4, Math.max(3, ...chartSeries.map((s) => s.rank)));

  const rankLinePoints =
    chartSeries.length === 0
      ? []
      : chartSeries.length === 1
        ? [
            { x: 0, y: maxRankForChart + 1 - chartSeries[0].rank },
            { x: 1, y: maxRankForChart + 1 - chartSeries[0].rank },
          ]
        : chartSeries.map((s) => ({
            x: s.game_index ?? 0,
            y: maxRankForChart + 1 - s.rank,
          }));

  const cumPtLinePoints =
    chartSeries.length === 0
      ? []
      : [
          { x: 0, y: 0 },
          ...chartSeries.map((s) => ({
            x: (s.game_index ?? 0) + 1,
            y: s.cumulative_pt ?? 0,
          })),
        ];

  return (
    <div>
      {ToastComponent}
      <Link to="/player-list" className="btn btn-sm btn-outline mb-4 inline-flex">
        <ArrowLeft size={14} /> 返回列表
      </Link>

      <div className="card mb-6">
        <div className="flex items-center gap-4">
          {player.avatar ? (
            <img src={player.avatar} alt={player.nickname} style={{ width: '4rem', height: '4rem', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div className="avatar-placeholder" style={{ width: '4rem', height: '4rem', fontSize: '1.5rem' }}>
              {player.nickname.charAt(0)}
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold">{player.nickname}</h2>
            {player.real_name && (
              <div className="text-sm" style={{ color: 'var(--color-text-light)' }}>{player.real_name}</div>
            )}
            {player.majsoul_accounts && player.majsoul_accounts.length > 0 && (
              <div className="flex gap-2 mt-1">
                {player.majsoul_accounts.map((acc) => (
                  <span key={acc.id} className="badge badge-online" style={{ fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
                    UID:{acc.uid}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          className="btn btn-sm"
          style={{
            background: tab === 'stats' ? 'var(--color-primary-light)' : 'transparent',
            color: tab === 'stats' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
            border: tab === 'stats' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('stats')}
        >
          统计数据
        </button>
        <button
          className="btn btn-sm"
          style={{
            background: tab === 'games' ? 'var(--color-primary-light)' : 'transparent',
            color: tab === 'games' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
            border: tab === 'games' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('games')}
        >
          对局记录
        </button>
        <button
          className="btn btn-sm"
          style={{
            background: tab === 'info' ? 'var(--color-primary-light)' : 'transparent',
            color: tab === 'info' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
            border: tab === 'info' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('info')}
        >
          个人信息
        </button>
        <button
          className="btn btn-sm"
          style={{
            background: tab === 'yakumans' ? '#fff3e0' : 'transparent',
            color: tab === 'yakumans' ? '#e65100' : 'var(--color-text-light)',
            border: tab === 'yakumans' ? '1px solid #e65100' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('yakumans')}
        >
          <Sparkles size={14} /> 役满列表
        </button>
      </div>

      {(tab === 'stats' || tab === 'games') && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            className="btn btn-sm"
            style={{
              background: !filterPlayerCount && !filterGameMode ? 'var(--color-accent)' : 'transparent',
              color: !filterPlayerCount && !filterGameMode ? '#4a4a4a' : 'var(--color-text-light)',
              border: !filterPlayerCount && !filterGameMode ? '1px solid var(--color-accent-dark)' : '1px solid var(--color-border)',
            }}
            onClick={() => { setFilterPlayerCount(''); setFilterGameMode(''); }}
          >
            全部
          </button>
          {GAME_TABS.map((t) => (
            <button
              key={t.label}
              className="btn btn-sm"
              style={{
                background: currentTab?.label === t.label ? 'var(--color-accent)' : 'transparent',
                color: currentTab?.label === t.label ? '#4a4a4a' : 'var(--color-text-light)',
                border: currentTab?.label === t.label ? '1px solid var(--color-accent-dark)' : '1px solid var(--color-border)',
              }}
              onClick={() => { setFilterPlayerCount(String(t.player_count) as '' | '3' | '4'); setFilterGameMode(t.game_mode as '' | 'east_wind' | 'half_match'); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'stats' && (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>对局来源</span>
            {(['', 'offline', 'online'] as const).map((gt) => {
              const label = gt === '' ? '全部' : gt === 'offline' ? '线下' : '线上';
              const active = filterGameType === gt;
              return (
                <button
                  key={gt || 'all'}
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? '#4a4a4a' : 'var(--color-text-light)',
                    border: active ? '1px solid var(--color-accent-dark)' : '1px solid var(--color-border)',
                  }}
                  onClick={() => setFilterGameType(gt)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>曲线局数</span>
            {RECENT_LIMIT_OPTIONS.map((n) => {
              const active = recentLimit === n;
              return (
                <button
                  key={n}
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? '#4a4a4a' : 'var(--color-text-light)',
                    border: active ? '1px solid var(--color-accent-dark)' : '1px solid var(--color-border)',
                  }}
                  onClick={() => setRecentLimit(n)}
                >
                  最近{n}局
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'stats' && (
        <div className="space-y-4">
          {stats ? (
            <>
              <div className="card">
                <div className="flex gap-6 text-center flex-wrap">
                  <div>
                    <div className="text-3xl font-bold">{stats.total_games}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                      {activeTabLabel}{activeSourceLabel ? ` · ${activeSourceLabel}` : ''}总对局
                    </div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold" style={{ color: stats.total_pt >= 0 ? '#2d9d78' : '#e74c3c' }}>
                      {(() => { const v = Math.round(stats.total_pt * 100) / 100; return v > 0 ? `+${v}` : v; })()}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>总PT</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 className="font-bold mb-3" style={{ fontSize: '0.875rem' }}>位率</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {RANK_RATE_ORDER.map((label) => {
                    const rate = stats.rank_distribution[label];
                    if (rate === undefined) return null;
                    const colors: Record<string, string> = {
                      '1位率': '#f0b830',
                      '2位率': '#a8d8ea',
                      '3位率': '#e8a0bf',
                      '4位率': '#b8a9c9',
                    };
                    return (
                      <div key={label} className="text-center p-3 rounded-xl" style={{ background: `${colors[label] || '#f0f0f0'}15` }}>
                        <div className="text-2xl font-bold" style={{ color: colors[label] || '#999' }}>{rate}%</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {chartSeries.length > 0 && (
                <>
                  <div className="card">
                    <h3 className="font-bold mb-2" style={{ fontSize: '0.875rem' }}>最近对局排名折线</h3>
                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
                      纵轴为顺位（靠上为高位）；横轴为时间正序的局序号。悬停查看每局得点、PT、三麻/四麻、场别与来源。
                    </p>
                    <PlayerStatsLineChart
                      chartKind="rank"
                      chartSeries={chartSeries}
                      filterPlayerCount={filterPlayerCount}
                      maxRankForChart={maxRankForChart}
                      points={rankLinePoints}
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        {chartSeries[0]?.start_time || ''}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        {chartSeries[chartSeries.length - 1]?.start_time || ''}
                      </span>
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="font-bold mb-2" style={{ fontSize: '0.875rem' }}>PT 累计曲线</h3>
                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
                      从第 0 局 0pt 起按时间顺序累加所选「最近 N 局」的 PT。悬停查看每局及累计详情（含三麻/四麻区分）。
                    </p>
                    <PlayerStatsLineChart
                      chartKind="cum_pt"
                      chartSeries={chartSeries}
                      filterPlayerCount={filterPlayerCount}
                      maxRankForChart={maxRankForChart}
                      points={cumPtLinePoints}
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>起点 0pt</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        末局累计 {chartSeries[chartSeries.length - 1]?.cumulative_pt ?? '-'}pt
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="card">
              <div className="empty-state">
                <p className="text-sm">该条件下暂无数据</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'games' && (
        <div className="card">
          {filteredGames.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm">暂无对局记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGames.map((game) => {
                const myGp = game.players.find((p) => p.player.id === id);
                const ranked = [...game.players].sort((a, b) => (b.score || 0) - (a.score || 0));
                const myRank = ranked.findIndex((p) => p.player.id === id) + 1;
                const myPt = game.pt?.[id || ''] || 0;
                return (
                  <div key={game.id} className="p-3 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'white' }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`badge ${game.player_count === 3 ? 'badge-sanma' : 'badge-yonma'}`}>
                          {PLAYER_COUNT_LABELS[game.player_count] || `${game.player_count}麻`}
                        </span>
                        <span className="badge badge-mode">{GAME_MODE_LABELS[game.game_mode]}</span>
                        <span className={`badge badge-${game.game_type}`}>{GAME_TYPE_LABELS[game.game_type]}</span>
                        <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{game.start_time}</span>
                        {game.room && (
                          <Link to={`/rooms/${game.room.id}/games/${game.id}`} className="text-xs" style={{ color: 'var(--color-secondary-dark)', textDecoration: 'none' }}>
                            {game.room.name}
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge" style={{
                          background: myRank === 1 ? '#fff8e1' : '#f0f0f0',
                          color: myRank === 1 ? '#f0b830' : '#999',
                          fontSize: '0.625rem', padding: '0.125rem 0.5rem',
                        }}>
                          第{myRank}名
                        </span>
                        <ScoreTag score={myGp?.score || null} />
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '0.125rem 0.5rem', borderRadius: '0.375rem',
                          fontSize: '0.75rem', fontWeight: 700,
                          color: myPt > 0 ? '#2d9d78' : myPt < 0 ? '#e74c3c' : '#999',
                          background: myPt > 0 ? '#e8f8f0' : myPt < 0 ? '#fde8e8' : '#f0f0f0',
                        }}>
                          {(() => { const v = Math.round(myPt * 100) / 100; return v > 0 ? `+${v}` : v; })()}pt
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--color-text-light)' }}>
                      {ranked.map((gp, idx) => (
                        <span key={gp.player.id} style={{ fontWeight: gp.player.id === id ? 700 : 400, color: gp.player.id === id ? 'inherit' : undefined }}>
                          {idx + 1}. {gp.player.nickname}
                          <span style={{ marginLeft: '0.25rem', color: (gp.score || 0) > 0 ? '#2d9d78' : (gp.score || 0) < 0 ? '#e74c3c' : undefined }}>
                            {gp.score !== null && gp.score !== undefined && (gp.score < 0 ? gp.score : gp.score)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'yakumans' && (
        <div className="card">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Sparkles size={16} style={{ color: '#e65100' }} /> 役满列表
          </h3>
          {yakumans.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm">暂无役满记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {yakumans.map((yr) => (
                <YakumanCard key={yr.id} record={yr} showPlayer={false} showLink />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'info' && (
        <div className="card">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>昵称</div>
              <div>{player.nickname}</div>
            </div>
            {player.real_name && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>真实姓名</div>
                <div>{player.real_name}</div>
              </div>
            )}
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>注册时间</div>
              <div className="text-sm">{player.created_at}</div>
            </div>
            {player.majsoul_accounts && player.majsoul_accounts.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>雀魂账号</div>
                {player.majsoul_accounts.map((acc) => (
                  <div key={acc.id} className="text-sm">
                    {acc.nickname} (UID: {acc.uid})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
