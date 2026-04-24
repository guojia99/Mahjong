import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFunRanking } from '@/api/games';
import type { FunRankingItem } from '@/api/games';
import { useToast } from '@/hooks/useToast';
import { Medal } from 'lucide-react';

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

const RANK_TABS: TabConfig[] = [
  { value: '1st', label: '一位率', color: '#f0b830', emoji: '\uD83E\uDD47', unit: '%', format: v => `${v}%` },
  { value: '2nd', label: '二位率', color: '#a8d8ea', emoji: '\uD83E\uDD48', unit: '%', format: v => `${v}%` },
  { value: '3rd', label: '三位率', color: '#e8a0bf', emoji: '\uD83E\uDD49', unit: '%', format: v => `${v}%` },
  { value: '4th', label: '四位率', color: '#b0b0b0', emoji: '\uD83D\uDCA5', unit: '%', format: v => `${v}%` },
  { value: 'avg_rank', label: '平均顺位', color: '#7c6ff7', emoji: '\uD83C\uDFC6', unit: '位', format: v => v.toFixed(2) },
  { value: 'avg_score', label: '平均得点', color: '#2d9d78', emoji: '\uD83C\uDFC5', unit: '点', format: v => v.toFixed(1) },
  { value: 'high_score', label: '最高得点', color: '#e68a00', emoji: '\uD83D\uDD25', unit: '点', format: v => String(v) },
  { value: 'low_score', label: '最低得点', color: '#e74c3c', emoji: '\uD83D\uDCA2', unit: '点', format: v => String(v) },
];

const MEDAL_COLORS = ['#f0b830', '#a8d8ea', '#e8a0bf'];

export default function FunRankingPage() {
  const [rankings, setRankings] = useState<FunRankingItem[]>([]);
  const [rankType, setRankType] = useState<RankType>('1st');
  const [playerCount, setPlayerCount] = useState<'' | '3' | '4'>('4');
  const [gameMode, setGameMode] = useState<'' | 'east_wind' | 'half_match'>('half_match');
  const [gameType, setGameType] = useState<'' | 'offline' | 'online'>('');
  const [minGames, setMinGames] = useState('1');
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    const params: Record<string, string> = { rank_type: rankType };
    if (playerCount) params.player_count = playerCount;
    if (gameMode) params.game_mode = gameMode;
    if (gameType) params.game_type = gameType;
    if (minGames) params.min_games = minGames;
    getFunRanking(params).then(setRankings).catch(() => showToast('加载排行失败'));
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
        <h2 className="text-lg font-bold">趣味排行</h2>
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
              { v: '' as const, label: '全部' },
              { v: 'offline' as const, label: '线下' },
              { v: 'online' as const, label: '线上' },
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
          <option value="">全部人数</option>
          <option value="4">四麻</option>
          <option value="3">三麻</option>
        </select>
        <select value={gameMode} onChange={(e) => setGameMode(e.target.value as typeof gameMode)} style={SELECT_STYLE}>
          <option value="">全部模式</option>
          <option value="east_wind">东风</option>
          <option value="half_match">半庄</option>
        </select>
        <select value={minGames} onChange={(e) => setMinGames(e.target.value)} style={SELECT_STYLE}>
          <option value="1">最少1局</option>
          <option value="5">最少5局</option>
          <option value="10">最少10局</option>
          <option value="20">最少20局</option>
          <option value="50">最少50局</option>
        </select>
      </div>

      {rankings.length === 0 ? (
        <div className="empty-state card">
          <p className="text-sm">暂无数据</p>
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
                    {isPercent ? `${item.count}/${item.total} 局` : `${item.total} 局`}
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
