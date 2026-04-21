import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoom, addPlayerToRoom, removePlayerFromRoom, getRoomGames, createRoomGame } from '@/api/games';
import { getPlayers } from '@/api/players';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import PlayerCard from '@/components/PlayerCard';
import SearchBar from '@/components/SearchBar';
import type { Room, Player, Game } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, ROOM_STATUS_LABELS } from '@/types';
import { Plus, MapPin, Clock, Play } from 'lucide-react';

export default function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [gameMode, setGameMode] = useState('east_wind');
  const [startTime, setStartTime] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();
  const admin = isAdmin();

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [roomData, gamesData] = await Promise.all([getRoom(id), getRoomGames(id)]);
      setRoom(roomData);
      setGames(gamesData);
    } catch {
      showToast('加载房间数据失败');
    }
  }, [id, showToast]);

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [loadData]);

  useEffect(() => {
    if (showAddPlayer) {
      getPlayers(playerQuery).then(setAllPlayers);
    }
  }, [showAddPlayer, playerQuery]);

  const roomPlayerIds = room?.room_players?.map((rp) => rp.player.id) || [];

  const filteredPlayers = allPlayers.filter((p) => !roomPlayerIds.includes(p.id));

  const handleAddPlayer = async (playerId: string) => {
    if (!id) return;
    try {
      await addPlayerToRoom(id, playerId);
      showToast('雀士已加入房间', 'success');
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '添加失败';
      showToast(msg);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!id) return;
    try {
      await removePlayerFromRoom(id, playerId);
      showToast('雀士已移出房间', 'success');
      loadData();
    } catch {
      showToast('移除失败');
    }
  };

  const toggleSelectedPlayer = (playerId: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(playerId) ? prev.filter((p) => p !== playerId) : [...prev, playerId]
    );
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || selectedPlayers.length < 3 || selectedPlayers.length > 4) {
      showToast('对局需要3-4名选手');
      return;
    }
    setLoading(true);
    try {
      await createRoomGame(id, {
        game_mode: gameMode,
        start_time: startTime || new Date().toISOString().slice(0, 16),
        player_ids: selectedPlayers,
      });
      showToast('对局创建成功', 'success');
      setShowNewGame(false);
      setSelectedPlayers([]);
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const availableForGame = room?.room_players?.map((rp) => rp.player) || [];

  const now = new Date();
  const defaultTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!room) {
    return <div className="card text-center py-8" style={{ color: 'var(--color-text-light)' }}>加载中...</div>;
  }

  return (
    <div>
      {ToastComponent}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{room.name}</h2>
            <div className="flex items-center gap-3 text-sm mt-1" style={{ color: 'var(--color-text-light)' }}>
              {room.location && (
                <span className="flex items-center gap-1"><MapPin size={14} /> {room.location}</span>
              )}
              <span className={`badge ${room.status === 'open' ? 'badge-open' : 'badge-closed'}`}>
                {ROOM_STATUS_LABELS[room.status]}
              </span>
            </div>
          </div>
          {admin && room.status === 'open' && (
            <div className="flex gap-2">
              <button className="btn btn-sm btn-outline" onClick={() => setShowAddPlayer(true)}>
                <Plus size={14} /> 添加雀士
              </button>
              {availableForGame.length >= 3 && (
                <button className="btn btn-sm btn-accent" onClick={() => setShowNewGame(true)}>
                  <Play size={14} /> 新建对局
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {room.room_players && room.room_players.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-bold mb-3">房间成员 ({room.room_players.length}人)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {room.room_players.map((rp) => (
              <PlayerCard
                key={rp.id}
                player={rp.player}
                size="sm"
                removable={admin && room.status === 'open'}
                onRemove={() => handleRemovePlayer(rp.player.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-bold mb-3">对局记录 ({games.length}局)</h3>
        {games.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm">暂无对局记录</p>
          </div>
        ) : (
          <div className="space-y-2">
            {games.map((game) => (
              <div
                key={game.id}
                className="p-3 rounded-xl cursor-pointer transition-all hover:shadow-md"
                style={{ border: '1px solid var(--color-border)', background: 'white' }}
                onClick={() => navigate(`/rooms/${id}/games/${game.id}`)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-${game.game_type}`}>
                      {GAME_TYPE_LABELS[game.game_type]}
                    </span>
                    <span className="text-sm font-medium">{GAME_MODE_LABELS[game.game_mode]}</span>
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-light)' }}>
                      <Clock size={12} /> {game.start_time}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {game.players.map((gp) => (
                      <div key={gp.player.id} className="flex items-center gap-1 text-xs">
                        <span
                          className="font-semibold"
                          style={{ color: gp.score && gp.score > 0 ? '#2d9d78' : gp.score && gp.score < 0 ? '#e74c3c' : 'inherit' }}
                        >
                          {gp.player.nickname}
                        </span>
                        {gp.score !== null && (
                          <span style={{ color: gp.score > 0 ? '#2d9d78' : '#e74c3c' }}>
                            ({gp.score > 0 ? `+${gp.score}` : gp.score})
                          </span>
                        )}
                        {game.players.indexOf(gp) < game.players.length - 1 && (
                          <span style={{ color: 'var(--color-border)' }}>/</span>
                        )}
                      </div>
                    ))}
                    {game.is_scored && (
                      <span className="badge badge-open" style={{ fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
                        已录分
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showAddPlayer} onClose={() => setShowAddPlayer(false)} title="添加雀士到房间">
        <SearchBar query={playerQuery} onQueryChange={setPlayerQuery} placeholder="搜索雀士..." />
        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
          {filteredPlayers.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-light)' }}>
              {playerQuery ? '未找到雀士' : '所有雀士都已在房间中'}
            </p>
          ) : (
            filteredPlayers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                onClick={() => handleAddPlayer(p.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="avatar-placeholder" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.75rem' }}>
                    {p.nickname.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{p.nickname}</div>
                    {p.real_name && <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{p.real_name}</div>}
                  </div>
                </div>
                <Plus size={16} style={{ color: 'var(--color-primary)' }} />
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal open={showNewGame} onClose={() => { setShowNewGame(false); setSelectedPlayers([]); }} title="新建对局">
        <form onSubmit={handleCreateGame}>
          <div className="form-group">
            <label className="form-label">选择选手 (3-4人)</label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableForGame.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: selectedPlayers.includes(p.id) ? 'var(--color-primary-light)' : '#f9f5f2',
                    border: selectedPlayers.includes(p.id) ? '2px solid var(--color-primary)' : '1px solid transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlayers.includes(p.id)}
                    onChange={() => toggleSelectedPlayer(p.id)}
                    className="hidden"
                  />
                  <div className="avatar-placeholder" style={{ width: '2rem', height: '2rem', fontSize: '0.75rem' }}>
                    {p.nickname.charAt(0)}
                  </div>
                  <span className="text-sm font-medium">{p.nickname}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">对局模式</label>
            <select
              value={gameMode}
              onChange={(e) => setGameMode(e.target.value)}
              className="form-input"
            >
              <option value="east_wind">东风局</option>
              <option value="half_match">半庄</option>
              <option value="south_wind">南风局</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">对局时间</label>
            <input
              type="datetime-local"
              value={startTime || defaultTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowNewGame(false); setSelectedPlayers([]); }}>
              取消
            </button>
            <button type="submit" disabled={loading || selectedPlayers.length < 3} className="btn btn-primary btn-sm">
              创建对局
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
