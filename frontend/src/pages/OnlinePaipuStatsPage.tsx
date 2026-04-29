import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPaipuStatsRanking } from '@/api/games';
import type { FunRankingItem } from '@/api/games';
import { useToast } from '@/hooks/useToast';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

export type PaipuStatRankType =
  | 'win_rate'
  | 'avg_win_count'
  | 'avg_riichi'
  | 'riichi_rate'
  | 'damaten_rate'
  | 'avg_deal_in'
  | 'deal_in_rate'
  | 'tsumo_rate'
  | 'avg_furo'
  | 'furo_rate'
  | 'avg_win_point'
  | 'avg_minkan_win_point'
  | 'avg_deal_point'
  | 'first_riichi_rate'
  | 'chase_riichi_rate'
  | 'total_minkan'
  | 'avg_minkan'
  | 'minkan_rate'
  | 'total_ankan'
  | 'avg_ankan'
  | 'ankan_rate'
  | 'riichi_win_rate'
  | 'riichi_deal_rate'
  | 'riichi_noten_rate'
  | 'avg_riichi_pt'
  | 'riichi_quality'
  | 'riichi_composite'
  | 'avg_riichi_discard_turn'
  | 'avg_riichi_tsumo_after_turn';

type TabConfig = {
  value: PaipuStatRankType;
  label: string;
  color: string;
  emoji: string;
  format: (v: number) => string;
};

const MEDAL_COLORS = ['#f0b830', '#a8d8ea', '#e8a0bf'];

