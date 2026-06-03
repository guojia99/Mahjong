import { useMemo, useState } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { Link } from 'react-router-dom';
import { getRankingLeaderboard } from '@/api/ranking';
import { useToast } from '@/hooks/useToast';
import type { PlayerRankingScore } from '@/types';
import { Trophy } from 'lucide-react';
import RankTierBadge from '@/components/RankTierBadge';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

export default function RankingLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<PlayerRankingScore[]>([]);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const { showToast, ToastComponent } = useToast();

  useAbortableEffect((signal) => {
    getRankingLeaderboard({ signal })
      .then(setLeaderboard)
      .catch((e) => {
        if (isAbortError(e)) return;
        showToast('加载排位排行失败');
      });
  }, [showToast]);

  const playerIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of leaderboard) {
      if (item.player?.id) ids.push(item.player.id);
    }
    return [...new Set(ids)];
  }, [leaderboard]);

  useAbortableEffect((signal) => {
    if (playerIds.length === 0) return;
    loadPlayerAvatarsForList(playerIds, { signal }).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [playerIds]);

  return (
    <div>
      {ToastComponent}
      <style>{`
        @keyframes huntianGlow {
          from { filter: brightness(1); }
          to { filter: brightness(1.15); }
        }
      `}</style>

      <div className="flex items-center gap-2 mb-6">
        <Trophy size={20} style={{ color: '#f0b830' }} />
        <h2 className="text-lg font-bold">天梯排位</h2>
        <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>四麻半庄</span>
      </div>

      <div className="card mb-6">
        <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
          排位分基于四麻半庄对局结算，不分线上线下。录入新对局后自动计算。
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <div className="empty-state card">
          <p className="text-sm">暂无排位数据</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((item, idx) => {
            const medalColors = ['#f0b830', '#a8d8ea', '#e8a0bf'];
            const score = Math.round(item.score * 100) / 100;
            return (
              <Link
                key={item.player.id}
                to={`/player-list/${item.player.id}`}
                className="card p-4 flex items-center gap-4 transition-all hover:shadow-md"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  className="text-lg font-bold"
                  style={{
                    color: idx < 3 ? medalColors[idx] : 'var(--color-text-light)',
                    minWidth: '2rem',
                    textAlign: 'center',
                  }}
                >
                  {idx + 1}
                </div>
                {playerAvatars[item.player.id] ? (
                  <img src={playerAvatars[item.player.id]} alt={item.player.nickname} className="avatar" />
                ) : (
                  <div className="avatar-placeholder">{item.player.nickname.charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{item.player.nickname}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                    {item.game_count} 局
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {item.tier && (
                    <RankTierBadge tier={item.tier} score={item.score} size="sm" />
                  )}
                  <div
                    className="text-lg font-bold"
                    style={{ color: score >= 0 ? '#2d9d78' : '#e74c3c' }}
                  >
                    {score}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>排位分</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
