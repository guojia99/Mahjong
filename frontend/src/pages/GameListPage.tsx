import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllGames } from '@/api/games';
import { useToast } from '@/hooks/useToast';
import type { Game } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, PLAYER_COUNT_LABELS } from '@/types';

function ScoreTag({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const cls = score > 0 ? 'score-tag-positive' : score < 0 ? 'score-tag-negative' : 'score-tag-zero';
  return <span className={cls}>{score}</span>;
}

function PtTag({ pt }: { pt: number | undefined }) {
  if (pt === undefined || pt === null) return null;
  const val = Math.round(pt * 100) / 100;
  const color = val > 0 ? '#2d9d78' : val < 0 ? '#e74c3c' : '#999';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '0.125rem 0.5rem', borderRadius: '0.375rem',
      fontSize: '0.75rem', fontWeight: 700, color, background: val > 0 ? '#e8f8f0' : val < 0 ? '#fde8e8' : '#f0f0f0',
    }}>
      {val > 0 ? `+${val}` : val}pt
    </span>
  );
}

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

export default function GameListPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [playerCountFilter, setPlayerCountFilter] = useState<'' | '3' | '4'>('4');
  const [modeFilter, setModeFilter] = useState<'' | 'east_wind' | 'half_match' | 'south_wind'>('half_match');
  const [typeFilter, setTypeFilter] = useState<'' | 'offline' | 'online'>('');
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    const params: Record<string, string> = {};
    if (playerCountFilter) params.player_count = playerCountFilter;
    if (modeFilter) params.game_mode = modeFilter;
    if (typeFilter) params.game_type = typeFilter;
    getAllGames(params).then(setGames).catch(() => showToast('加载对局失败'));
  }, [playerCountFilter, modeFilter, typeFilter, showToast]);

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <select
          value={playerCountFilter}
          onChange={(e) => setPlayerCountFilter(e.target.value as typeof playerCountFilter)}
          style={SELECT_STYLE}
        >
          <option value="">全部人数</option>
          <option value="4">四麻</option>
          <option value="3">三麻</option>
        </select>
        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}
          style={SELECT_STYLE}
        >
          <option value="">全部模式</option>
          <option value="east_wind">东风</option>
          <option value="half_match">半庄</option>
          <option value="south_wind">南风</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          style={SELECT_STYLE}
        >
          <option value="">全部类型</option>
          <option value="offline">线下</option>
          <option value="online">线上</option>
        </select>
        <span className="text-sm self-center ml-auto" style={{ color: 'var(--color-text-light)' }}>
          共 {games.length} 局
        </span>
      </div>

      {games.length === 0 ? (
        <div className="empty-state card">
          <p className="text-sm">暂无对局记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((game) => {
            const ranked = [...game.players].sort((a, b) => (b.score || 0) - (a.score || 0));
            return (
              <div key={game.id} className="card p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${game.player_count === 3 ? 'badge-sanma' : 'badge-yonma'}`}>
                      {PLAYER_COUNT_LABELS[game.player_count] || `${game.player_count}麻`}
                    </span>
                    <span className="badge badge-mode">{GAME_MODE_LABELS[game.game_mode]}</span>
                    <span className={`badge badge-${game.game_type}`}>{GAME_TYPE_LABELS[game.game_type]}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{game.start_time}</span>
                  </div>
                  {game.room && (
                    <Link
                      to={`/rooms/${game.room.id}/games/${game.id}`}
                      className="btn btn-sm btn-outline"
                      style={{ textDecoration: 'none' }}
                    >
                      {game.room.name}
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {ranked.map((gp, idx) => (
                    <div key={gp.player.id} className="flex items-center gap-2 text-sm">
                      <span className="font-bold" style={{ color: idx === 0 ? '#f0b830' : 'var(--color-text-light)', minWidth: '1rem' }}>
                        {idx + 1}
                      </span>
                      <Link to={`/player-list/${gp.player.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {gp.player.nickname}
                      </Link>
                      <ScoreTag score={gp.score} />
                      <PtTag pt={game.pt?.[gp.player.id]} />
                      {gp.is_dealer_start && (
                        <span className="badge" style={{ background: '#fff3e0', color: '#e68a00', fontSize: '0.5rem', padding: '0.0625rem 0.375rem' }}>东</span>
                      )}
                    </div>
                  ))}
                </div>
                {game.hand_records && game.hand_records.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {game.hand_records.map((hr) => (
                      <span key={hr.id} className="badge" style={{ background: '#fff8e1', color: '#e65100', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
                        {hr.player.nickname}: {(hr.yakuman_names || []).join(' + ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
