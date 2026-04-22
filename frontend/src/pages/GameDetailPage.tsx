import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGame, submitGameScores, updateGamePlayers, shuffleGameSeats, createNextGame, createHandRecord, deleteHandRecord } from '@/api/games';
import { getPlayers } from '@/api/players';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import HandRecordModal from '@/components/HandRecordModal';
import SortablePlayerList, { type SortableItem } from '@/components/SortablePlayerList';
import type { Game, Player, GameScore, GamePlayerInfo, MeldInfo } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, SEAT_WIND_LABELS, HAND_RECORD_TYPE_LABELS, WIN_TYPE_LABELS } from '@/types';
import { ArrowLeft, Save, RefreshCw, Shuffle, Copy, Sparkles, Trash2, ExternalLink } from 'lucide-react';

function gpToSortable(gp: GamePlayerInfo): SortableItem {
  return { id: gp.player.id, nickname: gp.player.nickname, avatar: gp.player.avatar };
}

function ScoreTag({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const tone = score > 0 ? 'score-tag-positive' : score < 0 ? 'score-tag-negative' : 'score-tag-zero';
  return <span className={`score-tag ${tone}`}>{score < 0 ? score : score}</span>;
}


export default function GameDetailPage() {
  const { roomId, gameId } = useParams<{ roomId: string; gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [showScoreInput, setShowScoreInput] = useState(false);
  const [showChangePlayers, setShowChangePlayers] = useState(false);
  const [showHandRecordModal, setShowHandRecordModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();
  const admin = isAdmin();

  const [scoreItems, setScoreItems] = useState<SortableItem[]>([]);
  const [scoreData, setScoreData] = useState<Record<string, { score: string; is_dealer_start: boolean }>>({});
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [paipuConfirmUrl, setPaipuConfirmUrl] = useState<string | null>(null);

  const loadGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await getGame(gameId);
      setGame(data);
      setScoreItems(data.players.map(gpToSortable));
      const sd: Record<string, { score: string; is_dealer_start: boolean }> = {};
      data.players.forEach((gp) => {
        sd[gp.player.id] = {
          score: gp.score !== null && gp.score !== undefined ? String(gp.score) : '',
          is_dealer_start: gp.is_dealer_start,
        };
      });
      setScoreData(sd);
      setSelectedPlayerIds(data.players.map((gp) => gp.player.id));
    } catch {
      showToast('加载对局数据失败');
    }
  }, [gameId, showToast]);

  useEffect(() => {
    void Promise.resolve().then(() => loadGame());
    void getPlayers().then(setAllPlayers);
  }, [loadGame]);

  const handleScoreChange = (playerId: string, value: string) => {
    setScoreData((prev) => ({ ...prev, [playerId]: { ...prev[playerId], score: value } }));
  };

  const handleDealerChange = (playerId: string) => {
    setScoreData((prev) => {
      const updated: Record<string, { score: string; is_dealer_start: boolean }> = {};
      Object.keys(prev).forEach((key) => {
        updated[key] = { ...prev[key], is_dealer_start: key === playerId };
      });
      return updated;
    });
  };

  const totalScore = scoreItems.reduce((sum, item) => sum + (parseInt(scoreData[item.id]?.score || '0') || 0), 0);
  const playerCount = scoreItems.length || game?.players.length || 0;
  const expectedTotal = playerCount === 4 ? 1000 : playerCount === 3 ? 1050 : 0;
  const hasDealer = scoreItems.some((item) => scoreData[item.id]?.is_dealer_start);
  const allFilled = scoreItems.every((item) => scoreData[item.id]?.score !== '' && scoreData[item.id]?.score !== undefined);
  const isScoreValid = totalScore === expectedTotal && hasDealer && allFilled;

  const handleSubmitScores = async () => {
    if (!gameId || !isScoreValid) return;
    setLoading(true);
    try {
      const scoreList: GameScore[] = scoreItems.map((item, index) => ({
        player_id: item.id,
        score: parseInt(scoreData[item.id].score),
        is_dealer_start: scoreData[item.id].is_dealer_start,
        seat_number: index,
      }));
      const updated = await submitGameScores(gameId, scoreList);
      setGame(updated);
      setShowScoreInput(false);
      showToast('分数录入成功', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '录分失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSwapPlayers = async () => {
    if (!gameId || selectedPlayerIds.length < 3) return;
    setLoading(true);
    try {
      const updated = await updateGamePlayers(gameId, selectedPlayerIds);
      setGame(updated);
      setShowChangePlayers(false);
      showToast('选手已更换', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '更换失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleShuffleSeats = async () => {
    if (!gameId) return;
    setLoading(true);
    try {
      const updated = await shuffleGameSeats(gameId);
      setGame(updated);
      setScoreItems(updated.players.map(gpToSortable));
      showToast('已随机分配桩位', 'success');
    } catch {
      showToast('分配失败');
    } finally {
      setLoading(false);
    }
  };

  const handleNextGame = async () => {
    if (!roomId || !gameId) return;
    setLoading(true);
    try {
      const newGame = await createNextGame(roomId, gameId);
      navigate(`/rooms/${roomId}/games/${newGame.id}`);
    } catch {
      showToast('创建下一局失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddHandRecord = async (data: {
    player: string;
    record_type: string;
    yakuman_names: string[];
    hand_tiles: string[];
    melds: MeldInfo[];
    winning_tile: string;
    win_type: string;
  }) => {
    if (!gameId) return;
    setLoading(true);
    try {
      const record = await createHandRecord(gameId, data);
      if (game) {
        setGame({
          ...game,
          hand_records: [...(game.hand_records || []), record],
        });
      }
      setShowHandRecordModal(false);
      showToast('牌谱添加成功', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '添加失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHandRecord = async (recordId: string) => {
    if (!gameId) return;
    try {
      await deleteHandRecord(gameId, recordId);
      if (game) {
        setGame({
          ...game,
          hand_records: (game.hand_records || []).filter((r) => r.id !== recordId),
        });
      }
      showToast('牌谱已删除', 'success');
    } catch {
      showToast('删除失败');
    }
  };

  if (!game) {
    return <div className="card text-center py-8" style={{ color: 'var(--color-text-light)' }}>加载中...</div>;
  }

  const toggleSelected = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((p) => p !== playerId) : prev.length < 4 ? [...prev, playerId] : prev
    );
  };

  const displayPlayers = [...game.players].sort((a, b) => a.seat_number - b.seat_number);
  const scoredTotal = game.players.reduce((sum, gp) => sum + (gp.score || 0), 0);

  const rankedPlayers = game.is_scored
    ? [...displayPlayers].sort((a, b) => (b.score || 0) - (a.score || 0))
    : displayPlayers;

  return (
    <div>
      {ToastComponent}
      <button className="btn btn-sm btn-outline mb-4" onClick={() => navigate(`/rooms/${roomId}`)}>
        <ArrowLeft size={14} /> 返回房间
      </button>

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`badge badge-${game.game_type}`}>{GAME_TYPE_LABELS[game.game_type]}</span>
              <span className="font-semibold">{GAME_MODE_LABELS[game.game_mode]}</span>
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-light)' }}>{game.start_time}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {admin && (
              <>
                {!game.is_scored && (
                  <>
                    <button className="btn btn-sm btn-accent" onClick={handleShuffleSeats} disabled={loading}>
                      <Shuffle size={14} /> 随机桩位
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => setShowChangePlayers(true)}>
                      <RefreshCw size={14} /> 更换选手
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-primary" onClick={() => setShowScoreInput(true)}>
                  <Save size={14} /> {game.is_scored ? '修改分数' : '录入分数'}
                </button>
                <button className="btn btn-sm btn-secondary" onClick={handleNextGame} disabled={loading}>
                  <Copy size={14} /> 再开一局
                </button>
                {game.is_scored && (
                  <button className="btn btn-sm btn-outline" onClick={() => setShowHandRecordModal(true)} style={{ borderColor: '#f0b830', color: '#e65100' }}>
                    <Sparkles size={14} /> 役满牌谱
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-4">
          对局选手 ({game.players.length}人)
          {game.is_scored && (
            <span className="text-xs font-normal ml-2" style={{ color: 'var(--color-text-light)' }}>
              合计: {scoredTotal}
            </span>
          )}
        </h3>
        <div className="space-y-2">
          {rankedPlayers.map((gp, idx) => (
            <div
              key={gp.player.id}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                background: gp.is_dealer_start ? '#fff8e8' : '#f9f5f2',
                border: gp.is_dealer_start ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center" style={{ minWidth: '1.5rem' }}>
                  <span
                    className="text-xs font-bold"
                    style={{ color: gp.seat_number === 0 ? '#e68a00' : 'var(--color-text-light)' }}
                  >
                    {SEAT_WIND_LABELS[gp.seat_number] || gp.seat_number + 1}
                  </span>
                </div>
                {gp.player.avatar ? (
                  <img src={gp.player.avatar} alt={gp.player.nickname} className="avatar" style={{ width: '2rem', height: '2rem' }} />
                ) : (
                  <div className="avatar-placeholder" style={{ width: '2rem', height: '2rem', fontSize: '0.75rem' }}>
                    {gp.player.nickname.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{gp.player.nickname}</span>
                    {gp.is_dealer_start && (
                      <span className="badge" style={{ background: '#fff3e0', color: '#e68a00', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>东起</span>
                    )}
                    {game.is_scored && idx === 0 && (
                      <span className="badge" style={{ background: '#fff8e1', color: '#f0b830', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>Top</span>
                    )}
                  </div>
                </div>
              </div>
              <ScoreTag score={gp.score} />
            </div>
          ))}
        </div>
      </div>

      {game.hand_records && game.hand_records.length > 0 && (
        <div className="card mt-4">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Sparkles size={16} style={{ color: '#e65100' }} /> 役满牌谱
          </h3>
          <div className="space-y-3">
            {game.hand_records.map((hr) => (
              <div key={hr.id} className="p-3 rounded-xl" style={{ border: '1px solid var(--color-border)', background: '#fffbf0' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge" style={{ background: '#fff3e0', color: '#e65100', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
                      {HAND_RECORD_TYPE_LABELS[hr.record_type] || hr.record_type}
                    </span>
                    <span className="font-bold text-sm">{hr.player.nickname}</span>
                    <span className="text-sm" style={{ color: '#e65100' }}>
                      {(hr.yakuman_names || []).join(' + ')}
                    </span>
                    {hr.win_type && (
                      <span className="badge" style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
                        {WIN_TYPE_LABELS[hr.win_type] || hr.win_type}
                      </span>
                    )}
                  </div>
                  {admin && (
                    <button onClick={() => { if (window.confirm('确定删除此牌谱？')) handleDeleteHandRecord(hr.id); }} className="text-xs" style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {hr.hand_tiles && hr.hand_tiles.length > 0 && (
                  <div className="flex items-end gap-0.5 mb-2">
                    <span className="text-xs" style={{ color: 'var(--color-text-light)', marginRight: '0.375rem', alignSelf: 'center' }}>手牌:</span>
                    {hr.hand_tiles.map((t, i) => (
                      <img key={i} src={`/marjongs/${t}.webp`} alt={t} draggable={false}
                        style={{ height: '2.5rem', width: 'auto', borderRadius: '0.15rem' }} />
                    ))}
                    {hr.winning_tile && (
                      <img src={`/marjongs/H${hr.winning_tile}.webp`} alt={hr.winning_tile} draggable={false}
                        style={{ height: '1.75rem', width: 'auto', marginLeft: '0.25rem', borderRadius: '0.15rem' }} />
                    )}
                  </div>
                )}
                {hr.melds && hr.melds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-1">
                    {hr.melds.map((m, i) => (
                      <div key={i} className="flex items-center gap-0.5" style={{ padding: '0.125rem', borderRadius: '0.375rem', background: '#f3e8ff' }}>
                        <span className="text-xs" style={{ color: '#9c27b0', fontWeight: 600 }}>
                          {m.type === 'chi' ? '吃' : m.type === 'pon' ? '碰' : '杠'}
                        </span>
                        <div className="flex items-end gap-0.5">
                          {(() => {
                            const tiles = Array.isArray(m.tiles) ? m.tiles : (m.tiles as unknown[]);
                            const groups: { type: 'stack' | 'single'; tile: string; orientation: string; indices: number[] }[] = [];
                            let gi = 0;
                            while (gi < tiles.length) {
                              const raw = tiles[gi];
                              const entry = raw as { tile?: string; orientation?: string };
                              const tile = typeof raw === 'string' ? raw : entry.tile || '';
                              const orientation = typeof raw === 'string' ? 'h' : entry.orientation || 'h';
                              if (orientation === 'h') {
                                const indices = [gi];
                                while (gi + 1 < tiles.length) {
                                  const next = tiles[gi + 1] as { tile?: string; orientation?: string };
                                  const nt = typeof tiles[gi + 1] === 'string' ? tiles[gi + 1] as string : next.tile || '';
                                  const no = typeof tiles[gi + 1] === 'string' ? 'h' : next.orientation || 'h';
                                  if (nt === tile && no === 'h') { indices.push(gi + 1); gi++; } else break;
                                }
                                groups.push({ type: indices.length > 1 ? 'stack' : 'single', tile, orientation, indices });
                              } else {
                                groups.push({ type: 'single', tile, orientation, indices: [gi] });
                              }
                              gi++;
                            }
                            return (
                              <>
                                {groups.map((group, idx) => {
                                  if (group.type === 'stack') {
                                    return (
                                      <span key={idx} style={{
                                        position: 'relative',
                                        display: 'inline-flex',
                                        height: '3.5rem',
                                      }}>
                                        {group.indices.map((tIdx, si) => (
                                          <img
                                            key={tIdx}
                                            src={`/marjongs/H${group.tile}.webp`}
                                            alt={group.tile}
                                            draggable={false}
                                            style={{
                                              height: '1.75rem',
                                              width: 'auto',
                                              position: si === 0 ? 'relative' : 'absolute',
                                              top: si === 0 ? undefined : '1.75rem',
                                              left: 0,
                                              zIndex: si + 1,
                                            }}
                                          />
                                        ))}
                                      </span>
                                    );
                                  }
                                  const isH = group.orientation === 'h';
                                  return (
                                    <img
                                      key={idx}
                                      src={isH ? `/marjongs/H${group.tile}.webp` : `/marjongs/${group.tile}.webp`}
                                      alt={group.tile}
                                      draggable={false}
                                      style={{ height: isH ? '1.5rem' : '2rem', width: isH ? 'auto' : undefined, borderRadius: '0.15rem' }}
                                    />
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {game.source_url && (
        <div className="card mt-4">
          <h3 className="font-bold mb-2">牌谱链接</h3>
          <p className="text-xs font-mono break-all mb-2" style={{ color: 'var(--color-text-light)' }}>{game.source_url}</p>
          <button
            type="button"
            className="btn btn-sm btn-outline inline-flex items-center gap-1"
            onClick={() => setPaipuConfirmUrl(game.source_url.trim())}
          >
            <ExternalLink size={14} /> 在浏览器中打开牌谱
          </button>
        </div>
      )}

      <Modal open={Boolean(paipuConfirmUrl)} onClose={() => setPaipuConfirmUrl(null)} title="打开雀魂牌谱">
        <p className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>
          即将在新标签页打开外部网站。若为误触可取消。
        </p>
        {paipuConfirmUrl && (
          <p className="text-xs font-mono break-all mb-4 p-2 rounded-lg" style={{ background: '#f5f5f5', color: 'var(--color-text-light)' }}>
            {paipuConfirmUrl}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPaipuConfirmUrl(null)}>取消</button>
          <button
            type="button"
            className="btn btn-primary btn-sm inline-flex items-center gap-1"
            onClick={() => {
              if (paipuConfirmUrl) window.open(paipuConfirmUrl, '_blank', 'noopener,noreferrer');
              setPaipuConfirmUrl(null);
            }}
          >
            <ExternalLink size={14} /> 打开
          </button>
        </div>
      </Modal>

      <Modal open={showScoreInput} onClose={() => setShowScoreInput(false)} title="录入分数">
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-light)' }}>
          {playerCount === 4 ? '4人对局' : '3人对局'}，分数总和需为 <strong>{expectedTotal}</strong>
          ，拖拽调整席次
        </p>
        <SortablePlayerList items={scoreItems} onReorder={setScoreItems}>
          {(item) => (
            <div
              className="p-2 rounded-lg"
              style={{
                background: scoreData[item.id]?.is_dealer_start ? '#fff8e8' : '#f9f5f2',
                border: scoreData[item.id]?.is_dealer_start ? '1px solid var(--color-accent)' : '1px solid transparent',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {item.avatar ? (
                    <img src={item.avatar} alt={item.nickname} className="avatar-placeholder" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.625rem', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div className="avatar-placeholder" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.625rem' }}>
                      {item.nickname.charAt(0)}
                    </div>
                  )}
                  <span className="font-medium text-sm">{item.nickname}</span>
                </div>
                <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--color-text-light)' }}>
                  <input
                    type="radio"
                    name="dealer"
                    checked={scoreData[item.id]?.is_dealer_start || false}
                    onChange={() => handleDealerChange(item.id)}
                  />
                  东起
                </label>
              </div>
              <input
                type="number"
                value={scoreData[item.id]?.score || ''}
                onChange={(e) => handleScoreChange(item.id, e.target.value)}
                className="form-input"
                placeholder="输入分数 (可为负数)"
              />
            </div>
          )}
        </SortablePlayerList>

        <div
          className="mt-3 p-2 rounded-lg text-sm text-center font-medium"
          style={{
            background: isScoreValid ? '#e8f8f0' : '#fff3e0',
            color: isScoreValid ? '#2d9d78' : '#e68a00',
          }}
        >
          当前合计: {totalScore} / {expectedTotal}
          {!hasDealer && ' · 未指定东起'}
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <button className="btn btn-outline btn-sm" onClick={() => setShowScoreInput(false)}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={loading || !isScoreValid} onClick={handleSubmitScores}>
            {loading ? '提交中...' : '确认录分'}
          </button>
        </div>
      </Modal>

      <Modal open={showChangePlayers} onClose={() => setShowChangePlayers(false)} title="更换选手">
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-light)' }}>
          选择 {playerCount} 名选手 (已选 {selectedPlayerIds.length}/{playerCount})
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {allPlayers.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
              style={{
                background: selectedPlayerIds.includes(p.id) ? 'var(--color-primary-light)' : '#f9f5f2',
                border: selectedPlayerIds.includes(p.id) ? '2px solid var(--color-primary)' : '1px solid transparent',
              }}
            >
              <input type="checkbox" checked={selectedPlayerIds.includes(p.id)} onChange={() => toggleSelected(p.id)} className="hidden" />
              <div className="avatar-placeholder" style={{ width: '2rem', height: '2rem', fontSize: '0.75rem' }}>
                {p.nickname.charAt(0)}
              </div>
              <span className="text-sm font-medium">{p.nickname}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <button className="btn btn-outline btn-sm" onClick={() => setShowChangePlayers(false)}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={loading || selectedPlayerIds.length !== playerCount} onClick={handleSwapPlayers}>
            确认更换
          </button>
        </div>
      </Modal>

      {showHandRecordModal && (
        <HandRecordModal
          players={game.players}
          onSubmit={handleAddHandRecord}
          onClose={() => setShowHandRecordModal(false)}
        />
      )}
    </div>
  );
}
