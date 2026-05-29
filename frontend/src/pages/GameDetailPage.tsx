import { useState, useCallback, useMemo } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getGame, submitGameScores, updateGamePlayers, shuffleGameSeats, createNextGame, createHandRecord, deleteHandRecord, deleteGame, updateGame } from '@/api/games';
import { getPlayers } from '@/api/players';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import HandRecordModal from '@/components/HandRecordModal';
import SortablePlayerList, { type SortableItem } from '@/components/SortablePlayerList';
import type { Game, Player, GameScore, GamePlayerInfo, MeldInfo } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, SEAT_WIND_LABELS, HAND_RECORD_TYPE_LABELS, WIN_TYPE_LABELS } from '@/types';
import { ArrowLeft, Save, RefreshCw, Shuffle, Copy, Sparkles, Trash2, ExternalLink, Pencil, Trophy } from 'lucide-react';
import { PaipuDetailPanel, canShowPaipuDetailPanel } from '@/components/PaipuDetailPanel';
import { PaipuReplayPanel, canShowPaipuReplay } from '@/components/PaipuReplayPanel';
import { PaipuAiOverviewPanel, canShowPaipuAiOverview } from '@/components/PaipuAiOverviewPanel';
import { useTranslation } from 'react-i18next';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

function gpToSortable(gp: GamePlayerInfo, avatarUrl?: string): SortableItem {
  return { id: gp.player.id, nickname: gp.player.nickname, avatar: avatarUrl ?? gp.player.avatar ?? null };
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = iso.includes('T') ? iso : iso.replace(' ', 'T');
  return t.length >= 16 ? t.slice(0, 16) : t;
}

