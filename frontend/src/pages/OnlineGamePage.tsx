import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { importOnlineGame, parseOnlineGameBatch, getRooms, createRoom, getRoom, retryOnlineGame, getAllGames, type OnlineParseItem } from '@/api/games';
import { getPlayers, createPlayer, addMajsoulAccount, deletePlayer } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/Modal';
import SearchBar from '@/components/SearchBar';
import type { Player, Room, Game } from '@/types';
import { ROOM_TYPE_LABELS } from '@/types';
import { ExternalLink, Link2, AlertTriangle, Download, Home, ListOrdered, UserPlus, Trash2, RefreshCw, CheckSquare, Square } from 'lucide-react';

type RowState = {
  id: string;
  /** 用户粘贴的原始一行（用于与规范化后的 URL 对照） */
  original_line: string;
  source_url: string;
  ok: boolean;
  data?: OnlineParseItem;
  error?: string;
  bindings: Record<number, string>;
  /** 系统中是否已有相同牌谱 URL 的线上对局 */
  duplicate_in_db?: boolean;
  /** 本批粘贴中是否与前文某行 URL 相同（规范化后） */
  duplicate_in_batch?: boolean;
  /** 与已有或本批重复的牌谱默认不导入，需用户勾选后才允许导入 */
  import_selected: boolean;
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = iso.includes('T') ? iso : iso.replace(' ', 'T');
  return t.length >= 16 ? t.slice(0, 16) : t;
}

