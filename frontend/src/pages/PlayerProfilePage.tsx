import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPlayer, getPlayerGames } from '@/api/players';
import { getPlayerStats } from '@/api/games';
import { getPlayerYakumans } from '@/api/players';
import { getPlayerRanking, getPlayerGameRankingResults } from '@/api/ranking';
import { useToast } from '@/hooks/useToast';
import type { Player, Game, PlayerStats, PlayerStatsRecentPoint, HandRecord, PlayerRankingScore as PlayerRankingType } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, PLAYER_COUNT_LABELS, GAME_MODE_FULL_LABELS } from '@/types';
import { ArrowLeft, Sparkles } from 'lucide-react';
import YakumanCard from '@/components/YakumanCard';
import PlayerStatsLineChart from '@/components/PlayerStatsLineChart';
import RankTierBadge from '@/components/RankTierBadge';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

function ScoreTag({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const tone = score > 0 ? 'score-tag-positive' : score < 0 ? 'score-tag-negative' : 'score-tag-zero';
  return <span className={`score-tag ${tone}`}>{score}</span>;
}

const GAME_TABS = [
  { player_count: 4, game_mode: 'east_wind', i18nKey: 'playerProfile.yonmaEastWind' },
  { player_count: 4, game_mode: 'half_match', i18nKey: 'playerProfile.yonmaHalfMatch' },
  { player_count: 3, game_mode: 'east_wind', i18nKey: 'playerProfile.sanmaEastWind' },
  { player_count: 3, game_mode: 'half_match', i18nKey: 'playerProfile.sanmaHalfMatch' },
];

const RANK_RATE_ORDER = ['1位率', '2位率', '3位率', '4位率'] as const;
const RANK_RATE_I18N_KEYS: Record<string, string> = {
  '1位率': 'playerProfile.rank1stRate',
  '2位率': 'playerProfile.rank2ndRate',
  '3位率': 'playerProfile.rank3rdRate',
  '4位率': 'playerProfile.rank4thRate',
};

const RECENT_LIMIT_OPTIONS = [10, 20, 50, 100] as const;

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [yakumans, setYakumans] = useState<HandRecord[]>([]);
  const [ranking, setRanking] = useState<PlayerRankingType | null>(null);
  const [gameRankingResults, setGameRankingResults] = useState<Record<string, {
    rank: number; delta: number; old_tier_name: string; new_tier_name: string; old_score: number; new_score: number;
  }>>({});
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
    getPlayer(id).then(setPlayer).catch(() => showToast(t('playerProfile.loadPlayerFailed')));
    getPlayerGames(id).then(setGames).catch(() => showToast(t('playerProfile.loadGamesFailed')));
    getPlayerYakumans(id).then(setYakumans).catch(() => setYakumans([]));
    getPlayerRanking(id).then(setRanking).catch(() => setRanking(null));
    getPlayerGameRankingResults(id).then(setGameRankingResults).catch(() => setGameRankingResults({}));
  }, [id, showToast, t]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadPlayerAvatarsForList([id]).then((map) => {
      if (!cancelled) setPlayerAvatars(map);
    });
    return () => { cancelled = true; };
  }, [id]);

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
    return <div className="card text-center py-8" style={{ color: 'var(--color-text-light)' }}>{t('common.loading')}</div>;
  }

  const filteredGames = games.filter((g) => {
    if (filterPlayerCount && g.player_count !== parseInt(filterPlayerCount)) return false;
    if (filterGameMode && g.game_mode !== filterGameMode) return false;
    return true;
  });

  const activeTabLabel = filterPlayerCount && filterGameMode
    ? `${PLAYER_COUNT_LABELS[parseInt(filterPlayerCount)]}${GAME_MODE_FULL_LABELS[filterGameMode] || GAME_MODE_LABELS[filterGameMode]}`
    : t('playerProfile.filterAll');

  const activeSourceLabel =
    filterGameType === 'offline' ? t('gameType.offline') : filterGameType === 'online' ? t('gameType.online') : '';

  const currentTab = GAME_TABS.find(
    (tabItem) => tabItem.player_count === parseInt(filterPlayerCount || '0') && tabItem.game_mode === filterGameMode
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
        <ArrowLeft size={14} /> {t('playerProfile.backToList')}
      </Link>

      <div className="card mb-6">
        <div className="flex items-center gap-4">
          {(playerAvatars[player.id] || player.avatar) ? (
            <img src={playerAvatars[player.id] || player.avatar} alt={player.nickname} style={{ width: '4rem', height: '4rem', borderRadius: '50%', objectFit: 'cover' }} />
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

      {ranking && ranking.tier && (
        <div
          className="card mb-6 p-4"
          style={{
            background: ranking.tier.bg_gradient
              ? undefined
              : `${ranking.tier.bg_color}08`,
            border: `1.5px solid ${ranking.tier.bg_color}30`,
          }}
        >
          <style>{`
            @keyframes huntianGlow {
              from { filter: brightness(1); }
              to { filter: brightness(1.15); }
            }
          `}</style>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <RankTierBadge tier={ranking.tier} score={ranking.score} size="lg" />
            <div className="text-right">
              <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                {t('playerProfile.rankingScoreLabel')}
              </div>
              <div
                className="text-2xl font-bold"
                style={{
                  color: ranking.score >= 0 ? '#2d9d78' : '#e74c3c',
                }}
              >
                {Math.round(ranking.score * 100) / 100}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                {ranking.game_count} {t('common.unit.round')}
              </div>
            </div>
          </div>
          {ranking.tier.description && (
            <div
              className="mt-2 text-xs"
              style={{ color: 'var(--color-text-light)', fontStyle: 'italic' }}
            >
              {ranking.tier.description}
            </div>
          )}
          {ranking.next_tier && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--color-border)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                  {t('playerProfile.nextTierDistance')} <span className="font-semibold" style={{ color: ranking.next_tier.bg_color }}>{ranking.next_tier.name}</span>
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-light)' }}>
                  {ranking.next_tier.needed} {t('playerProfile.neededPoints')}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: '#f0f0f0' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, ((ranking.next_tier.threshold - ranking.next_tier.needed) / ranking.next_tier.threshold) * 100))}%`,
                    background: `linear-gradient(90deg, ${ranking.tier.bg_color}90, ${ranking.next_tier.bg_color})`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                  {ranking.tier.initial_score}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                  {ranking.next_tier.threshold}
                </span>
              </div>
            </div>
          )}
          {!ranking.next_tier && ranking.tier.level_order >= 15 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--color-border)' }}>
              <div className="text-xs text-center font-semibold" style={{ color: ranking.tier.bg_color }}>
                {t('playerProfile.maxTierReached')}
              </div>
            </div>
          )}
        </div>
      )}

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
          {t('playerProfile.tabStats')}
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
          {t('playerProfile.tabGames')}
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
          {t('playerProfile.tabInfo')}
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
          <Sparkles size={14} /> {t('playerProfile.tabYakumans')}
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
            {t('playerProfile.filterAll')}
          </button>
          {GAME_TABS.map((tabItem) => (
            <button
              key={tabItem.i18nKey}
              className="btn btn-sm"
              style={{
                background: currentTab?.i18nKey === tabItem.i18nKey ? 'var(--color-accent)' : 'transparent',
                color: currentTab?.i18nKey === tabItem.i18nKey ? '#4a4a4a' : 'var(--color-text-light)',
                border: currentTab?.i18nKey === tabItem.i18nKey ? '1px solid var(--color-accent-dark)' : '1px solid var(--color-border)',
              }}
              onClick={() => { setFilterPlayerCount(String(tabItem.player_count) as '' | '3' | '4'); setFilterGameMode(tabItem.game_mode as '' | 'east_wind' | 'half_match'); }}
            >
              {t(tabItem.i18nKey)}
            </button>
          ))}
        </div>
      )}

      {tab === 'stats' && (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.gameSource')}</span>
            {(['', 'offline', 'online'] as const).map((gt) => {
              const label = gt === '' ? t('playerProfile.filterAll') : gt === 'offline' ? t('gameType.offline') : t('gameType.online');
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
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.chartRounds')}</span>
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
                  {t('playerProfile.recentN', { n })}
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
                      {activeTabLabel}{activeSourceLabel ? ` · ${activeSourceLabel}` : ''}{t('playerProfile.totalGamesLabel')}
                    </div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold" style={{ color: stats.total_pt >= 0 ? '#2d9d78' : '#e74c3c' }}>
                      {(() => { const v = Math.round(stats.total_pt * 100) / 100; return v > 0 ? `+${v}` : v; })()}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.totalPt')}</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 className="font-bold mb-3" style={{ fontSize: '0.875rem' }}>{t('playerProfile.rankRateTitle')}</h3>
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
                        <div className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{t(RANK_RATE_I18N_KEYS[label])}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {chartSeries.length > 0 && (
                <>
                  <div className="card">
                    <h3 className="font-bold mb-2" style={{ fontSize: '0.875rem' }}>{t('playerProfile.rankLineTitle')}</h3>
                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
                      {t('playerProfile.rankLineHint')}
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
                    <h3 className="font-bold mb-2" style={{ fontSize: '0.875rem' }}>{t('playerProfile.cumPtTitle')}</h3>
                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
                      {t('playerProfile.cumPtHint')}
                    </p>
                    <PlayerStatsLineChart
                      chartKind="cum_pt"
                      chartSeries={chartSeries}
                      filterPlayerCount={filterPlayerCount}
                      maxRankForChart={maxRankForChart}
                      points={cumPtLinePoints}
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.cumPtStart')}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        {t('playerProfile.cumPtEnd')} {chartSeries[chartSeries.length - 1]?.cumulative_pt ?? '-'}pt
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="card">
              <div className="empty-state">
                <p className="text-sm">{t('playerProfile.noDataInCondition')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'games' && (
        <div className="card">
          {filteredGames.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm">{t('playerProfile.noGameRecords')}</p>
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
                          {PLAYER_COUNT_LABELS[game.player_count] || `${game.player_count}`}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge" style={{
                          background: myRank === 1 ? '#fff8e1' : '#f0f0f0',
                          color: myRank === 1 ? '#f0b830' : '#999',
                          fontSize: '0.625rem', padding: '0.125rem 0.5rem',
                        }}>
                          {t('playerProfile.rankN', { n: myRank })}
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
                        {(() => {
                          const rr = gameRankingResults[game.id];
                          if (!rr) return null;
                          const delta = Math.round(rr.delta * 100) / 100;
                          const tierChanged = rr.old_tier_name !== rr.new_tier_name;
                          return (
                            <>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.125rem',
                                padding: '0.125rem 0.5rem', borderRadius: '0.375rem',
                                fontSize: '0.625rem', fontWeight: 700,
                                color: '#6b5ce7',
                                background: '#f0edff',
                                border: '1px solid #d8d0f8',
                              }}>
                                R{delta > 0 ? `+${delta}` : delta}
                              </span>
                              {tierChanged && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.125rem',
                                  padding: '0.125rem 0.5rem', borderRadius: '0.375rem',
                                  fontSize: '0.625rem', fontWeight: 700,
                                  color: '#f0b830',
                                  background: '#fff8e1',
                                  border: '1px solid #fce588',
                                }}>
                                  {rr.old_tier_name} &#x2192; {rr.new_tier_name}
                                </span>
                              )}
                            </>
                          );
                        })()}
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
            <Sparkles size={16} style={{ color: '#e65100' }} /> {t('playerProfile.tabYakumans')}
          </h3>
          {yakumans.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm">{t('playerProfile.noYakumanRecords')}</p>
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
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.nicknameLabel')}</div>
              <div>{player.nickname}</div>
            </div>
            {player.real_name && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.realNameLabel')}</div>
                <div>{player.real_name}</div>
              </div>
            )}
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.createdAtLabel')}</div>
              <div className="text-sm">{player.created_at}</div>
            </div>
            {player.majsoul_accounts && player.majsoul_accounts.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-light)' }}>{t('playerProfile.majsoulAccountLabel')}</div>
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
