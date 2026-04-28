import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFunRanking } from '@/api/games';
import type { FunRankingItem } from '@/api/games';
import { useToast } from '@/hooks/useToast';
import { Medal } from 'lucide-react';
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

type RankType = '1st' | '2nd' | '3rd' | '4th' | 'avg_rank' | 'avg_score' | 'high_score' | 'low_score';

type TabConfig = { value: RankType; label: string; color: string; emoji: string; unit: string; format: (v: number) => string };

const MEDAL_COLORS = ['#f0b830', '#a8d8ea', '#e8a0bf'];

export default function FunRankingPage() {
  const [rankings, setRankings] = useState<FunRankingItem[]>([]);
  const [rankType, setRankType] = useState<RankType>('1st');
  const [playerCount, setPlayerCount] = useState<'' | '3' | '4'>('4');
  const [gameMode, setGameMode] = useState<'' | 'east_wind' | 'half_match'>('half_match');
  const [gameType, setGameType] = useState<'' | 'offline' | 'online'>('');
  const [minGames, setMinGames] = useState('1');
  const { showToast, ToastComponent } = useToast();
  const { t } = useTranslation();

  const RANK_TABS: TabConfig[] = [
    { value: '1st', label: t('funRanking.1stRate'), color: '#f0b830', emoji: '\uD83E\uDD47', unit: '%', format: v => `${v}%` },
    { value: '2nd', label: t('funRanking.2ndRate'), color: '#a8d8ea', emoji: '\uD83E\uDD48', unit: '%', format: v => `${v}%` },
    { value: '3rd', label: t('funRanking.3rdRate'), color: '#e8a0bf', emoji: '\uD83E\uDD49', unit: '%', format: v => `${v}%` },
    { value: '4th', label: t('funRanking.4thRate'), color: '#b0b0b0', emoji: '\uD83D\uDCA5', unit: '%', format: v => `${v}%` },
    { value: 'avg_rank', label: t('funRanking.avgRank'), color: '#7c6ff7', emoji: '\uD83C\uDFC6', unit: t('chart.rankPosition'), format: v => v.toFixed(2) },
    { value: 'avg_score', label: t('funRanking.avgScore'), color: '#2d9d78', emoji: '\uD83C\uDFC5', unit: t('common.unit.score'), format: v => v.toFixed(1) },
    { value: 'high_score', label: t('funRanking.highScore'), color: '#e68a00', emoji: '\uD83D\uDD25', unit: t('common.unit.score'), format: v => String(v) },
    { value: 'low_score', label: t('funRanking.lowScore'), color: '#e74c3c', emoji: '\uD83D\uDCA2', unit: t('common.unit.score'), format: v => String(v) },
  ];

  useEffect(() => {
    const params: Record<string, string> = { rank_type: rankType };
    if (playerCount) params.player_count = playerCount;
    if (gameMode) params.game_mode = gameMode;
    if (gameType) params.game_type = gameType;
    if (minGames) params.min_games = minGames;
    getFunRanking(params).then(setRankings).catch(() => showToast(t('funRanking.loadFailed')));
  }, [rankType, playerCount, gameMode, gameType, minGames, showToast]);

  const currentTab = RANK_TABS.find(t => t.value === rankType) || RANK_TABS[0];
  const isPercent = ['1st', '2nd', '3rd', '4th'].includes(rankType);
  const isAsc = ['avg_rank', 'low_score'].includes(rankType);
  const maxVal = rankings.length > 0 ? Math.max(...rankings.map(r => r.rate)) : 1;
  const minVal = rankings.length > 0 ? Math.min(...rankings.map(r => r.rate)) : 0;

  const getBarWidth = (rate: number) => {
    if (isPercent) return (rate / maxVal) * 100;
    if (isAsc) {
      const range = maxVal - minVal || 1;
      return ((maxVal - rate) / range) * 100;
    }
    return (rate / maxVal) * 100;
  };

  return (
    <div>
      {ToastComponent}
      <div className="flex items-center gap-2 mb-6">
        <Medal size={20} style={{ color: currentTab.color }} />
        <h2 className="text-lg font-bold">{t('funRanking.title')}</h2>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {RANK_TABS.map(tab => (
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
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '2px solid var(--color-border)' }}
        >
          {(
            [
              { v: '' as const, label: t('funRanking.allType') },
              { v: 'offline' as const, label: t('funRanking.offline') },
              { v: 'online' as const, label: t('funRanking.online') },
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
                borderRight: i < 2 ? '1px solid var(--color-border)' : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={playerCount} onChange={(e) => setPlayerCount(e.target.value as typeof playerCount)} style={SELECT_STYLE}>
          <option value="">{t('funRanking.allPlayerCount')}</option>
          <option value="4">{t('playerCount.yonma')}</option>
          <option value="3">{t('playerCount.sanma')}</option>
        </select>
        <select value={gameMode} onChange={(e) => setGameMode(e.target.value as typeof gameMode)} style={SELECT_STYLE}>
          <option value="">{t('funRanking.allMode')}</option>
          <option value="east_wind">{t('gameMode.eastWind')}</option>
          <option value="half_match">{t('gameMode.halfMatch')}</option>
        </select>
        <select value={minGames} onChange={(e) => setMinGames(e.target.value)} style={SELECT_STYLE}>
          <option value="1">{t('funRanking.minGames')}1{t('funRanking.minGamesUnit')}</option>
          <option value="5">{t('funRanking.minGames')}5{t('funRanking.minGamesUnit')}</option>
          <option value="10">{t('funRanking.minGames')}10{t('funRanking.minGamesUnit')}</option>
          <option value="20">{t('funRanking.minGames')}20{t('funRanking.minGamesUnit')}</option>
          <option value="50">{t('funRanking.minGames')}50{t('funRanking.minGamesUnit')}</option>
        </select>
      </div>

      {rankings.length === 0 ? (
        <div className="empty-state card">
          <p className="text-sm">{t('funRanking.noData')}</p>
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
                    {isPercent ? `${item.count}/${item.total} ${t('common.unit.round')}` : `${item.total} ${t('common.unit.round')}`}
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
