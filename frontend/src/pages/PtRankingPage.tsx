import { useMemo, useState } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { Link } from 'react-router-dom';
import { getPtRanking } from '@/api/games';
import { useToast } from '@/hooks/useToast';
import type { PtRankingItem } from '@/types';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

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

type PtScope = '' | 'offline' | 'online';

export default function PtRankingPage() {
  const [rankings, setRankings] = useState<PtRankingItem[]>([]);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const [playerCount, setPlayerCount] = useState<'' | '3' | '4'>('4');
  const [gameMode, setGameMode] = useState<'' | 'east_wind' | 'half_match'>('half_match');
  const [ptScope, setPtScope] = useState<PtScope>('');
  const { showToast, ToastComponent } = useToast();
  const { t } = useTranslation();

  useAbortableEffect((signal) => {
    const params: Record<string, string> = {};
    if (playerCount) params.player_count = playerCount;
    if (gameMode) params.game_mode = gameMode;
    if (ptScope) params.game_type = ptScope;
    getPtRanking(params, { signal })
      .then(setRankings)
      .catch((e) => {
        if (isAbortError(e)) return;
        showToast(t('ptRanking.loadFailed'));
      });
  }, [playerCount, gameMode, ptScope, showToast, t]);

  const playerIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of rankings) {
      if (item.player?.id) ids.push(item.player.id);
    }
    return [...new Set(ids)];
  }, [rankings]);

  useAbortableEffect((signal) => {
    if (playerIds.length === 0) return;
    loadPlayerAvatarsForList(playerIds, signal).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [playerIds]);

  const maxPt = rankings.length > 0 ? Math.max(...rankings.map(r => r.total_pt)) : 1;
  const minPt = rankings.length > 0 ? Math.min(...rankings.map(r => r.total_pt)) : 0;
  const range = maxPt - minPt || 1;

  return (
    <div>
      {ToastComponent}
      <div className="flex items-center gap-2 mb-6">
        <Trophy size={20} style={{ color: '#f0b830' }} />
        <h2 className="text-lg font-bold">{t('ptRanking.title')}</h2>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: '2px solid var(--color-border)' }}
        >
          {(
            [
              { v: '' as const, label: t('ptRanking.allGames') },
              { v: 'offline' as const, label: t('ptRanking.offlineOnly') },
              { v: 'online' as const, label: t('ptRanking.onlineOnly') },
            ] as const
          ).map(({ v, label }, i) => (
            <button
              key={v || 'all'}
              type="button"
              onClick={() => setPtScope(v)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: ptScope === v ? 'var(--color-primary-light)' : 'white',
                color: ptScope === v ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                borderRight: i < 2 ? '1px solid var(--color-border)' : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={playerCount} onChange={(e) => setPlayerCount(e.target.value as typeof playerCount)} style={SELECT_STYLE}>
          <option value="">{t('ptRanking.allPlayerCount')}</option>
          <option value="4">{t('playerCount.yonma')}</option>
          <option value="3">{t('playerCount.sanma')}</option>
        </select>
        <select value={gameMode} onChange={(e) => setGameMode(e.target.value as typeof gameMode)} style={SELECT_STYLE}>
          <option value="">{t('ptRanking.allMode')}</option>
          <option value="east_wind">{t('gameMode.eastWind')}</option>
          <option value="half_match">{t('gameMode.halfMatch')}</option>
        </select>
      </div>

      {rankings.length === 0 ? (
        <div className="empty-state card">
          <p className="text-sm">{t('ptRanking.noData')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rankings.map((item, idx) => {
            const pt = Math.round(item.total_pt * 100) / 100;
            const barWidth = ((item.total_pt - minPt) / range) * 100;
            const medalColors = ['#f0b830', '#a8d8ea', '#e8a0bf'];
            return (
              <Link
                key={item.player.id}
                to={`/player-list/${item.player.id}`}
                className="card p-4 flex items-center gap-4 transition-all hover:shadow-md"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="text-lg font-bold" style={{
                  color: idx < 3 ? medalColors[idx] : 'var(--color-text-light)',
                  minWidth: '2rem', textAlign: 'center',
                }}>
                  {idx + 1}
                </div>
                {playerAvatars[item.player.id] ? (
                  <img src={playerAvatars[item.player.id]} alt={item.player.nickname} className="avatar" />
                ) : (
                  <div className="avatar-placeholder">{item.player.nickname.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{item.player.nickname}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{item.game_count} {t('common.unit.round')}</div>
                  <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: '#f0f0f0', width: '100%' }}>
                    <div style={{
                      width: `${Math.max(barWidth, 4)}%`,
                      height: '100%',
                      background: item.total_pt >= 0
                        ? 'linear-gradient(90deg, #a8e6cf, #2d9d78)'
                        : 'linear-gradient(90deg, #e74c3c, #ff8b94)',
                      borderRadius: '0.5rem',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold" style={{ color: pt >= 0 ? '#2d9d78' : '#e74c3c' }}>
                    {pt > 0 ? `+${pt}` : pt}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>PT</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
