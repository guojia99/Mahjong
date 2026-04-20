import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPlayer, getPlayerGames } from '@/api/players';
import { getPlayerStats } from '@/api/games';
import { getPlayerYakumans } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import type { Player, Game, PlayerStats, HandRecord } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, PLAYER_COUNT_LABELS, GAME_MODE_FULL_LABELS } from '@/types';
import { ArrowLeft, Sparkles } from 'lucide-react';
import YakumanCard from '@/components/YakumanCard';

function ScoreTag({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const cls = score > 0 ? 'score-tag-positive' : score < 0 ? 'score-tag-negative' : 'score-tag-zero';
  return <span className={cls}>{score}</span>;
}

const GAME_TABS = [
  { player_count: 4, game_mode: 'east_wind', label: '四麻东风' },
  { player_count: 4, game_mode: 'half_match', label: '四麻半庄' },
  { player_count: 3, game_mode: 'east_wind', label: '三麻东风' },
  { player_count: 3, game_mode: 'half_match', label: '三麻半庄' },
];

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [yakumans, setYakumans] = useState<HandRecord[]>([]);
  const [tab, setTab] = useState<'stats' | 'games' | 'yakumans' | 'info'>('stats');
  const [filterPlayerCount, setFilterPlayerCount] = useState<'' | '3' | '4'>('');
  const [filterGameMode, setFilterGameMode] = useState<'' | 'east_wind' | 'half_match' | 'south_wind'>('');
  const { showToast, ToastComponent } = useToast();

  const loadStats = (pc?: string, gm?: string) => {
    if (!id) return;
    const params: Record<string, string> = {};
    if (pc) params.player_count = pc;
    if (gm) params.game_mode = gm;
    getPlayerStats(id, params).then(setStats).catch(() => setStats(null));
  };

  useEffect(() => {
    if (!id) return;
    getPlayer(id).then(setPlayer).catch(() => showToast('加载雀士失败'));
    getPlayerGames(id).then(setGames).catch(() => showToast('加载对局失败'));
    loadStats();
    getPlayerYakumans(id).then(setYakumans).catch(() => setYakumans([]));
  }, [id]);

  useEffect(() => {
    loadStats(filterPlayerCount, filterGameMode);
  }, [filterPlayerCount, filterGameMode]);

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

  const currentTab = GAME_TABS.find(
    (t) => t.player_count === parseInt(filterPlayerCount || '0') && t.game_mode === filterGameMode
  );

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
              onClick={() => { setFilterPlayerCount(String(t.player_count) as '' | '3' | '4'); setFilterGameMode(t.game_mode as '' | 'east_wind' | 'half_match' | 'south_wind'); }}
            >
              {t.label}
            </button>
          ))}
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
                    <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{activeTabLabel}总对局</div>
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
                <h3 className="font-bold mb-3" style={{ fontSize: '0.875rem' }}>一位率等</h3>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(stats.rank_distribution).map(([label, rate]) => {
                    const colors: Record<string, string> = {
                      '1位率': '#f0b830',
                      '2位率': '#a8d8ea',
                      '3位率': '#e8a0bf',
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

              {stats.recent_ranking.length > 0 && (
                <div className="card">
                  <h3 className="font-bold mb-3" style={{ fontSize: '0.875rem' }}>最近对局排名曲线</h3>
                  <div className="flex items-end gap-1" style={{ height: '120px' }}>
                    {stats.recent_ranking.map((r) => {
                      const maxRank = stats.recent_ranking[0]?.pt || 1;
                      const minRank = Math.min(...stats.recent_ranking.map(x => x.pt));
                      const height = r.pt >= 0
                        ? Math.max(8, ((r.pt - Math.min(0, minRank)) / (maxRank - Math.min(0, minRank) || 1)) * 100)
                        : 8;
                      const color = r.pt > 0 ? '#2d9d78' : r.pt < 0 ? '#e74c3c' : '#999';
                      return (
                        <div key={r.game_id} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                          <div style={{
                            width: '100%', height: `${height}%`, minHeight: '4px',
                            background: color, borderRadius: '2px 2px 0 0', opacity: 0.8,
                          }} title={`${r.start_time} 第${r.rank}名 PT:${r.pt}`} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                      {stats.recent_ranking[stats.recent_ranking.length - 1]?.start_time || ''}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                      {stats.recent_ranking[0]?.start_time || ''}
                    </span>
                  </div>
                </div>
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
