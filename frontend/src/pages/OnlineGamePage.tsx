import { useState, useEffect } from 'react';
import { importOnlineGame } from '@/api/games';
import { getPlayers } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import SearchBar from '@/components/SearchBar';
import type { Player, Game } from '@/types';
import { ExternalLink } from 'lucide-react';


export default function OnlineGamePage() {
  const [sourceUrl, setSourceUrl] = useState('');
  const [gameMode, setGameMode] = useState('half_match');
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [gameEntries, setGameEntries] = useState<
    { nickname: string; uid?: number; player_id: string; score: string; is_dealer_start: boolean }[]
  >([]);
  const [games, setGames] = useState<Game[]>([]);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addIndex, setAddIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    getPlayers().then(setAllPlayers);
  }, []);

  useEffect(() => {
    if (playerQuery) {
      getPlayers(playerQuery).then(setAllPlayers);
    } else {
      getPlayers().then(setAllPlayers);
    }
  }, [playerQuery]);

  const addEntry = () => {
    setGameEntries((prev) => [
      ...prev,
      { nickname: '', uid: undefined, player_id: '', score: '', is_dealer_start: false },
    ]);
  };

  const updateEntry = (index: number, field: string, value: string | boolean | number) => {
    setGameEntries((prev) => {
      const updated = [...prev];
      (updated[index] as Record<string, string | boolean | number>)[field] = value;
      if (field === 'is_dealer_start' && value === true) {
        updated.forEach((e, i) => {
          if (i !== index) e.is_dealer_start = false;
        });
      }
      return updated;
    });
  };

  const removeEntry = (index: number) => {
    setGameEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const openPlayerSelect = (index: number) => {
    setAddIndex(index);
    setShowAddPlayer(true);
  };

  const selectPlayer = (player: Player) => {
    updateEntry(addIndex, 'player_id', player.id);
    updateEntry(addIndex, 'nickname', player.nickname);
    if (player.majsoul_uids && player.majsoul_uids.length > 0) {
      updateEntry(addIndex, 'uid', player.majsoul_uids[0]);
    }
    setShowAddPlayer(false);
  };

  const totalScore = gameEntries.reduce((sum, e) => sum + (parseInt(e.score) || 0), 0);
  const entryCount = gameEntries.length;
  const expectedTotal = entryCount === 4 ? 1000 : entryCount === 3 ? 1050 : 0;
  const hasDealer = gameEntries.some((e) => e.is_dealer_start);
  const isValid = totalScore === expectedTotal && hasDealer && gameEntries.every((e) => e.player_id && e.score);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    try {
      const player_data = gameEntries.map((entry) => ({
        player_id: entry.player_id,
        score: parseInt(entry.score),
        is_dealer_start: entry.is_dealer_start,
      }));
      const game = await importOnlineGame({
        source_url: sourceUrl,
        player_data,
        game_mode: gameMode,
        player_count: entryCount,
      });
      setGames((prev) => [game, ...prev]);
      setGameEntries([]);
      setSourceUrl('');
      showToast('线上对局导入成功', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '导入失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {ToastComponent}
      <div className="card mb-6">
        <h3 className="font-bold mb-4">导入线上友人局</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">牌谱链接</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="form-input"
              placeholder="https://game.maj-soul.com/1/?paipu=..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">对局模式</label>
            <select value={gameMode} onChange={(e) => setGameMode(e.target.value)} className="form-input">
              <option value="east_wind">东风局</option>
              <option value="half_match">半庄</option>
              <option value="south_wind">南风局</option>
            </select>
          </div>

          <div className="flex items-center justify-between mb-3">
            <label className="form-label mb-0">对局选手 ({entryCount}人)</label>
            <button type="button" className="btn btn-sm btn-outline" onClick={addEntry}>
              + 添加选手
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {gameEntries.length === 0 && (
              <div className="text-center py-6 text-sm" style={{ color: 'var(--color-text-light)' }}>
                请先添加选手
              </div>
            )}
            {gameEntries.map((entry, index) => (
              <div
                key={index}
                className="p-3 rounded-xl"
                style={{
                  background: entry.is_dealer_start ? '#fff8e8' : '#f9f5f2',
                  border: entry.is_dealer_start ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1">
                    {entry.player_id ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{entry.nickname}</span>
                        {entry.uid && (
                          <span className="text-xs" style={{ color: 'var(--color-secondary-dark)' }}>
                            UID: {entry.uid}
                          </span>
                        )}
                        {entry.is_dealer_start && (
                          <span className="badge" style={{ background: '#fff3e0', color: '#e68a00', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>东</span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-primary-dark)', background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={() => openPlayerSelect(index)}
                      >
                        点击选择雀士
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-light)' }}>
                      <input
                        type="radio"
                        name="dealer_online"
                        checked={entry.is_dealer_start}
                        onChange={() => updateEntry(index, 'is_dealer_start', true)}
                      />
                      东起
                    </label>
                    <input
                      type="number"
                      value={entry.score}
                      onChange={(e) => updateEntry(index, 'score', e.target.value)}
                      className="form-input"
                      style={{ width: '5rem', padding: '0.375rem 0.5rem' }}
                      placeholder="分数"
                    />
                    <button
                      type="button"
                      className="text-gray-300 hover:text-red-400"
                      onClick={() => removeEntry(index)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {entryCount > 0 && (
            <div
              className="p-2 rounded-lg text-sm text-center font-medium mb-4"
              style={{
                background: isValid ? '#e8f8f0' : '#fff3e0',
                color: isValid ? '#2d9d78' : '#e68a00',
              }}
            >
              当前合计: {totalScore} / {expectedTotal}
              {!hasDealer && ' · 未指定东起'}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !isValid || entryCount < 3}
            >
              {loading ? '导入中...' : '导入对局'}
            </button>
          </div>
        </form>
      </div>

      {games.length > 0 && (
        <div className="card">
          <h3 className="font-bold mb-3">已导入对局 ({games.length})</h3>
          <div className="space-y-2">
            {games.map((game) => (
              <div key={game.id} className="p-3 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'white' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-online">线上</span>
                    <span className="text-sm">{game.start_time}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {game.players.map((gp) => (
                      <span key={gp.player.id} className="text-xs">
                        <span className="font-medium">{gp.player.nickname}</span>
                        <span style={{ color: gp.score && gp.score > 0 ? '#2d9d78' : '#e74c3c', marginLeft: '0.25rem' }}>
                          {gp.score !== null && (gp.score > 0 ? `+${gp.score}` : gp.score)}
                        </span>
                        {game.players.indexOf(gp) < game.players.length - 1 && ' / '}
                      </span>
                    ))}
                  </div>
                </div>
                {game.source_url && (
                  <a
                    href={game.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs mt-1 inline-flex items-center gap-1"
                    style={{ color: 'var(--color-secondary-dark)' }}
                  >
                    <ExternalLink size={10} /> 查看牌谱
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={showAddPlayer} onClose={() => setShowAddPlayer(false)} title="选择雀士">
        <SearchBar query={playerQuery} onQueryChange={setPlayerQuery} placeholder="搜索雀士..." />
        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
          {allPlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              onClick={() => selectPlayer(p)}
            >
              {p.avatar ? (
                <img src={p.avatar} alt={p.nickname} className="avatar" style={{ width: '2rem', height: '2rem' }} />
              ) : (
                <div className="avatar-placeholder" style={{ width: '2rem', height: '2rem', fontSize: '0.75rem' }}>
                  {p.nickname.charAt(0)}
                </div>
              )}
              <div>
                <div className="text-sm font-medium">{p.nickname}</div>
                {p.majsoul_uids && p.majsoul_uids.length > 0 && (
                  <div className="text-xs" style={{ color: 'var(--color-secondary-dark)' }}>
                    UID: {p.majsoul_uids.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
