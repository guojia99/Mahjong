import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { importOnlineGame, parseOnlineGameBatch, getRooms, createRoom, getRoom, type OnlineParseItem } from '@/api/games';
import { getPlayers, createPlayer, addMajsoulAccount, deletePlayer } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import SearchBar from '@/components/SearchBar';
import type { Player, Room } from '@/types';
import { ROOM_TYPE_LABELS } from '@/types';
import { ExternalLink, Link2, AlertTriangle, Download, Home, ListOrdered, UserPlus } from 'lucide-react';

type RowState = {
  source_url: string;
  ok: boolean;
  data?: OnlineParseItem;
  error?: string;
  bindings: Record<number, string>;
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = iso.includes('T') ? iso : iso.replace(' ', 'T');
  return t.length >= 16 ? t.slice(0, 16) : t;
}

export default function OnlineGamePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const roomIdFromQuery = searchParams.get('room') || '';

  const [onlineRooms, setOnlineRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<string>(roomIdFromQuery);
  const [roomDetail, setRoomDetail] = useState<Room | null>(null);
  const [startTimeOverride, setStartTimeOverride] = useState('');

  const [urlsText, setUrlsText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<RowState[]>([]);
  const [parseError, setParseError] = useState('');

  const [importing, setImporting] = useState(false);
  const [importedGames, setImportedGames] = useState<
    { id: string; source_url: string; start_time: string; players: { player: { nickname: string }; score: number | null }[] }[]
  >([]);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomCreateLoading, setRoomCreateLoading] = useState(false);

  const [showBindModal, setShowBindModal] = useState(false);
  const [bindContext, setBindContext] = useState<{ url: string; uid: number; nickname: string } | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
  const [newPlayerRealName, setNewPlayerRealName] = useState('');
  const [createPlayerLoading, setCreatePlayerLoading] = useState(false);

  const { showToast, ToastComponent } = useToast();

  const loadOnlineRooms = useCallback(async () => {
    const list = await getRooms({ status: 'open', room_type: 'online' });
    setOnlineRooms(list);
  }, []);

  useEffect(() => {
    void loadOnlineRooms();
  }, [loadOnlineRooms]);

  useEffect(() => {
    if (roomIdFromQuery && roomIdFromQuery !== roomId) {
      setRoomId(roomIdFromQuery);
    }
  }, [roomIdFromQuery, roomId]);

  const refreshRoom = useCallback(async (id: string) => {
    if (!id) {
      setRoomDetail(null);
      return;
    }
    try {
      const r = await getRoom(id);
      setRoomDetail(r);
    } catch {
      setRoomDetail(null);
    }
  }, []);

  useEffect(() => {
    void refreshRoom(roomId);
  }, [roomId, refreshRoom]);

  const effectiveStartTime = useMemo(() => {
    if (startTimeOverride.trim()) return startTimeOverride.trim();
    return roomDetail?.session_time || '';
  }, [startTimeOverride, roomDetail?.session_time]);

  const setRoomAndQuery = (id: string) => {
    setRoomId(id);
    if (id) {
      setSearchParams({ room: id });
    } else {
      setSearchParams({});
    }
  };

  const handleCreateOnlineRoom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;
    const session = (form.elements.namedItem('session_time') as HTMLInputElement).value;
    if (!name.trim()) return;
    setRoomCreateLoading(true);
    try {
      const r = await createRoom({
        name: name.trim(),
        room_type: 'online',
        location: location?.trim() || '线上',
        session_time: session || null,
      });
      showToast('线上场已创建', 'success');
      setShowCreateRoom(false);
      await loadOnlineRooms();
      setRoomAndQuery(r.id);
    } catch {
      showToast('创建失败', 'error');
    } finally {
      setRoomCreateLoading(false);
    }
  };

  const parseBatch = async () => {
    if (!roomId) {
      showToast('请先选择或创建「线上场」房间', 'error');
      return;
    }
    const lines = urlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast('请粘贴至少一条牌谱链接（每行一条）', 'error');
      return;
    }

    setParsing(true);
    setParseError('');
    try {
      const { results } = await parseOnlineGameBatch(lines);
      const next: RowState[] = results.map((r) => {
        if (r.ok && r.data) {
          const b: Record<number, string> = {};
          for (const p of r.data.players) {
            if (p.player_id) b[p.uid] = p.player_id;
          }
          return { source_url: r.source_url, ok: true, data: r.data, bindings: b };
        }
        return {
          source_url: (r as { source_url: string }).source_url,
          ok: false,
          error: (r as { error?: string }).error || '解析失败',
          bindings: {},
        };
      });
      setRows(next);
      showToast(`已解析 ${next.filter((x) => x.ok).length} / ${next.length} 条`, 'success');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err instanceof Error ? err.message : '解析失败');
      setParseError(msg);
      setRows([]);
      showToast(msg, 'error');
    } finally {
      setParsing(false);
    }
  };

  const setBinding = (url: string, uid: number, playerId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.source_url !== url) return row;
        return { ...row, bindings: { ...row.bindings, [uid]: playerId } };
      })
    );
  };

  const openBindModal = (url: string, uid: number, nickname: string) => {
    setBindContext({ url, uid, nickname });
    setNewPlayerNickname(nickname);
    setNewPlayerRealName('');
    getPlayers().then(setAllPlayers);
    setShowBindModal(true);
  };

  const selectPlayerForBind = (player: Player) => {
    if (!bindContext) return;
    setBinding(bindContext.url, bindContext.uid, player.id);
    setShowBindModal(false);
    showToast('已绑定', 'success');
  };

  const handleCreatePlayerAndBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bindContext) return;
    const nick = newPlayerNickname.trim();
    if (!nick) {
      showToast('请填写雀士称呼', 'error');
      return;
    }
    setCreatePlayerLoading(true);
    let created: Player | null = null;
    try {
      created = await createPlayer({
        nickname: nick,
        ...(newPlayerRealName.trim() ? { real_name: newPlayerRealName.trim() } : {}),
      });
      try {
        await addMajsoulAccount(created.id, bindContext.uid, bindContext.nickname);
      } catch (mErr) {
        if (created) {
          try {
            await deletePlayer(created.id);
          } catch {
            /* 忽略回滚失败 */
          }
        }
        const msg =
          (mErr as { response?: { data?: { error?: string } } })?.response?.data?.error
          || '该雀魂 UID 已在系统中';
        showToast(`${msg}。请从下方列表选择已有雀士。`, 'error');
        return;
      }
      setBinding(bindContext.url, bindContext.uid, created.id);
      setAllPlayers((prev) => (prev.some((p) => p.id === created!.id) ? prev : [created!, ...prev]));
      setShowBindModal(false);
      showToast('已新建雀士并关联 UID', 'success');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err instanceof Error ? err.message : '创建失败');
      showToast(msg, 'error');
    } finally {
      setCreatePlayerLoading(false);
    }
  };

  const rowAllBound = (row: RowState): boolean => {
    if (!row.ok || !row.data) return false;
    return row.data.players.every((p) => row.bindings[p.uid]);
  };

  const rowTotalOk = (row: RowState): boolean => {
    if (!row.ok || !row.data) return false;
    const sum = row.data.players.reduce((s, p) => s + p.score, 0);
    const need = row.data.player_count === 3 ? 1050 : 1000;
    return sum === need;
  };

  const canImportOne = (row: RowState) => row.ok && rowAllBound(row) && rowTotalOk(row);

  const canImportAll = () =>
    rows.length > 0 && rows.filter((r) => r.ok).length > 0 && rows.filter((r) => r.ok).every((r) => canImportOne(r));

  const doImportOne = async (row: RowState) => {
    if (!row.ok || !row.data || !roomId) return;
    if (!canImportOne(row)) return;
    const player_data = row.data.players.map((p, i) => ({
      player_id: row.bindings[p.uid],
      score: p.score,
      is_dealer_start: i === 0,
    }));
    const st = effectiveStartTime ? new Date(effectiveStartTime).toISOString() : null;
    return importOnlineGame({
      room_id: roomId,
      source_url: row.source_url,
      player_data,
      game_mode: row.data.game_mode,
      player_count: row.data.player_count,
      paipu_data: row.data.raw_data,
      start_time: st,
    });
  };

  const handleImportOne = async (row: RowState) => {
    if (!roomId || !canImportOne(row)) return;
    setImporting(true);
    try {
      const game = await doImportOne(row);
      if (!game) return;
      setImportedGames((prev) => [
        {
          id: game.id,
          source_url: game.source_url,
          start_time: game.start_time,
          players: game.players.map((gp) => ({ player: gp.player, score: gp.score })),
        },
        ...prev,
      ]);
      setRows((prev) => prev.filter((r) => r.source_url !== row.source_url));
      showToast('已导入 1 局', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '导入失败';
      showToast(msg, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleImportAll = async () => {
    if (!canImportAll() || !roomId) return;
    setImporting(true);
    const doneUrls = new Set<string>();
    let n = 0;
    try {
      for (const row of rows) {
        if (row.ok && canImportOne(row)) {
          const game = await doImportOne(row);
          if (game) {
            doneUrls.add(row.source_url);
            n += 1;
            setImportedGames((prev) => [
              {
                id: game.id,
                source_url: game.source_url,
                start_time: game.start_time,
                players: game.players.map((gp) => ({ player: gp.player, score: gp.score })),
              },
              ...prev,
            ]);
          }
        }
      }
      setRows((prev) => prev.filter((r) => !doneUrls.has(r.source_url)));
      showToast(`已导入 ${n} 局`, 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '导入失败';
      showToast(msg, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      {ToastComponent}

      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ListOrdered size={18} style={{ color: 'var(--color-primary-dark)' }} />
            <h3 className="font-bold">1. 选择或创建「线上场」</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/rooms" className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }}>
              <Home size={14} /> 房间管理
            </Link>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowCreateRoom(true)}>
              新建线上场
            </button>
          </div>
        </div>
        <div className="form-group mb-0">
          <label className="form-label">当前房间</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="form-input flex-1"
              value={roomId}
              onChange={(e) => setRoomAndQuery(e.target.value)}
            >
              <option value="">— 请选择 —</option>
              {onlineRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（{ROOM_TYPE_LABELS[r.room_type]}，{r.game_count} 局
                  {r.session_time ? `，场次 ${r.session_time}` : ''}）
                </option>
              ))}
            </select>
          </div>
        </div>
        {roomDetail && (
          <p className="text-sm mt-3" style={{ color: 'var(--color-text-light)' }}>
            地点：{roomDetail.location || '—'}
            {roomDetail.session_time && ` · 场次时间：${roomDetail.session_time}`}
          </p>
        )}
        <div className="form-group mt-4">
          <label className="form-label">对局时间（本页导入的默认时间）</label>
          <input
            type="datetime-local"
            className="form-input max-w-md"
            value={startTimeOverride || toDatetimeLocalValue(roomDetail?.session_time) || ''}
            onChange={(e) => setStartTimeOverride(e.target.value)}
            disabled={!roomId}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
            不修改则使用房间上的场次时间；两者皆可空（后端将用当前时间）。
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 size={18} style={{ color: 'var(--color-primary-dark)' }} />
          <h3 className="font-bold">2. 批量粘贴牌谱链接</h3>
        </div>
        <p className="text-sm mb-2" style={{ color: 'var(--color-text-light)' }}>
          每行一个链接；需先选择线上场。解析后逐条绑定雀士，可单条或一次性导入已就绪的牌谱。
        </p>
        <textarea
          className="form-input w-full font-mono text-sm"
          rows={8}
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder="https://game.maj-soul.com/1/?paipu=...
https://game.maj-soul.com/1/?paipu=..."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!roomId || parsing} onClick={() => { void parseBatch(); }}>
            {parsing ? '解析中...' : '解析全部'}
          </button>
        </div>
      </div>

      {parseError && (
        <div className="card mb-6">
          <div
            className="p-3 rounded-xl flex items-start gap-2 text-sm"
            style={{ background: '#fde8e8', border: '1px solid #f5c6c6', color: '#c0392b' }}
          >
            <AlertTriangle size={16} className="flex-shrink-0" style={{ marginTop: 2 }} />
            <div>
              <div className="font-medium">解析失败</div>
              <div className="mt-1" style={{ color: '#e74c3c' }}>{parseError}</div>
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-bold mb-4">解析结果与绑定</h3>
          <div className="space-y-4">
            {rows.map((row) => {
              if (!row.ok) {
                return (
                  <div
                    key={row.source_url}
                    className="p-3 rounded-xl"
                    style={{ background: '#fde8e8', border: '1px solid #f5c6c6' }}
                  >
                    <div className="text-sm font-mono break-all opacity-80">{row.source_url || '(空行)'}</div>
                    <div className="text-sm mt-1">{row.error}</div>
                  </div>
                );
              }
              const d = row.data!;
              const exp = d.player_count === 3 ? 1050 : 1000;
              const sum = d.players.reduce((s, p) => s + p.score, 0);
              return (
                <div
                  key={row.source_url}
                  className="p-3 rounded-xl"
                  style={{ border: '1px solid var(--color-border)', background: 'white' }}
                >
                  <div className="text-xs font-mono break-all mb-2" style={{ color: 'var(--color-text-light)' }}>{row.source_url}</div>
                  <div className="text-sm mb-2">
                    模式 {d.game_mode === 'east_wind' ? '东风' : '半庄'} / {d.player_count} 人 · 分数和 {sum} / {exp}
                    {sum === exp ? ' ✓' : ' ✗'}
                  </div>
                  <div className="space-y-2">
                    {d.players.map((p) => {
                      const bound = Boolean(row.bindings[p.uid]);
                      return (
                        <div
                          key={p.uid}
                          className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg"
                          style={{ background: bound ? '#e8f8f0' : '#fff3e0' }}
                        >
                          <div className="text-sm">
                            <span className="font-medium">{p.nickname}</span>
                            <span className="text-xs ml-2" style={{ color: 'var(--color-text-light)' }}>UID {p.uid}</span>
                            <span className="ml-2" style={{ color: p.score > 0 ? '#2d9d78' : '#e74c3c' }}>{p.score > 0 ? `+${p.score}` : p.score}</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => openBindModal(row.source_url, p.uid, p.nickname)}
                          >
                            {bound ? '更换' : '绑定雀士'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={importing || !canImportOne(row)}
                      onClick={() => { void handleImportOne(row); }}
                    >
                      <Download size={14} /> 导入本局
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {rows.some((r) => r.ok) && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={importing || !canImportAll()}
                onClick={() => { void handleImportAll(); }}
              >
                导入全部已就绪
              </button>
            </div>
          )}
        </div>
      )}

      {importedGames.length > 0 && (
        <div className="card">
          <h3 className="font-bold mb-3">本次已导入对局 ({importedGames.length})</h3>
          <div className="space-y-2">
            {importedGames.map((game) => (
              <div key={game.id} className="p-3 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'white' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-online">线上</span>
                    <span className="text-sm">{game.start_time}</span>
                  </div>
                  <div className="text-xs">
                    {game.players.map((gp, i) => (
                      <span key={i}>
                        <span className="font-medium">{gp.player.nickname}</span>
                        <span style={{ color: gp.score && gp.score > 0 ? '#2d9d78' : '#e74c3c', marginLeft: 4 }}>
                          {gp.score !== null && (gp.score > 0 ? `+${gp.score}` : gp.score)}
                        </span>
                        {i < game.players.length - 1 ? ' / ' : ''}
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

      <Modal open={showCreateRoom} onClose={() => setShowCreateRoom(false)} title="新建线上场">
        <form onSubmit={(e) => { void handleCreateOnlineRoom(e); }}>
          <div className="form-group">
            <label className="form-label">房间名称 *</label>
            <input name="name" className="form-input" required placeholder="如：周六友人线上" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">地点/备注</label>
            <input name="location" className="form-input" placeholder="默认可留空，将记为 线上" />
          </div>
          <div className="form-group">
            <label className="form-label">场次时间</label>
            <input name="session_time" type="datetime-local" className="form-input" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCreateRoom(false)}>取消</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={roomCreateLoading}>
              {roomCreateLoading ? '创建中' : '创建'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showBindModal}
        onClose={() => setShowBindModal(false)}
        title={bindContext ? `绑定雀士 - ${bindContext.nickname} (UID: ${bindContext.uid})` : '绑定'}
      >
        <form
          onSubmit={(e) => { void handleCreatePlayerAndBind(e); }}
          className="p-3 rounded-xl mb-4"
          style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <UserPlus size={16} style={{ color: 'var(--color-primary-dark)' }} />
            <span className="text-sm font-bold">没有该选手？快速新建</span>
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
            称呼默认可用牌谱昵称；创建后会自动把当前 UID 记到该雀士档案。
          </p>
          <div className="form-group mb-2">
            <label className="form-label text-xs">雀士称呼 *</label>
            <input
              className="form-input"
              value={newPlayerNickname}
              onChange={(e) => setNewPlayerNickname(e.target.value)}
              placeholder="显示名称"
              maxLength={100}
            />
          </div>
          <div className="form-group mb-3">
            <label className="form-label text-xs">真实姓名（选填）</label>
            <input
              className="form-input"
              value={newPlayerRealName}
              onChange={(e) => setNewPlayerRealName(e.target.value)}
              placeholder="可空"
              maxLength={50}
            />
          </div>
          <button
            type="submit"
            className="btn btn-sm btn-primary w-full"
            disabled={createPlayerLoading}
          >
            {createPlayerLoading ? '创建中…' : '创建并绑定此 UID'}
          </button>
        </form>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-light)' }}>或选择已有雀士</p>
        <SearchBar
          query={playerQuery}
          onQueryChange={(q) => {
            setPlayerQuery(q);
            getPlayers(q).then(setAllPlayers);
          }}
          placeholder="搜索雀士..."
        />
        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
          {allPlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              onClick={() => selectPlayerForBind(p)}
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
