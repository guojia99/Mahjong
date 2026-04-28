import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getRoom, addPlayerToRoom, removePlayerFromRoom, getRoomGames, createRoomGame } from '@/api/games';
import { getPlayers } from '@/api/players';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import PlayerCard from '@/components/PlayerCard';
import SearchBar from '@/components/SearchBar';
import type { Room, Player, Game } from '@/types';
import { GAME_MODE_LABELS, ROOM_STATUS_LABELS, ROOM_TYPE_LABELS } from '@/types';
import { Plus, MapPin, Clock, Play, Globe } from 'lucide-react';

export default function RoomDetailPage() {
  const { t } = useTranslation();
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
  const [endTime, setEndTime] = useState('');
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
      showToast(t('roomDetail.loadFailed'));
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
      showToast(t('roomDetail.playerJoined'), 'success');
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('roomDetail.joinFailed');
      showToast(msg);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!id) return;
    try {
      await removePlayerFromRoom(id, playerId);
      showToast(t('roomDetail.playerRemoved'), 'success');
      loadData();
    } catch {
      showToast(t('roomDetail.removeFailed'));
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
      showToast(t('roomDetail.gamePlayersRequired'));
      return;
    }
    setLoading(true);
    try {
      await createRoomGame(id, {
        game_mode: gameMode,
        start_time: startTime || new Date().toISOString().slice(0, 16),
        end_time: endTime || null,
        player_ids: selectedPlayers,
      });
      showToast(t('roomDetail.createGameSuccess'), 'success');
      setShowNewGame(false);
      setSelectedPlayers([]);
      setEndTime('');
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('roomDetail.createGameFailed');
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const availableForGame = room?.room_players?.map((rp) => rp.player) || [];

  const now = new Date();
  const defaultTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!room) {
    return <div className="card text-center py-8" style={{ color: 'var(--color-text-light)' }}>{t('common.loading')}</div>;
  }

  const scoredGames = games.filter(g => g.is_scored && g.pt);
  const playerPtMap = new Map<string, { total: number; count: number }>();
  for (const game of scoredGames) {
    if (!game.pt) continue;
    for (const gp of game.players) {
      if (gp.score === null) continue;
      const pid = gp.player.id;
      const pt = game.pt[pid] ?? 0;
      const prev = playerPtMap.get(pid) ?? { total: 0, count: 0 };
      playerPtMap.set(pid, { total: prev.total + pt, count: prev.count + 1 });
    }
  }
  const sortedPtList = [...playerPtMap.entries()]
    .map(([pid, { total, count }]) => {
      const player = room.room_players?.find(rp => rp.player.id === pid)?.player;
      return { playerId: pid, player, pt: Math.round(total * 100) / 100, count };
    })
    .filter(x => x.player)
    .sort((a, b) => b.pt - a.pt);

  return (
    <div>
      {ToastComponent}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{room.name}</h2>
            <div className="flex items-center gap-3 text-sm mt-1 flex-wrap" style={{ color: 'var(--color-text-light)' }}>
              {room.room_type && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-primary-light)' }}>
                  {ROOM_TYPE_LABELS[room.room_type] ?? room.room_type}
                </span>
              )}
              {room.session_time && (
                <span className="flex items-center gap-1"><Clock size={14} /> {t('rooms.sessionLabel')} {room.session_time}</span>
              )}
              {room.location && (
                <span className="flex items-center gap-1"><MapPin size={14} /> {room.location}</span>
              )}
              <span className={`badge ${room.status === 'open' ? 'badge-open' : 'badge-closed'}`}>
                {ROOM_STATUS_LABELS[room.status]}
              </span>
            </div>
          </div>
          {admin && room.status === 'open' && (
            <div className="flex flex-wrap gap-2">
              {room.room_type === 'online' && (
                <Link
                  to={`/rooms/online?room=${id}`}
                  className="btn btn-sm"
                  style={{ textDecoration: 'none', background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
                >
                  <Globe size={14} /> {t('roomDetail.onlineImport')}
                </Link>
              )}
              <button className="btn btn-sm btn-outline" onClick={() => setShowAddPlayer(true)}>
                <Plus size={14} /> {t('roomDetail.addPlayer')}
              </button>
              {availableForGame.length >= 3 && (
                <button className="btn btn-sm btn-accent" onClick={() => setShowNewGame(true)}>
                  <Play size={14} /> {t('roomDetail.newGame')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {room.room_players && room.room_players.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-bold mb-3">{t('roomDetail.membersTitle', { count: room.room_players.length })}</h3>
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

      {sortedPtList.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-bold mb-3">{t('roomDetail.ptRankingTitle', { count: scoredGames.length })}</h3>
          <div className="space-y-2">
            {sortedPtList.map((item, idx) => {
              const maxPt = Math.max(...sortedPtList.map(x => Math.abs(x.pt)), 1);
              const barW = (Math.abs(item.pt) / maxPt) * 100;
              const medalColors = ['#f0b830', '#a8d8ea', '#e8a0bf'];
              return (
                <div key={item.playerId} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: '#f9f5f2' }}>
                  <span className="text-sm font-bold" style={{ color: idx < 3 ? medalColors[idx] : 'var(--color-text-light)', minWidth: '1.5rem', textAlign: 'center' }}>
                    {idx + 1}
                  </span>
                  {item.player?.avatar ? (
                    <img src={item.player.avatar} alt={item.player.nickname} className="avatar" style={{ width: '1.75rem', height: '1.75rem' }} />
                  ) : (
                    <div className="avatar-placeholder" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.625rem' }}>
                      {item.player?.nickname?.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{item.player?.nickname}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{item.count}{t('common.gamesUnit')}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#f0f0f0' }}>
                      <div style={{
                        width: `${Math.max(barW, 4)}%`,
                        height: '100%',
                        background: item.pt >= 0 ? 'linear-gradient(90deg, #a8e6cf, #2d9d78)' : 'linear-gradient(90deg, #ff8b94, #e74c3c)',
                        borderRadius: '0.5rem',
                      }} />
                    </div>
                  </div>
                  <div className="text-right" style={{ minWidth: '3.5rem' }}>
                    <span className="text-base font-bold" style={{ color: item.pt >= 0 ? '#2d9d78' : '#e74c3c' }}>
                      {item.pt > 0 ? `+${item.pt}` : item.pt}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-bold mb-3">{t('roomDetail.gameRecordTitle', { count: games.length })}</h3>
        {games.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm">{t('roomDetail.noGameRecords')}</p>
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
                    <span className="text-sm font-medium">{GAME_MODE_LABELS[game.game_mode]}</span>
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-light)' }}>
                      <Clock size={12} /> {game.start_time}{game.end_time ? ` ~ ${game.end_time}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[...game.players]
                      .sort((a, b) => (b.score ?? -999999) - (a.score ?? -999999))
                      .map((gp, gi, arr) => (
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
                        {gi < arr.length - 1 && (
                          <span style={{ color: 'var(--color-border)' }}>/</span>
                        )}
                      </div>
                    ))}
                    {!game.is_scored && (
                      <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t('roomDetail.notScored')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showAddPlayer} onClose={() => setShowAddPlayer(false)} title={t('roomDetail.addPlayerModalTitle')}>
        <SearchBar query={playerQuery} onQueryChange={setPlayerQuery} placeholder={t('roomDetail.playerSearchPlaceholder')} />
        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
          {filteredPlayers.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-light)' }}>
              {playerQuery ? t('roomDetail.noPlayerFound') : t('roomDetail.noPlayerFound')}
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

      <Modal open={showNewGame} onClose={() => { setShowNewGame(false); setSelectedPlayers([]); setEndTime(''); }} title={t('roomDetail.newGameModalTitle')}>
        <form onSubmit={handleCreateGame}>
          <div className="form-group">
            <label className="form-label">{t('roomDetail.selectPlayers')}</label>
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
            <label className="form-label">{t('roomDetail.gameModeLabel')}</label>
            <select
              value={gameMode}
              onChange={(e) => setGameMode(e.target.value)}
              className="form-input"
            >
              <option value="east_wind">{t('gameMode.eastWindFull')}</option>
              <option value="half_match">{t('gameMode.halfMatchFull')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('roomDetail.gameTimeLabel')}</label>
            <input
              type="datetime-local"
              value={startTime || defaultTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('roomDetail.endTimeLabel')}</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowNewGame(false); setSelectedPlayers([]); setEndTime(''); }}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={loading || selectedPlayers.length < 3} className="btn btn-primary btn-sm">
              {t('roomDetail.createGame')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