function ScoreTag({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const tone = score > 0 ? 'score-tag-positive' : score < 0 ? 'score-tag-negative' : 'score-tag-zero';
  return <span className={`score-tag ${tone}`}>{score < 0 ? score : score}</span>;
}


export default function GameDetailPage() {
  const { roomId, gameId } = useParams<{ roomId?: string; gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backToFromState = (location.state as { backTo?: string } | undefined)?.backTo;
  const navigateBackTarget =
    backToFromState || (roomId ? `/rooms/${roomId}` : '/games');
  const [game, setGame] = useState<Game | null>(null);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [showScoreInput, setShowScoreInput] = useState(false);
  const [showChangePlayers, setShowChangePlayers] = useState(false);
  const [showHandRecordModal, setShowHandRecordModal] = useState(false);
  const [showEditGame, setShowEditGame] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editGameMode, setEditGameMode] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();
  const admin = isAdmin();
  const { t } = useTranslation();

  const navigateBackLabel = backToFromState
    ? t('common.back')
    : roomId
      ? t('gameDetail.backToRoom')
      : t('gameDetail.backToGameList');

  const [scoreItems, setScoreItems] = useState<SortableItem[]>([]);
  const [scoreData, setScoreData] = useState<Record<string, { score: string; is_dealer_start: boolean }>>({});
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [paipuConfirmUrl, setPaipuConfirmUrl] = useState<string | null>(null);
  const [paipuTab, setPaipuTab] = useState<'replay' | 'ai' | 'summary'>('replay');

  const loadGame = useCallback(async (signal?: AbortSignal) => {
    if (!gameId) return;
    try {
      const data = await getGame(gameId, signal ? { signal } : undefined);
      setGame(data);
      setScoreItems(data.players.map((gp) => gpToSortable(gp)));
      const sd: Record<string, { score: string; is_dealer_start: boolean }> = {};
      data.players.forEach((gp) => {
        sd[gp.player.id] = {
          score: gp.score !== null && gp.score !== undefined ? String(gp.score) : '',
          is_dealer_start: gp.is_dealer_start,
        };
      });
      setScoreData(sd);
      setSelectedPlayerIds(data.players.map((gp) => gp.player.id));
    } catch (e) {
      if (isAbortError(e)) return;
      showToast(t('gameDetail.loadFailed'));
    }
  }, [gameId, showToast, t]);

  useAbortableEffect((signal) => {
    void loadGame(signal);
    getPlayers('', { signal }).then(setAllPlayers).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [loadGame]);

  const gamePlayerIds = useMemo(() => {
    const ids: string[] = [];
    for (const gp of game?.players ?? []) {
      if (gp.player?.id) ids.push(gp.player.id);
    }
    return [...new Set(ids)];
  }, [game?.players]);

  useAbortableEffect((signal) => {
    if (gamePlayerIds.length === 0) return;
    loadPlayerAvatarsForList(gamePlayerIds, signal).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [gamePlayerIds]);

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
  const isOfflineGame = game?.game_type === 'offline';
  const isScoreValid = totalScore === expectedTotal && (hasDealer || isOfflineGame) && allFilled;

  const openScoreInput = () => {
    if (isOfflineGame && !hasDealer && scoreItems.length > 0) {
      const firstId = scoreItems[0].id;
      const updated: Record<string, { score: string; is_dealer_start: boolean }> = {};
      Object.keys(scoreData).forEach((key) => {
        updated[key] = { ...scoreData[key], is_dealer_start: key === firstId };
      });
      setScoreData(updated);
    }
    setShowScoreInput(true);
  };

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
      showToast(t('gameDetail.scoresSuccess'), 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('gameDetail.scoresFailed');
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
      showToast(t('gameDetail.playersSwapped'), 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('gameDetail.swapFailed');
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
      setScoreItems(updated.players.map((gp) => gpToSortable(gp)));
      showToast(t('gameDetail.seatsShuffled'), 'success');
    } catch {
      showToast(t('gameDetail.shuffleFailed'));
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
      showToast(t('gameDetail.nextGameFailed'));
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
      showToast(t('gameDetail.handRecordAdded'), 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('gameDetail.handRecordAddFailed');
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
      showToast(t('gameDetail.handRecordDeleted'), 'success');
    } catch {
      showToast(t('gameDetail.handRecordDeleteFailed'));
    }
  };

  const handleDeleteGame = async () => {
    if (!gameId) return;
    if (!confirm(t('gameDetail.deleteGameConfirm'))) return;
    try {
      await deleteGame(gameId);
      showToast(t('gameDetail.gameDeleted'), 'success');
      navigate(navigateBackTarget);
    } catch {
      showToast(t('gameDetail.handRecordDeleteFailed'));
    }
  };

  const handleEditGame = async () => {
    if (!gameId) return;
    setLoading(true);
    try {
      const payload: { start_time?: string; end_time?: string | null; game_mode?: string } = {};
      if (editStartTime) payload.start_time = editStartTime;
      if (editEndTime) payload.end_time = editEndTime;
      else payload.end_time = null;
      if (editGameMode) payload.game_mode = editGameMode;
      const updated = await updateGame(gameId, payload);
      setGame(updated);
      setShowEditGame(false);
      showToast(t('gameDetail.gameUpdated'), 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('gameDetail.updateFailed');
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!game) {
    return <div className="card text-center py-8" style={{ color: 'var(--color-text-light)' }}>{t('common.loading')}</div>;
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
      <button
        className="btn btn-sm btn-outline mb-4"
        onClick={() => navigate(navigateBackTarget)}
      >
        <ArrowLeft size={14} /> {navigateBackLabel}
      </button>

      <div
        className={game.is_league_game && game.league_logo_url ? 'space-y-4 p-2 sm:p-3 rounded-2xl' : 'space-y-4'}
        style={
          game.is_league_game && game.league_logo_url
            ? {
                backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.93), rgba(255, 255, 255, 0.93)), url(${game.league_logo_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`badge badge-${game.game_type}`}>{GAME_TYPE_LABELS[game.game_type]}</span>
              {game.is_league_game && (
                <span
                  className="inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                    color: '#c2410c',
                    border: '1px solid rgba(251, 146, 60, 0.35)',
                  }}
                >
                  <Trophy size={12} /> {t('gameList.leagueBadge')}
                </span>
              )}
              <span className="font-semibold">{GAME_MODE_LABELS[game.game_mode]}</span>
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              {game.start_time}
              {game.end_time && <span> ~ {game.end_time}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {admin && (
              <>
                {!game.is_scored && (
                  <>
                    <button className="btn btn-sm btn-accent" onClick={handleShuffleSeats} disabled={loading}>
                      <Shuffle size={14} /> {t('gameDetail.randomSeats')}
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => setShowChangePlayers(true)}>
                      <RefreshCw size={14} /> {t('gameDetail.swapPlayers')}
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-primary" onClick={openScoreInput}>
                  <Save size={14} /> {game.is_scored ? t('gameDetail.editScores') : t('gameDetail.enterScores')}
                </button>
                <button className="btn btn-sm btn-secondary" onClick={handleNextGame} disabled={loading || !roomId}>
                  <Copy size={14} /> {t('gameDetail.nextGame')}
                </button>
                {game.is_scored && (
                  <button className="btn btn-sm btn-outline" onClick={() => setShowHandRecordModal(true)} style={{ borderColor: '#f0b830', color: '#e65100' }}>
                    <Sparkles size={14} /> {t('gameDetail.yakumanRecord')}
                  </button>
                )}
                <button className="btn btn-sm btn-outline" onClick={handleDeleteGame} style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                  <Trash2 size={14} /> {t('gameDetail.deleteGame')}
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => {
                  setEditStartTime(toDatetimeLocal(game.start_time));
                  setEditEndTime(toDatetimeLocal(game.end_time));
                  setEditGameMode(game.game_mode);
                  setShowEditGame(true);
                }}>
                  <Pencil size={14} /> {t('gameDetail.editGame')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-4">
          {t('gameDetail.playerCountLabel')} ({game.players.length}{t('common.peopleUnit')})
          {game.is_scored && (
            <span className="text-xs font-normal ml-2" style={{ color: 'var(--color-text-light)' }}>
              {t('gameDetail.totalLabel')} {scoredTotal}
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
                {(playerAvatars[gp.player.id] || gp.player.avatar) ? (
                  <img src={playerAvatars[gp.player.id] || gp.player.avatar} alt={gp.player.nickname} className="avatar" style={{ width: '2rem', height: '2rem' }} />
                ) : (
                  <div className="avatar-placeholder" style={{ width: '2rem', height: '2rem', fontSize: '0.75rem' }}>
                    {gp.player.nickname.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{gp.player.nickname}</span>
                    {gp.is_dealer_start && (
                      <span className="badge" style={{ background: '#fff3e0', color: '#e68a00', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>{t('gameDetail.dealerStart')}</span>
                    )}
                    {game.is_scored && idx === 0 && (
                      <span className="badge" style={{ background: '#fff8e1', color: '#f0b830', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>Top</span>
                    )}
                  </div>
                  {(() => {
                    const fromAccounts = (gp.player.majsoul_accounts ?? []).map((a) => a.uid);
                    const merged = [...(gp.player.majsoul_uids ?? []), ...fromAccounts]
                      .map((u) => Number(u))
                      .filter((n) => Number.isFinite(n));
                    const uniq = [...new Set(merged)];
                    if (uniq.length === 0) return null;
                    return (
                      <div className="text-xs mt-0.5 font-mono tabular-nums" style={{ color: 'var(--color-text-light)' }}>
                        {t('gameDetail.majsoulUid')}: {uniq.join(', ')}
                      </div>
                    );
                  })()}
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
            <Sparkles size={16} style={{ color: '#e65100' }} /> {t('gameDetail.yakumanRecord')}
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
                    <button onClick={() => { if (window.confirm(t('common.confirmDelete'))) handleDeleteHandRecord(hr.id); }} className="text-xs" style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {hr.hand_tiles && hr.hand_tiles.length > 0 && (
                  <div className="flex items-end gap-0.5 mb-2">
                    <span className="text-xs" style={{ color: 'var(--color-text-light)', marginRight: '0.375rem', alignSelf: 'center' }}>{t('gameDetail.handTiles')}</span>
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
                          {m.type === 'chi' ? t('gameDetail.meldChi') : m.type === 'pon' ? t('gameDetail.meldPon') : t('gameDetail.meldKan')}
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

      {(game.source_url || canShowPaipuDetailPanel(game)) && (
        <div className="card mt-4">
          {game.source_url && (
            <>
              <h3 className="font-bold mb-2">{t('gameDetail.paipuLinkTitle')}</h3>
              <p className="text-xs font-mono break-all mb-2" style={{ color: 'var(--color-text-light)' }}>{game.source_url}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline inline-flex items-center gap-1"
                  onClick={() => setPaipuConfirmUrl(game.source_url.trim())}
                >
                  <ExternalLink size={14} /> {t('gameDetail.openPaipu')}
                </button>
              </div>
            </>
          )}
          {(canShowPaipuDetailPanel(game) || canShowPaipuReplay(game) || canShowPaipuAiOverview(game)) && (
            <div className={game.source_url ? 'mt-6 pt-4 border-t' : ''} style={game.source_url ? { borderColor: 'var(--color-border)' } : undefined}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="font-bold">{t('paipuDetail.modalTitle')}</h3>
                <div className="flex gap-1 rounded-lg overflow-hidden" style={{ border: '1.5px solid var(--color-border)' }}>
                  {canShowPaipuReplay(game) && (
                    <button
                      type="button"
                      onClick={() => setPaipuTab('replay')}
                      className="px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{
                        background: paipuTab === 'replay' ? 'var(--color-primary-light)' : 'white',
                        color: paipuTab === 'replay' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                      }}
                    >
                      {t('paipuReplay.tabReplay')}
                    </button>
                  )}
                  {canShowPaipuAiOverview(game) && (
                    <button
                      type="button"
                      onClick={() => setPaipuTab('ai')}
                      className="px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{
                        background: paipuTab === 'ai' ? 'var(--color-primary-light)' : 'white',
                        color: paipuTab === 'ai' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                        borderLeft: canShowPaipuReplay(game) ? '1px solid var(--color-border)' : undefined,
                      }}
                    >
                      {t('paipuReplay.tabAi')}
                    </button>
                  )}
                  {canShowPaipuDetailPanel(game) && (
                    <button
                      type="button"
                      onClick={() => setPaipuTab('summary')}
                      className="px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{
                        background: paipuTab === 'summary' ? 'var(--color-primary-light)' : 'white',
                        color: paipuTab === 'summary' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                        borderLeft:
                          canShowPaipuReplay(game) || canShowPaipuAiOverview(game)
                            ? '1px solid var(--color-border)'
                            : undefined,
                      }}
                    >
                      {t('paipuReplay.tabSummary')}
                    </button>
                  )}
                </div>
              </div>
              {paipuTab === 'replay' && canShowPaipuReplay(game) && <PaipuReplayPanel game={game} />}
              {paipuTab === 'ai' && canShowPaipuAiOverview(game) && <PaipuAiOverviewPanel game={game} />}
              {paipuTab === 'summary' && canShowPaipuDetailPanel(game) && <PaipuDetailPanel game={game} />}
            </div>
          )}
        </div>
      )}

      </div>

      <Modal open={Boolean(paipuConfirmUrl)} onClose={() => setPaipuConfirmUrl(null)} title={t('gameDetail.openPaipuTitle')}>
        <p className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>
          {t('gameDetail.openPaipuWarn')}
        </p>
        {paipuConfirmUrl && (
          <p className="text-xs font-mono break-all mb-4 p-2 rounded-lg" style={{ background: '#f5f5f5', color: 'var(--color-text-light)' }}>
            {paipuConfirmUrl}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPaipuConfirmUrl(null)}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn-primary btn-sm inline-flex items-center gap-1"
            onClick={() => {
              if (paipuConfirmUrl) window.open(paipuConfirmUrl, '_blank', 'noopener,noreferrer');
              setPaipuConfirmUrl(null);
            }}
          >
            <ExternalLink size={14} /> {t('common.open')}
          </button>
        </div>
      </Modal>

      <Modal open={showScoreInput} onClose={() => setShowScoreInput(false)} title={t('gameDetail.scoreModalTitle')}>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-light)' }}>
          {playerCount === 4 ? t('gameDetail.scoreModalHint4') : t('gameDetail.scoreModalHint3')}，{t('gameDetail.scoreModalSum')} <strong>{expectedTotal}</strong>
          ，{t('gameDetail.scoreModalDrag')}
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
                  {(playerAvatars[item.id] || item.avatar) ? (
                    <img src={playerAvatars[item.id] || item.avatar || undefined} alt={item.nickname} className="avatar-placeholder" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.625rem', borderRadius: '50%', objectFit: 'cover' }} />
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
                  {t('gameDetail.dealerStart')}
                </label>
              </div>
              <input
                type="number"
                value={scoreData[item.id]?.score || ''}
                onChange={(e) => handleScoreChange(item.id, e.target.value)}
                className="form-input"
                placeholder={t('gameDetail.scorePlaceholder')}
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
          {t('gameDetail.currentTotal')} {totalScore} / {expectedTotal}
          {!hasDealer && !isOfflineGame && ' · ' + t('gameDetail.noDealerSet')}
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <button className="btn btn-outline btn-sm" onClick={() => setShowScoreInput(false)}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" disabled={loading || !isScoreValid} onClick={handleSubmitScores}>
            {loading ? t('gameDetail.submitting') : t('gameDetail.confirmScore')}
          </button>
        </div>
      </Modal>

      <Modal open={showChangePlayers} onClose={() => setShowChangePlayers(false)} title={t('gameDetail.swapModalTitle')}>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-light)' }}>
          {t('gameDetail.swapSelectHint')} {playerCount} {t('gameDetail.swapOf')} ({t('gameDetail.swapSelected')} {selectedPlayerIds.length}/{playerCount})
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
          <button className="btn btn-outline btn-sm" onClick={() => setShowChangePlayers(false)}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" disabled={loading || selectedPlayerIds.length !== playerCount} onClick={handleSwapPlayers}>
            {t('gameDetail.confirmSwap')}
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

      <Modal open={showEditGame} onClose={() => setShowEditGame(false)} title={t('gameDetail.editGameModalTitle')}>
        <div className="form-group">
          <label className="form-label">{t('gameDetail.gameModeLabel')}</label>
          <select value={editGameMode} onChange={(e) => setEditGameMode(e.target.value)} className="form-input">
            <option value="half_match">{t('gameMode.halfMatchFull')}</option>
            <option value="east_wind">{t('gameMode.eastWindFull')}</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">{t('gameDetail.startTimeLabel')}</label>
          <input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="form-input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('gameDetail.endTimeOptionalLabel')}</label>
          <input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="form-input" />
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn btn-outline btn-sm" onClick={() => setShowEditGame(false)}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" disabled={loading} onClick={handleEditGame}>{t('common.save')}</button>
        </div>
      </Modal>
    </div>
  );
}
