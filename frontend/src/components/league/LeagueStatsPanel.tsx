import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import type { FunRankingItem } from '@/api/games';
import type { LeagueStatType } from '@/api/leagues';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

const MEDAL_COLORS = ['#f0b830', '#a8d8ea', '#e8a0bf'];

const ONLINE_ONLY_STATS: LeagueStatType[] = ['avg_win_point', 'total_kan'];

type TabConfig = {
  value: LeagueStatType;
  labelKey: string;
  color: string;
  emoji: string;
  format: (v: number) => string;
};

type LeagueStatsPanelProps = {
  fetchStats: (statType: LeagueStatType, signal?: AbortSignal) => Promise<FunRankingItem[]>;
};

function subtitleForStat(statType: LeagueStatType, item: FunRankingItem, t: (k: string, o?: Record<string, string | number>) => string): string {
  if (['1st', '2nd', '3rd', '4th'].includes(statType)) {
    return `${item.count}/${item.total} ${t('common.unit.round')}`;
  }
  if (statType === 'avg_win_point') {
    return t('league.stats.subtitleWinPoint', { count: item.count, total: item.total });
  }
  if (statType === 'total_kan') {
    return t('league.stats.subtitleKan', { total: item.total });
  }
  return `${item.total} ${t('common.unit.round')}`;
}

export default function LeagueStatsPanel({ fetchStats }: LeagueStatsPanelProps) {
  const { t } = useTranslation();
  const [statType, setStatType] = useState<LeagueStatType>('1st');
  const [rankings, setRankings] = useState<FunRankingItem[]>([]);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const tabs: TabConfig[] = useMemo(
    () => [
      { value: '1st', labelKey: 'funRanking.1stRate', color: '#f0b830', emoji: '\uD83E\uDD47', format: v => `${v}%` },
      { value: '2nd', labelKey: 'funRanking.2ndRate', color: '#a8d8ea', emoji: '\uD83E\uDD48', format: v => `${v}%` },
      { value: '3rd', labelKey: 'funRanking.3rdRate', color: '#e8a0bf', emoji: '\uD83E\uDD49', format: v => `${v}%` },
      { value: '4th', labelKey: 'funRanking.4thRate', color: '#b0b0b0', emoji: '\uD83D\uDCA5', format: v => `${v}%` },
      { value: 'avg_rank', labelKey: 'funRanking.avgRank', color: '#7c6ff7', emoji: '\uD83C\uDFC6', format: v => v.toFixed(2) },
      { value: 'high_score', labelKey: 'league.stats.highScore', color: '#e68a00', emoji: '\uD83D\uDD25', format: v => String(v) },
      { value: 'avg_win_point', labelKey: 'paipuStats.avgWinPoint', color: '#2d9d78', emoji: '\uD83C\uDFAF', format: v => v.toFixed(1) },
      { value: 'total_kan', labelKey: 'league.stats.totalKan', color: '#7c6ff7', emoji: '\uD83D\uDD28', format: v => String(v) },
    ],
    [],
  );

  useAbortableEffect((signal) => {
    setLoading(true);
    fetchStats(statType, signal)
      .then((data) => {
        setRankings(data);
        setLoading(false);
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        setRankings([]);
        setLoading(false);
      });
  }, [statType, fetchStats]);

  const playerIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of rankings) {
      if (item.player?.id) ids.push(item.player.id);
    }
    return [...new Set(ids)];
  }, [rankings]);

  useAbortableEffect((signal) => {
    if (playerIds.length === 0) return;
    loadPlayerAvatarsForList(playerIds, { signal }).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [playerIds]);

  const currentTab = tabs.find(tab => tab.value === statType) || tabs[0];
  const isPercent = ['1st', '2nd', '3rd', '4th'].includes(statType);
  const isAsc = statType === 'avg_rank';
  const maxVal = rankings.length > 0 ? Math.max(...rankings.map(r => r.rate)) : 1;
  const minVal = rankings.length > 0 ? Math.min(...rankings.map(r => r.rate)) : 0;

  const getBarWidth = (rate: number) => {
    if (isPercent) return maxVal > 0 ? (rate / maxVal) * 100 : 0;
    if (isAsc) {
      const range = maxVal - minVal || 1;
      return ((maxVal - rate) / range) * 100;
    }
    return maxVal > 0 ? (rate / maxVal) * 100 : 0;
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatType(tab.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
            style={{
              background: statType === tab.value ? tab.color + '22' : 'white',
              color: statType === tab.value ? tab.color : 'var(--color-text-light)',
              border: statType === tab.value ? `2px solid ${tab.color}` : '2px solid var(--color-border)',
            }}
          >
            {tab.emoji} {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {ONLINE_ONLY_STATS.includes(statType) && (
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-light)' }}>
          {t('league.stats.onlineOnlyHint')}
        </p>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--color-text-light)' }}>
          {t('common.loading')}
        </div>
      ) : rankings.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--color-text-light)' }}>
          {t('league.stats.noData')}
        </div>
      ) : (
        <div className="space-y-2">
          {rankings.map((item, idx) => {
            const barWidth = getBarWidth(item.rate);
            return (
              <Link
                key={item.player.id}
                to={`/player-list/${item.player.id}`}
                className="rounded-xl border bg-white p-4 flex items-center gap-4 transition-all hover:shadow-md"
                style={{ textDecoration: 'none', color: 'inherit', borderColor: 'var(--color-border)' }}
              >
                <div
                  className="text-lg font-bold"
                  style={{
                    color: idx < 3 ? MEDAL_COLORS[idx] : 'var(--color-text-light)',
                    minWidth: '2rem',
                    textAlign: 'center',
                  }}
                >
                  {idx + 1}
                </div>
                {playerAvatars[item.player.id] ? (
                  <img src={playerAvatars[item.player.id]} alt={item.player.nickname} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-gray-100">
                    {item.player.nickname.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{item.player.nickname}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                    {subtitleForStat(statType, item, t)}
                  </div>
                  <div className="mt-1 h-2 rounded-full overflow-hidden bg-gray-100 w-full">
                    <div
                      style={{
                        width: `${Math.max(barWidth, 4)}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${currentTab.color}66, ${currentTab.color})`,
                        borderRadius: '0.5rem',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold" style={{ color: currentTab.color }}>
                    {currentTab.format(item.rate)}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t(currentTab.labelKey)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