function subtitleForStat(rankType: PaipuStatRankType, item: FunRankingItem, t: (k: string, o?: Record<string, string | number>) => string): string {
  if (['riichi_rate', 'damaten_rate', 'deal_in_rate', 'win_rate', 'furo_rate', 'minkan_rate', 'ankan_rate', 'first_riichi_rate'].includes(rankType)) {
    return t('paipuStats.subtitleHandsRatio', { count: item.count, total: item.total });
  }
  if (rankType === 'tsumo_rate') {
    return t('paipuStats.subtitleWinsRatio', { count: item.count, total: item.total });
  }
  if (rankType === 'chase_riichi_rate') {
    return t('paipuStats.subtitleChaseRiichi', { count: item.count, total: item.total });
  }
  if (['riichi_win_rate', 'riichi_deal_rate', 'riichi_noten_rate'].includes(rankType)) {
    return t('paipuStats.subtitleRiichiHands', { count: item.count, total: item.total });
  }
  if (rankType === 'riichi_quality') {
    return t('paipuStats.subtitleRiichiQuality', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_riichi_pt') {
    return t('paipuStats.subtitleRiichiPt', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_riichi') {
    return t('paipuStats.subtitleAvgRiichi', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_deal_in') {
    return t('paipuStats.subtitleAvgDealIn', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_furo') {
    return t('paipuStats.subtitleAvgFuro', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_minkan' || rankType === 'total_minkan') {
    return t('paipuStats.subtitleMinkanCount', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_ankan' || rankType === 'total_ankan') {
    return t('paipuStats.subtitleAnkanCount', { count: item.count, total: item.total });
  }
  if (rankType === 'riichi_composite') {
    return t('paipuStats.subtitleRiichiComposite', {
      wins: item.count,
      total: item.total,
      score: item.rate.toFixed(1),
    });
  }
  if (rankType === 'avg_win_count') {
    return t('paipuStats.subtitleAvgWinCount', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_minkan_win_point') {
    return t('paipuStats.subtitleAvgMinkanWinPt', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_win_point') {
    return t('paipuStats.subtitleAvgWinPt', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_deal_point') {
    return t('paipuStats.subtitleAvgDealPt', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_riichi_discard_turn') {
    return t('paipuStats.subtitleAvgRiichiDiscardTurn', { count: item.count, total: item.total });
  }
  if (rankType === 'avg_riichi_tsumo_after_turn') {
    return t('paipuStats.subtitleAvgRiichiTsumoAfter', { count: item.count, total: item.total });
  }
  return `${item.total}`;
}

export default function OnlinePaipuStatsPage() {
  const [rankings, setRankings] = useState<FunRankingItem[]>([]);
  const [rankType, setRankType] = useState<PaipuStatRankType>('win_rate');
  const [playerCount, setPlayerCount] = useState<'' | '3' | '4'>('4');
  const [gameMode, setGameMode] = useState<'' | 'east_wind' | 'half_match'>('half_match');
  const [gameType, setGameType] = useState<'' | 'offline' | 'online'>('');
  const [minGames, setMinGames] = useState('5');
  const { showToast, ToastComponent } = useToast();
  const { t } = useTranslation();

  const tabGroups: { titleKey: string; tabs: TabConfig[] }[] = useMemo(
    () => [
      {
        titleKey: 'paipuStats.groupCore',
        tabs: [
          { value: 'win_rate', label: t('paipuStats.winRate'), color: '#2980b9', emoji: '\uD83C\uDF89', format: v => `${v}%` },
          { value: 'avg_win_count', label: t('paipuStats.avgWinCount'), color: '#1e8449', emoji: '\uD83C\uDFC6', format: v => v.toFixed(2) },
          { value: 'avg_riichi', label: t('paipuStats.avgRiichi'), color: '#c45cdd', emoji: '\uD83C\uDFAF', format: v => v.toFixed(2) },
          { value: 'riichi_rate', label: t('paipuStats.riichiRate'), color: '#9b59b6', emoji: '\uD83D\uDD25', format: v => `${v}%` },
          { value: 'damaten_rate', label: t('paipuStats.damatenRate'), color: '#5dade2', emoji: '\uD83E\uDD10', format: v => `${v}%` },
          { value: 'tsumo_rate', label: t('paipuStats.tsumoRate'), color: '#16a085', emoji: '\u2728', format: v => `${v}%` },
          { value: 'avg_deal_in', label: t('paipuStats.avgDealIn'), color: '#e67e22', emoji: '\uD83D\uDEA8', format: v => v.toFixed(2) },
          { value: 'deal_in_rate', label: t('paipuStats.dealInRate'), color: '#d35400', emoji: '\uD83D\uDD04', format: v => `${v}%` },
        ],
      },
      {
        titleKey: 'paipuStats.groupFuroKan',
        tabs: [
          { value: 'avg_furo', label: t('paipuStats.avgFuro'), color: '#8e44ad', emoji: '\uD83D\uDD0D', format: v => v.toFixed(2) },
          { value: 'furo_rate', label: t('paipuStats.furoRate'), color: '#6c3483', emoji: '\uD83D\uDCD0', format: v => `${v}%` },
          { value: 'total_minkan', label: t('paipuStats.totalMinkan'), color: '#566573', emoji: '\uD83D\uDD28', format: v => String(Math.round(v)) },
          { value: 'avg_minkan', label: t('paipuStats.avgMinkanCount'), color: '#5d6d7e', emoji: '\uD83C\uDFB2', format: v => v.toFixed(2) },
          { value: 'minkan_rate', label: t('paipuStats.minkanRate'), color: '#34495e', emoji: '\u26F0\uFE0F', format: v => `${v}%` },
          { value: 'avg_minkan_win_point', label: t('paipuStats.avgMinkanWinPoint'), color: '#2471a3', emoji: '\uD83D\uDCA1', format: v => v.toFixed(1) },
          { value: 'total_ankan', label: t('paipuStats.totalAnkan'), color: '#7f8c8d', emoji: '\uD83D\uDD12', format: v => String(Math.round(v)) },
          { value: 'avg_ankan', label: t('paipuStats.avgAnkanCount'), color: '#95a5a6', emoji: '\uD83D\uDD10', format: v => v.toFixed(2) },
          { value: 'ankan_rate', label: t('paipuStats.ankanRate'), color: '#2c3e50', emoji: '\uD83C\uDF00', format: v => `${v}%` },
        ],
      },
      {
        titleKey: 'paipuStats.groupPoints',
        tabs: [
          { value: 'avg_win_point', label: t('paipuStats.avgWinPoint'), color: '#27ae60', emoji: '\uD83D\uDCB0', format: v => v.toFixed(1) },
          { value: 'avg_deal_point', label: t('paipuStats.avgDealPoint'), color: '#c0392b', emoji: '\uD83D\uDCB8', format: v => v.toFixed(1) },
        ],
      },
      {
        titleKey: 'paipuStats.groupRiichiTiming',
        tabs: [
          { value: 'first_riichi_rate', label: t('paipuStats.firstRiichiRate'), color: '#1abc9c', emoji: '\u26A1', format: v => `${v}%` },
          { value: 'chase_riichi_rate', label: t('paipuStats.chaseRiichiRate'), color: '#e91e63', emoji: '\uD83D\uDD01', format: v => `${v}%` },
          { value: 'avg_riichi_discard_turn', label: t('paipuStats.avgRiichiDiscardTurn'), color: '#16a085', emoji: '\u23F3', format: v => v.toFixed(2) },
          { value: 'avg_riichi_tsumo_after_turn', label: t('paipuStats.avgRiichiTsumoAfterTurn'), color: '#2ecc71', emoji: '\uD83C\uDF40', format: v => v.toFixed(2) },
        ],
      },
      {
        titleKey: 'paipuStats.groupRiichiQuality',
        tabs: [
          { value: 'riichi_composite', label: t('paipuStats.riichiComposite'), color: '#8e44ad', emoji: '\u2B50', format: v => v.toFixed(1) },
          { value: 'riichi_win_rate', label: t('paipuStats.riichiWinRate'), color: '#2ecc71', emoji: '\u2714\uFE0F', format: v => `${v}%` },
          { value: 'riichi_deal_rate', label: t('paipuStats.riichiDealRate'), color: '#e74c3c', emoji: '\u2716\uFE0F', format: v => `${v}%` },
          { value: 'riichi_noten_rate', label: t('paipuStats.riichiNotenRate'), color: '#95a5a6', emoji: '\uD83D\uDEAB', format: v => `${v}%` },
          { value: 'avg_riichi_pt', label: t('paipuStats.avgRiichiPt'), color: '#3498db', emoji: '\uD83D\uDCCA', format: v => v.toFixed(1) },
          { value: 'riichi_quality', label: t('paipuStats.riichiQuality'), color: '#9b59b6', emoji: '\u2696\uFE0F', format: v => `${v > 0 ? '+' : ''}${v}%` },
        ],
      },
    ],
    [t],
  );

  const flatTabs = useMemo(() => tabGroups.flatMap(g => g.tabs), [tabGroups]);
  const currentTab = flatTabs.find(tab => tab.value === rankType) || tabGroups[0].tabs[0];

  useEffect(() => {
    const params: Record<string, string> = { rank_type: rankType };
    if (playerCount) params.player_count = playerCount;
    if (gameMode) params.game_mode = gameMode;
    if (gameType) params.game_type = gameType;
    if (minGames) params.min_games = minGames;
    getPaipuStatsRanking(params).then(setRankings).catch(() => showToast(t('paipuStats.loadFailed')));
  }, [rankType, playerCount, gameMode, gameType, minGames, showToast, t]);

  const isPercent = [
    'riichi_rate', 'damaten_rate', 'deal_in_rate', 'tsumo_rate', 'win_rate', 'furo_rate', 'minkan_rate', 'ankan_rate',
    'first_riichi_rate', 'chase_riichi_rate', 'riichi_win_rate', 'riichi_deal_rate', 'riichi_noten_rate',
  ].includes(rankType);
  const isAsc = ['riichi_noten_rate'].includes(rankType);
  const rates = rankings.map(r => r.rate);
  const maxVal = rankings.length > 0 ? Math.max(...rates, 0) : 1;
  const minVal = rankings.length > 0 ? Math.min(...rates, 0) : 0;

  const getBarWidth = (rate: number) => {
    if (isPercent) {
      return maxVal > 0 ? (rate / maxVal) * 100 : 0;
    }
    if (rankType === 'riichi_quality') {
      const hi = Math.max(Math.abs(maxVal), Math.abs(minVal), 1);
      return 50 + (rate / (2 * hi)) * 100;
    }
    if (isAsc) {
      const range = maxVal - minVal || 1;
      return ((maxVal - rate) / range) * 100;
    }
    const span = maxVal - minVal || 1;
    return ((rate - minVal) / span) * 100;
  };

  const renderTabButton = (tab: TabConfig) => (
    <button
      key={tab.value}
      type="button"
      onClick={() => setRankType(tab.value)}
      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
      style={{
        background: rankType === tab.value ? tab.color + '22' : 'white',
        color: rankType === tab.value ? tab.color : 'var(--color-text-light)',
        border: rankType === tab.value ? `2px solid ${tab.color}` : '2px solid var(--color-border)',
      }}
    >
      {tab.emoji} {tab.label}
    </button>
  );

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} style={{ color: currentTab.color }} />
          <h2 className="text-lg font-bold">{t('paipuStats.title')}</h2>
        </div>
        <Link to="/fun-ranking" className="text-xs font-medium" style={{ color: 'var(--color-primary-dark)' }}>
          {t('paipuStats.linkFunRanking')}
        </Link>
      </div>

      <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--color-text-light)' }}>
        {t('paipuStats.intro')}
      </p>
      <div
        className="card mb-5 p-3 text-xs leading-relaxed"
        style={{ background: '#f8fafc', border: '1px solid var(--color-border)', color: 'var(--color-text-light)' }}
      >
        <div className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>{t('paipuStats.qualityDesignTitle')}</div>
        {t('paipuStats.qualityDesignBody')}
      </div>

      <div className="mb-4 space-y-5">
        {tabGroups.map((g) => (
          <div key={g.titleKey}>
            <div
              className="text-[11px] font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--color-text-light)' }}
            >
              {t(g.titleKey)}
            </div>
            <div className="flex flex-wrap gap-2">{g.tabs.map(renderTabButton)}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '2px solid var(--color-border)' }}
        >
          {(
            [
              { v: '' as const, label: t('paipuStats.allType') },
              { v: 'online' as const, label: t('paipuStats.online') },
            ] as const
          ).map(({ v, label }, i) => (
            <button
              key={v || 'all'}
              type="button"
              onClick={() => setGameType(v)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: gameType === v ? 'var(--color-primary-light)' : 'white',
                color: gameType === v ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                borderRight: i < 1 ? '1px solid var(--color-border)' : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={playerCount} onChange={(e) => setPlayerCount(e.target.value as typeof playerCount)} style={SELECT_STYLE}>
          <option value="">{t('paipuStats.allPlayerCount')}</option>
          <option value="4">{t('playerCount.yonma')}</option>
          <option value="3">{t('playerCount.sanma')}</option>
        </select>
        <select value={gameMode} onChange={(e) => setGameMode(e.target.value as typeof gameMode)} style={SELECT_STYLE}>
          <option value="">{t('paipuStats.allMode')}</option>
          <option value="east_wind">{t('gameMode.eastWind')}</option>
          <option value="half_match">{t('gameMode.halfMatch')}</option>
        </select>
        <select value={minGames} onChange={(e) => setMinGames(e.target.value)} style={SELECT_STYLE}>
          <option value="1">{t('paipuStats.minGames')}1{t('paipuStats.minGamesUnit')}</option>
          <option value="5">{t('paipuStats.minGames')}5{t('paipuStats.minGamesUnit')}</option>
          <option value="10">{t('paipuStats.minGames')}10{t('paipuStats.minGamesUnit')}</option>
          <option value="20">{t('paipuStats.minGames')}20{t('paipuStats.minGamesUnit')}</option>
          <option value="50">{t('paipuStats.minGames')}50{t('paipuStats.minGamesUnit')}</option>
        </select>
      </div>

      {rankings.length === 0 ? (
        <div className="empty-state card">
          <p className="text-sm">{t('paipuStats.noData')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rankings.map((item, idx) => {
            const barWidth = getBarWidth(item.rate);
            return (
              <Link
                key={item.player.id}
                to={`/player-list/${item.player.id}`}
                className="card p-4 flex items-center gap-4 transition-all hover:shadow-md"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="text-lg font-bold" style={{
                  color: idx < 3 ? MEDAL_COLORS[idx] : 'var(--color-text-light)',
                  minWidth: '2rem', textAlign: 'center',
                }}>
                  {idx + 1}
                </div>
                {item.player.avatar ? (
                  <img src={item.player.avatar} alt={item.player.nickname} className="avatar" />
                ) : (
                  <div className="avatar-placeholder">{item.player.nickname.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{item.player.nickname}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                    {subtitleForStat(rankType, item, t)}
                  </div>
                  <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: '#f0f0f0', width: '100%' }}>
                    <div style={{
                      width: `${Math.max(barWidth, 4)}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${currentTab.color}66, ${currentTab.color})`,
                      borderRadius: '0.5rem',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold" style={{ color: currentTab.color }}>
                    {currentTab.format(item.rate)}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{currentTab.label}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