function toNaiveISO(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 从当前雀士列表构建 UID → 雀士 id（列表接口含 majsoul_uids） */
function buildUidToPlayerIdMap(players: Player[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const pl of players) {
    for (const u of pl.majsoul_uids ?? []) {
      if (!m.has(u)) m.set(u, pl.id);
    }
  }
  return m;
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
    { id: string; source_url: string; start_time: string; end_time: string; players: { player: { nickname: string }; score: number | null }[] }[]
  >([]);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomCreateLoading, setRoomCreateLoading] = useState(false);

  const [showBindModal, setShowBindModal] = useState(false);
  const [showBatchBindModal, setShowBatchBindModal] = useState(false);
  const resumeBatchAfterSingleBind = useRef(false);
  const [bindContext, setBindContext] = useState<{ uid: number; nickname: string } | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
  const [newPlayerRealName, setNewPlayerRealName] = useState('');
  const [createPlayerLoading, setCreatePlayerLoading] = useState(false);
  const [paipuOpenUrl, setPaipuOpenUrl] = useState<string | null>(null);
  /** 全量雀士（用于解析后按 UID 预填绑定、展示已关联头像昵称） */
  const [playersDirectory, setPlayersDirectory] = useState<Player[]>([]);

  // ===== 重新获取牌谱信息 =====
  const [showRetrySection, setShowRetrySection] = useState(false);
  const [onlineGames, setOnlineGames] = useState<Game[]>([]);
  const [onlineGamesLoaded, setOnlineGamesLoaded] = useState(false);
  const [selectedRetryIds, setSelectedRetryIds] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState({ current: 0, total: 0 });
  const [retryResults, setRetryResults] = useState<{ gameId: string; ok: boolean; error?: string; start_time?: string; end_time?: string }[]>([]);

  const { showToast, ToastComponent } = useToast();
  const { t } = useTranslation();

  const refreshPlayersDirectory = useCallback(async () => {
    const list = await getPlayers();
    setPlayersDirectory(list);
    setAllPlayers(list);
  }, []);

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

  /** 多局里同一 UID 只出现一次；任一局未绑则视为待绑 */
  const unboundUidList = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of rows) {
      if (!row.ok || !row.data) continue;
      for (const p of row.data.players) {
        if (!row.bindings[p.uid] && !m.has(p.uid)) m.set(p.uid, p.nickname);
      }
    }
    return [...m.entries()].map(([uid, nickname]) => ({ uid, nickname })).sort((a, b) => a.uid - b.uid);
  }, [rows]);

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
      showToast(t('online.onlineRoomCreated'), 'success');
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
      showToast(t('online.selectRoomFirst'), 'error');
      return;
    }
    const lines = urlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast(t('online.pasteAtLeastOne'), 'error');
      return;
    }

    setParsing(true);
    setParseError('');
    try {
      const playersList = await getPlayers();
      setPlayersDirectory(playersList);
      setAllPlayers(playersList);
      const uidToPlayerId = buildUidToPlayerIdMap(playersList);

      const { results } = await parseOnlineGameBatch(lines);
      const seenNorm = new Set<string>();
      const next: RowState[] = results.map((r, idx) => {
        const orig = lines[idx] ?? '';
        const rid = crypto.randomUUID();
        if (r.ok && r.data) {
          const b: Record<number, string> = {};
          for (const p of r.data.players) {
            const fromApi = p.player_id ? String(p.player_id) : '';
            const fromList = uidToPlayerId.get(p.uid);
            const pid = fromApi || fromList;
            if (pid) b[p.uid] = pid;
          }
          const norm = r.source_url;
          const duplicate_in_batch = seenNorm.has(norm);
          if (!duplicate_in_batch) seenNorm.add(norm);
          const duplicate_in_db = r.duplicate_in_db;
          const anyDup = duplicate_in_batch || duplicate_in_db;
          return {
            id: rid,
            original_line: orig,
            source_url: norm,
            ok: true,
            data: r.data,
            bindings: b,
            duplicate_in_db,
            duplicate_in_batch,
            import_selected: !anyDup,
          };
        }
        return {
          id: rid,
          original_line: orig,
          source_url: (r as { source_url: string }).source_url,
          ok: false,
          error: (r as { error?: string }).error || t('online.parseFailed'),
          bindings: {},
          import_selected: false,
        };
      });
      setRows(next);
      const anyUnbound = next.some(
        (row) => row.ok && row.data && row.data.players.some((p) => !row.bindings[p.uid])
      );
      if (anyUnbound) {
        setShowBatchBindModal(true);
      } else {
        setShowBatchBindModal(false);
      }
      showToast(t('online.parsedCount', { ok: next.filter((x) => x.ok).length, total: next.length }), 'success');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
         || (err instanceof Error ? err.message : t('online.parseFailed'));
      setParseError(msg);
      setRows([]);
      showToast(msg, 'error');
    } finally {
      setParsing(false);
    }
  };

  /** 同一雀魂 UID 在列表中多局复用时，一次绑定会写入所有出现该局 UID 的对局行 */
  const setBindingForUid = (uid: number, playerId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (!row.ok || !row.data) return row;
        if (!row.data.players.some((p) => p.uid === uid)) return row;
        return { ...row, bindings: { ...row.bindings, [uid]: playerId } };
      }),
    );
  };

  const closeBindModal = useCallback(() => {
    setShowBindModal(false);
    if (resumeBatchAfterSingleBind.current) {
      resumeBatchAfterSingleBind.current = false;
      setShowBatchBindModal(true);
    }
  }, []);

  const openBindModal = (uid: number, nickname: string, options?: { fromBatch?: boolean }) => {
    if (options?.fromBatch) {
      resumeBatchAfterSingleBind.current = true;
      setShowBatchBindModal(false);
    } else {
      resumeBatchAfterSingleBind.current = false;
    }
    setBindContext({ uid, nickname });
    setNewPlayerNickname(nickname);
    setNewPlayerRealName('');
    void refreshPlayersDirectory();
    setShowBindModal(true);
  };

  const selectPlayerForBind = (player: Player) => {
    if (!bindContext) return;
    setBindingForUid(bindContext.uid, player.id);
    void refreshPlayersDirectory();
    closeBindModal();
    showToast(t('online.bound'), 'success');
  };

  const handleCreatePlayerAndBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bindContext) return;
    const nick = newPlayerNickname.trim();
    if (!nick) {
      showToast(t('online.fillNickname'), 'error');
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
          || t('online.uidDuplicate');
        showToast(`${msg}${t('online.uidDuplicateHint')}`, 'error');
        return;
      }
      setBindingForUid(bindContext.uid, created.id);
      await refreshPlayersDirectory();
      closeBindModal();
      showToast(t('online.playerCreated'), 'success');
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

  const allUidsBound = unboundUidList.length === 0;

  const rowTotalOk = (row: RowState): boolean => {
    if (!row.ok || !row.data) return false;
    const sum = row.data.players.reduce((s, p) => s + p.score, 0);
    const need = row.data.player_count === 3 ? 1050 : 1000;
    return sum === need;
  };

  const isDuplicateRow = (row: RowState) =>
    Boolean(row.ok && (row.duplicate_in_db || row.duplicate_in_batch));

  const canImportOne = (row: RowState) =>
    row.ok &&
    allUidsBound &&
    rowAllBound(row) &&
    rowTotalOk(row) &&
    (!isDuplicateRow(row) || row.import_selected);

  const toggleRowImportSelected = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId && r.ok ? { ...r, import_selected: !r.import_selected } : r)),
    );
  };

  /** 从当前解析列表中移除本行（不写入数据库，仅放弃本次录入） */
  const removeParsedRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const canImportAll = () =>
    allUidsBound &&
    rows.length > 0 &&
    rows.filter((r) => r.ok).length > 0 &&
    rows.filter((r) => r.ok).every((r) => canImportOne(r));

  const doImportOne = async (row: RowState, urlsAlreadyImportedInRun: Set<string>) => {
    if (!row.ok || !row.data || !roomId) return;
    if (!canImportOne(row)) return;
    const player_data = row.data.players.map((p, i) => ({
      player_id: row.bindings[p.uid],
      uid: p.uid,
      majsoul_nickname: p.nickname,
      score: p.score,
      is_dealer_start: i === 0,
    }));
    const hasPaipuTime = Boolean(row.data.start_time);
    const st = hasPaipuTime ? toNaiveISO(row.data.start_time) : (effectiveStartTime ? toNaiveISO(effectiveStartTime) : null);
    const et = row.data.end_time ? toNaiveISO(row.data.end_time) : null;
    const seenInRun = urlsAlreadyImportedInRun.has(row.source_url);
    const allow_duplicate_url = seenInRun || Boolean(row.duplicate_in_db);
    const game = await importOnlineGame({
      room_id: roomId,
      source_url: row.source_url,
      player_data,
      game_mode: row.data.game_mode,
      player_count: row.data.player_count,
      paipu_data: row.data.raw_data,
      start_time: st,
      end_time: et,
      allow_duplicate_url,
    });
    urlsAlreadyImportedInRun.add(row.source_url);
    return game;
  };

  const handleImportOne = async (row: RowState) => {
    if (!roomId || !canImportOne(row)) return;
    setImporting(true);
    try {
      const game = await doImportOne(row, new Set<string>());
      if (!game) return;
      setImportedGames((prev) => [
        {
          id: game.id,
          source_url: game.source_url,
          start_time: game.start_time,
          end_time: game.end_time || '',
          players: game.players.map((gp) => ({ player: gp.player, score: gp.score })),
        },
        ...prev,
      ]);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast(t('online.imported1'), 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('online.importFailed');
      showToast(msg, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleImportAll = async () => {
    if (!canImportAll() || !roomId) return;
    setImporting(true);
    const doneIds = new Set<string>();
    const urlsInRun = new Set<string>();
    let n = 0;
    try {
      for (const row of rows) {
        if (row.ok && canImportOne(row)) {
          const game = await doImportOne(row, urlsInRun);
          if (game) {
            doneIds.add(row.id);
            n += 1;
            setImportedGames((prev) => [
              {
                id: game.id,
                source_url: game.source_url,
                start_time: game.start_time,
                end_time: game.end_time || '',
                players: game.players.map((gp) => ({ player: gp.player, score: gp.score })),
              },
              ...prev,
            ]);
          }
        }
      }
      setRows((prev) => prev.filter((r) => !doneIds.has(r.id)));
      showToast(t('online.importedN', { n }), 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('online.importFailed');
      showToast(msg, 'error');
    } finally {
      setImporting(false);
    }
  };

  // ===== 重新获取牌谱信息 =====
  const loadOnlineGames = useCallback(async () => {
    try {
      const games = await getAllGames({ game_type: 'online' });
      setOnlineGames(games.filter((g) => g.source_url));
    } catch {
      showToast(t('online.loadOnlineGamesFailed'), 'error');
    } finally {
      setOnlineGamesLoaded(true);
    }
  }, []);

  const handleToggleRetrySection = () => {
    const next = !showRetrySection;
    setShowRetrySection(next);
    if (next && !onlineGamesLoaded) {
      void loadOnlineGames();
    }
  };

  const toggleRetrySelect = (gameId: string) => {
    setSelectedRetryIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  };

  const toggleRetrySelectAll = () => {
    const allIds = onlineGames.map((g) => g.id);
    if (selectedRetryIds.size === allIds.length) {
      setSelectedRetryIds(new Set());
    } else {
      setSelectedRetryIds(new Set(allIds));
    }
  };

  const handleRetryAll = async () => {
    if (selectedRetryIds.size === 0) {
      showToast(t('online.selectGameFirst'), 'error');
      return;
    }
    const ids = [...selectedRetryIds];
    setRetrying(true);
    setRetryProgress({ current: 0, total: ids.length });
    setRetryResults([]);
    let success = 0;
    let fail = 0;
    for (let i = 0; i < ids.length; i++) {
      const gameId = ids[i];
      try {
        const updated = await retryOnlineGame(gameId);
        setRetryResults((prev) => [...prev, { gameId, ok: true, start_time: updated.start_time, end_time: updated.end_time || '' }]);
        success++;
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '获取失败';
        setRetryResults((prev) => [...prev, { gameId, ok: false, error: msg }]);
        fail++;
      }
      setRetryProgress({ current: i + 1, total: ids.length });
    }
    setRetrying(false);
    showToast(`${t('online.retryComplete')}${success} ${t('online.retrySuccess')}，${fail} 失败`, success > 0 ? 'success' : 'error');
    void loadOnlineGames();
  };

  return (
    <div>
      {ToastComponent}

      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ListOrdered size={18} style={{ color: 'var(--color-primary-dark)' }} />
            <h3 className="font-bold">{t('online.step1Title')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/rooms" className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }}>
              <Home size={14} /> {t('online.roomManagement')}
            </Link>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowCreateRoom(true)}>
              {t('online.newOnlineRoom')}
            </button>
          </div>
        </div>
        <div className="form-group mb-0">
          <label className="form-label">{t('online.currentRoom')}</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="form-input flex-1"
              value={roomId}
              onChange={(e) => setRoomAndQuery(e.target.value)}
            >
              <option value="">{t('online.selectRoom')}</option>
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
            {t('online.location')}{roomDetail.location || '—'}
            {roomDetail.session_time && ` · ${t('online.sessionTime')}${roomDetail.session_time}`}
          </p>
        )}
        <div className="form-group mt-4">
          <label className="form-label">{t('online.defaultTimeLabel')}</label>
          <input
            type="datetime-local"
            className="form-input max-w-md"
            value={startTimeOverride || toDatetimeLocalValue(roomDetail?.session_time) || ''}
            onChange={(e) => setStartTimeOverride(e.target.value)}
            disabled={!roomId}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
            {t('online.defaultTimeHint')}
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 size={18} style={{ color: 'var(--color-primary-dark)' }} />
          <h3 className="font-bold">{t('online.step2Title')}</h3>
        </div>
        <p className="text-sm mb-2" style={{ color: 'var(--color-text-light)' }}>
          {t('online.pasteHint')}
          {t('online.dupHint')}
        </p>
        <textarea
          className="form-input w-full font-mono text-sm"
          rows={8}
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder="雀魂牌谱 :https://game.maj-soul.com/1/?paipu=...
https://game.maj-soul.com/1/?paipu=..."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!roomId || parsing} onClick={() => { void parseBatch(); }}>
            {parsing ? t('online.parsing') : t('online.parseAll')}
          </button>
        </div>
      </div>

      {/* ===== 重新获取牌谱信息 ===== */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <RefreshCw size={18} style={{ color: 'var(--color-primary-dark)' }} />
            <h3 className="font-bold">{t('online.step3Title')}</h3>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => { void handleToggleRetrySection(); }}
          >
            {showRetrySection ? '收起' : '展开'}
          </button>
        </div>
        <p className="text-sm mb-0" style={{ color: 'var(--color-text-light)' }}>
          {t('online.retryHint')}
        </p>
      </div>

      {showRetrySection && (
        <div className="card mb-6">
          {!onlineGamesLoaded ? (
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>加载中...</p>
          ) : onlineGames.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>{t('online.noOnlineGames')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline inline-flex items-center gap-1"
                    onClick={toggleRetrySelectAll}
                  >
                    {selectedRetryIds.size === onlineGames.length ? <CheckSquare size={14} /> : <Square size={14} />}
                    {selectedRetryIds.size === onlineGames.length ? t('online.deselectAll') : t('online.selectAll')}
                  </button>
                  <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                    {t('online.selectedCount')} {selectedRetryIds.size} / {onlineGames.length} 局
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setOnlineGamesLoaded(false);
                      void loadOnlineGames();
                    }}
                    disabled={retrying || !onlineGamesLoaded}
                  >
                    {t('online.refreshList')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary inline-flex items-center gap-1"
                    disabled={retrying || selectedRetryIds.size === 0 || !onlineGamesLoaded}
                    onClick={() => { void handleRetryAll(); }}
                  >
                    <RefreshCw size={14} />
                    {retrying ? `${t('online.fetching')} (${retryProgress.current}/${retryProgress.total})` : t('online.startFetch')}
                  </button>
                </div>
              </div>

              {retrying && (
                <div className="mb-4">
                  <div className="w-full rounded-full overflow-hidden" style={{ height: '0.5rem', background: '#e5e7eb' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: retryProgress.total > 0 ? `${(retryProgress.current / retryProgress.total) * 100}%` : '0%',
                        background: 'var(--color-primary)',
                      }}
                    />
                  </div>
                  <div className="text-xs mt-1 text-right" style={{ color: 'var(--color-text-light)' }}>
                    {retryProgress.current} / {retryProgress.total}
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {onlineGames.map((game) => {
                  const isSelected = selectedRetryIds.has(game.id);
                  const retryResult = retryResults.find((r) => r.gameId === game.id);
                  return (
                    <div
                      key={game.id}
                      className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                      style={{
                        border: '1px solid var(--color-border)',
                        background: isSelected ? 'var(--color-primary-light)' : 'white',
                      }}
                      onClick={() => { if (!retrying) toggleRetrySelect(game.id); }}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 flex-shrink-0"
                        checked={isSelected}
                        onChange={() => toggleRetrySelect(game.id)}
                        disabled={retrying}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{game.start_time}</span>
                          {game.end_time && (
                            <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>~ {game.end_time}</span>
                          )}
                          <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                            {game.game_mode === 'east_wind' ? '东风' : '半庄'} / {game.player_count}人
                          </span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                          {game.players.map((p: import('@/types').GamePlayerInfo, i: number) => (
                            <span key={p.player.id}>
                              {p.player.nickname}
                              {p.score !== null && (
                                <span style={{ color: p.score > 0 ? '#2d9d78' : '#e74c3c', marginLeft: 2 }}>
                                  {p.score > 0 ? `+${p.score}` : p.score}
                                </span>
                              )}
                              {i < game.players.length - 1 ? ' / ' : ''}
                            </span>
                          ))}
                        </div>
                        {game.source_url && (
                          <div className="text-xs font-mono mt-1 truncate" style={{ color: 'var(--color-text-light)' }}>
                            {game.source_url}
                          </div>
                        )}
                      </div>
                      {retryResult && (
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs px-2 py-1 rounded-lg" style={{
                            background: retryResult.ok ? '#e8f8f0' : '#fde8e8',
                            color: retryResult.ok ? '#2d9d78' : '#e74c3c',
                          }}>
                            {retryResult.ok ? 'OK' : retryResult.error || '失败'}
                          </div>
                          {retryResult.ok && retryResult.start_time && (
                            <div className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
                              {retryResult.start_time}
                              {retryResult.end_time ? ` ~ ${retryResult.end_time}` : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {parseError && (
        <div className="card mb-6">
          <div
            className="p-3 rounded-xl flex items-start gap-2 text-sm"
            style={{ background: '#fde8e8', border: '1px solid #f5c6c6', color: '#c0392b' }}
          >
            <AlertTriangle size={16} className="flex-shrink-0" style={{ marginTop: 2 }} />
            <div>
              <div className="font-medium">{t('online.parseFailed')}</div>
              <div className="mt-1" style={{ color: '#e74c3c' }}>{parseError}</div>
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h3 className="font-bold m-0">{t('online.parseResultTitle')}</h3>
            {unboundUidList.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-sm px-2 py-1 rounded-lg"
                  style={{ background: '#fff3e0', color: '#b45309', border: '1px solid #fed7aa' }}
                >
                  {t('online.unboundUidCount')} {unboundUidList.length} {t('online.unboundUidSuffix')}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    void refreshPlayersDirectory();
                    setShowBatchBindModal(true);
                  }}
                >
                  {t('online.openBindWindow')}
                </button>
              </div>
            )}
          </div>
          {unboundUidList.length > 0 && (
            <div
              className="p-3 rounded-xl mb-4 text-sm"
              style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412' }}
            >
              {t('online.bindInstruction')}
            </div>
          )}
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-light)' }}>
            {t('online.removeUnusedHint')}
          </p>
          <div className="space-y-4">
            {rows.map((row) => {
              if (!row.ok) {
                return (
                  <div
                    key={row.id}
                    className="p-3 rounded-xl"
                    style={{ background: '#fde8e8', border: '1px solid #f5c6c6' }}
                  >
                    <div className="flex justify-end mb-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline inline-flex items-center gap-1"
                        style={{ fontSize: '0.6875rem' }}
                        onClick={() => removeParsedRow(row.id)}
                        title={t('online.removeFromList')}
                      >
                        <Trash2 size={14} /> 移除
                      </button>
                    </div>
                    <div className="text-sm font-mono break-all opacity-80">{row.original_line || row.source_url || '(空行)'}</div>
                    <div className="text-sm mt-1">{row.error}</div>
                  </div>
                );
              }
              const d = row.data!;
              const exp = d.player_count === 3 ? 1050 : 1000;
              const sum = d.players.reduce((s, p) => s + p.score, 0);
              const dup = isDuplicateRow(row);
              return (
                <div
                  key={row.id}
                  className="p-3 rounded-xl"
                  style={{ border: '1px solid var(--color-border)', background: 'white' }}
                >
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline inline-flex items-center gap-1"
                      style={{ fontSize: '0.6875rem' }}
                      onClick={() => removeParsedRow(row.id)}
                      title={t('online.removeFromListTitle')}
                    >
                      <Trash2 size={14} /> 移除
                    </button>
                  </div>
                  {row.original_line && row.original_line.trim() !== row.source_url.trim() && (
                    <div className="text-xs mb-1 rounded px-2 py-1" style={{ background: '#f3f4f6', color: 'var(--color-text-light)' }}>
                      {t('online.originalLine')}{row.original_line}
                    </div>
                  )}
                  <div className="text-xs font-mono break-all mb-2" style={{ color: 'var(--color-text-light)' }}>{row.source_url}</div>
                  {dup && (
                    <div
                      className="text-xs mb-2 p-2 rounded-lg flex items-start gap-2"
                      style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412' }}
                    >
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <div>
                        {row.duplicate_in_db && <div>{t('online.dupInDb')}</div>}
                        {row.duplicate_in_batch && <div>{t('online.dupInBatch')}</div>}
                        <div className="mt-1">{t('online.dupImportHint')}</div>
                      </div>
                    </div>
                  )}
                  <div className="text-sm mb-2">
                    {t('online.mode')} {d.game_mode === 'east_wind' ? '东风' : '半庄'} / {d.player_count} 人 · {t('online.scoreSum')} {sum} / {exp}
                    {sum === exp ? ' ✓' : ' ✗'}
                    {d.start_time && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--color-text-light)' }}>
                        {t('online.time')} {d.start_time}{d.end_time ? ` ~ ${d.end_time}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {d.players.map((p) => {
                      const bound = Boolean(row.bindings[p.uid]);
                      const boundPid = row.bindings[p.uid];
                      const boundPlayer = boundPid ? playersDirectory.find((pl) => pl.id === boundPid) : undefined;
                      return (
                        <div
                          key={p.uid}
                          className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg"
                          style={{ background: bound ? '#e8f8f0' : '#fff3e0' }}
                        >
                          <div className="text-sm min-w-0 flex-1">
                            <span className="font-medium">{p.nickname}</span>
                            <span className="text-xs ml-2" style={{ color: 'var(--color-text-light)' }}>UID {p.uid}</span>
                            <span className="ml-2" style={{ color: p.score > 0 ? '#2d9d78' : '#e74c3c' }}>{p.score > 0 ? `+${p.score}` : p.score}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                            {bound && boundPlayer && (
                              <div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.75)', border: '1px solid var(--color-border)' }}>
                                {boundPlayer.avatar ? (
                                  <img
                                    src={boundPlayer.avatar}
                                    alt=""
                                    className="rounded-full object-cover flex-shrink-0"
                                    style={{ width: '1.75rem', height: '1.75rem' }}
                                  />
                                ) : (
                                  <div
                                    className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{
                                      width: '1.75rem',
                                      height: '1.75rem',
                                      background: 'var(--color-primary-light)',
                                      color: 'var(--color-primary-dark)',
                                    }}
                                  >
                                    {boundPlayer.nickname.charAt(0)}
                                  </div>
                                )}
                                <div className="text-left min-w-0">
                                  <div className="text-sm font-medium truncate" style={{ maxWidth: '8rem' }}>{boundPlayer.nickname}</div>
                                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t('online.systemPlayer')}</div>
                                </div>
                              </div>
                            )}
                            {bound && !boundPlayer && (
                              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t('online.boundLoading')}</span>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => openBindModal(p.uid, p.nickname)}
                            >
                              {bound ? t('online.changeBind') : t('online.bindPlayer')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {dup && (
                    <label className="mt-2 flex items-start gap-2 cursor-pointer text-sm select-none">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={row.import_selected}
                        onChange={() => toggleRowImportSelected(row.id)}
                      />
                      <span style={{ color: 'var(--color-text)' }}>{t('online.importThis')}</span>
                    </label>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={importing || !canImportOne(row)}
                      onClick={() => { void handleImportOne(row); }}
                    >
                      <Download size={14} /> {t('online.importOne')}
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
                {t('online.importAll')}
              </button>
            </div>
          )}
        </div>
      )}

      {importedGames.length > 0 && (
        <div className="card">
          <h3 className="font-bold mb-3">{t('online.importedTitle')} ({importedGames.length})</h3>
          <div className="space-y-2">
            {importedGames.map((game) => (
              <div key={game.id} className="p-3 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'white' }}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-online">线上</span>
                      <span className="text-sm">
                        {game.start_time}{game.end_time ? ` ~ ${game.end_time}` : ''}
                      </span>
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
                  <button
                    type="button"
                    className="text-xs mt-1 inline-flex items-center gap-1"
                    style={{ color: 'var(--color-secondary-dark)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => setPaipuOpenUrl(game.source_url.trim())}
                  >
                    <ExternalLink size={10} /> {t('online.viewPaipu')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={Boolean(paipuOpenUrl)} onClose={() => setPaipuOpenUrl(null)} title={t('online.openMajsoulPaipuTitle')}>
        <p className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>{t('online.openExternalConfirm')}</p>
        {paipuOpenUrl && (
          <p className="text-xs font-mono break-all mb-4 p-2 rounded-lg" style={{ background: '#f5f5f5', color: 'var(--color-text-light)' }}>{paipuOpenUrl}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPaipuOpenUrl(null)}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn-primary btn-sm inline-flex items-center gap-1"
            onClick={() => {
              if (paipuOpenUrl) window.open(paipuOpenUrl, '_blank', 'noopener,noreferrer');
              setPaipuOpenUrl(null);
            }}
          >
            <ExternalLink size={14} /> 打开
          </button>
        </div>
      </Modal>

      <Modal open={showCreateRoom} onClose={() => setShowCreateRoom(false)} title={t('online.createOnlineRoomTitle')}>
        <form onSubmit={(e) => { void handleCreateOnlineRoom(e); }}>
          <div className="form-group">
            <label className="form-label">{t('online.roomNameLabel')}</label>
            <input name="name" className="form-input" required placeholder={t('online.roomNamePlaceholder')} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">{t('online.locationLabel')}</label>
            <input name="location" className="form-input" placeholder={t('online.locationPlaceholder')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('online.sessionTimeLabel')}</label>
            <input name="session_time" type="datetime-local" className="form-input" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCreateRoom(false)}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={roomCreateLoading}>
              {roomCreateLoading ? t('online.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showBatchBindModal}
        onClose={() => setShowBatchBindModal(false)}
        title={
          unboundUidList.length > 0
            ? `${t('online.bindPlayer')}（${unboundUidList.length} 个 UID 待关联）`
            : t('online.allBoundTitle')
        }
      >
        {unboundUidList.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            {t('online.allBoundDesc')}
          </p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {unboundUidList.map(({ uid, nickname }) => (
              <li
                key={uid}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl"
                style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}
              >
                <div>
                  <div className="font-medium text-sm">{nickname || t('online.noNickname')}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>UID {uid}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => openBindModal(uid, nickname, { fromBatch: true })}
                >
                  {t('online.goBind')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowBatchBindModal(false)}>
            {t('common.close')}
          </button>
        </div>
      </Modal>

      <Modal
        open={showBindModal}
        onClose={closeBindModal}
        title={bindContext ? `${t('online.bindPlayer')} - ${bindContext.nickname} (UID: ${bindContext.uid})` : t('online.bindPlayer')}
      >
        <form
          onSubmit={(e) => { void handleCreatePlayerAndBind(e); }}
          className="p-3 rounded-xl mb-4"
          style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <UserPlus size={16} style={{ color: 'var(--color-primary-dark)' }} />
            <span className="text-sm font-bold">{t('online.noPlayerQuickCreate')}</span>
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-light)' }}>
            {t('online.quickCreateHint')}
          </p>
          <div className="form-group mb-2">
            <label className="form-label text-xs">{t('online.playerNameLabel')}</label>
            <input
              className="form-input"
              value={newPlayerNickname}
              onChange={(e) => setNewPlayerNickname(e.target.value)}
              placeholder={t('online.playerNamePlaceholder')}
              maxLength={100}
            />
          </div>
          <div className="form-group mb-3">
            <label className="form-label text-xs">{t('online.realNameOptional')}</label>
            <input
              className="form-input"
              value={newPlayerRealName}
              onChange={(e) => setNewPlayerRealName(e.target.value)}
              placeholder={t('online.realNameOptionalPlaceholder')}
              maxLength={50}
            />
          </div>
          <button
            type="submit"
            className="btn btn-sm btn-primary w-full"
            disabled={createPlayerLoading}
          >
            {createPlayerLoading ? t('online.creating') : t('online.createAndBind')}
          </button>
        </form>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-light)' }}>{t('online.orSelectExisting')}</p>
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
