import { useEffect, useState, useCallback } from 'react';
import { getPlayers, createPlayer, deletePlayer, updatePlayer, addMajsoulAccount, deleteMajsoulAccount, getMajsoulAccounts } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import SearchBar from '@/components/SearchBar';
import type { Player, MajsoulAccount } from '@/types';
import { Plus, Edit2, Trash2, Link as LinkIcon } from 'lucide-react';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [uidModal, setUidModal] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();

  const loadPlayers = useCallback(async () => {
    try {
      const data = await getPlayers(query);
      setPlayers(data);
    } catch {
      showToast('加载雀士列表失败');
    }
  }, [query, showToast]);

  useEffect(() => {
    void Promise.resolve().then(() => loadPlayers());
  }, [loadPlayers]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const nickname = (form.elements.namedItem('nickname') as HTMLInputElement).value;
    const real_name = (form.elements.namedItem('real_name') as HTMLInputElement).value;
    const avatarInput = (form.elements.namedItem('avatar_file') as HTMLInputElement);
    if (!nickname.trim()) return;
    setLoading(true);
    try {
      let avatar = '';
      if (avatarInput.files && avatarInput.files[0]) {
        avatar = await fileToBase64(avatarInput.files[0]);
      }
      await createPlayer({ nickname, real_name, avatar });
      showToast('雀士创建成功', 'success');
      setShowCreate(false);
      loadPlayers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPlayer) return;
    const form = e.currentTarget;
    const nickname = (form.elements.namedItem('nickname') as HTMLInputElement).value;
    const real_name = (form.elements.namedItem('real_name') as HTMLInputElement).value;
    const avatarInput = (form.elements.namedItem('avatar_file') as HTMLInputElement);
    setLoading(true);
    try {
      let avatar: string | undefined;
      if (avatarInput.files && avatarInput.files[0]) {
        avatar = await fileToBase64(avatarInput.files[0]);
      }
      const payload: { nickname: string; real_name?: string; avatar?: string } = { nickname, real_name };
      if (avatar) payload.avatar = avatar;
      await updatePlayer(editingPlayer.id, payload);
      showToast('雀士更新成功', 'success');
      setEditingPlayer(null);
      loadPlayers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '更新失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该雀士吗？')) return;
    try {
      await deletePlayer(id);
      showToast('雀士已删除', 'success');
      loadPlayers();
    } catch {
      showToast('删除失败');
    }
  };

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <SearchBar query={query} onQueryChange={setQuery} placeholder="搜索雀士..." />
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> 添加雀士
        </button>
      </div>

      {players.length === 0 ? (
        <div className="empty-state card">
          <div style={{ margin: '0 auto 1rem' }}>
            <Users size={48} />
          </div>
          <p>暂无雀士</p>
          <button className="btn btn-outline btn-sm mt-3" onClick={() => setShowCreate(true)}>
            添加第一位雀士
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map((player) => (
            <div key={player.id} className="card flex items-center gap-3">
              {player.avatar ? (
                <img src={player.avatar} alt={player.nickname} className="avatar" />
              ) : (
                <div className="avatar-placeholder">{player.nickname.charAt(0)}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{player.nickname}</div>
                {player.real_name && (
                  <div className="text-xs truncate" style={{ color: 'var(--color-text-light)' }}>
                    {player.real_name}
                  </div>
                )}
                {player.majsoul_uids && player.majsoul_uids.length > 0 && (
                  <div className="text-xs" style={{ color: 'var(--color-secondary-dark)' }}>
                    UID: {player.majsoul_uids.join(', ')}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                  onClick={() => setUidModal(player)}
                  title="管理雀魂账号"
                >
                  <LinkIcon size={14} />
                </button>
                <button
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-500 transition-colors"
                  onClick={() => setEditingPlayer(player)}
                  title="编辑"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
                  onClick={() => handleDelete(player.id)}
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="添加雀士">
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">昵称 *</label>
            <input name="nickname" className="form-input" placeholder="雀士昵称" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">真实姓名</label>
            <input name="real_name" className="form-input" placeholder="选填" />
          </div>
          <div className="form-group">
            <label className="form-label">头像</label>
            <input name="avatar_file" type="file" accept="image/*" className="form-input" />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCreate(false)}>取消</button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">创建</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingPlayer} onClose={() => setEditingPlayer(null)} title="编辑雀士">
        {editingPlayer && (
          <form onSubmit={handleUpdate}>
            <div className="form-group">
              <label className="form-label">昵称 *</label>
              <input name="nickname" className="form-input" defaultValue={editingPlayer.nickname} required />
            </div>
            <div className="form-group">
              <label className="form-label">真实姓名</label>
              <input name="real_name" className="form-input" defaultValue={editingPlayer.real_name} />
            </div>
            <div className="form-group">
              <label className="form-label">头像</label>
              <input name="avatar_file" type="file" accept="image/*" className="form-input" />
              {editingPlayer.avatar && (
                <img src={editingPlayer.avatar} alt="当前头像" className="avatar mt-2" />
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingPlayer(null)}>取消</button>
              <button type="submit" disabled={loading} className="btn btn-primary btn-sm">保存</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!uidModal} onClose={() => setUidModal(null)} title="雀魂账号管理">
        {uidModal && <UidModalContent player={uidModal} onClose={() => { setUidModal(null); loadPlayers(); }} />}
      </Modal>
    </div>
  );
}

function Users({ size }: { size?: number }) {
  return (
    <svg width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function UidModalContent({ player, onClose }: { player: Player; onClose: () => void }) {
  const [accounts, setAccounts] = useState<MajsoulAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    getMajsoulAccounts(player.id).then(setAccounts).catch(() => {});
  }, [player.id]);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const uid = Number((form.elements.namedItem('uid') as HTMLInputElement).value);
    const nickname = (form.elements.namedItem('ms_nickname') as HTMLInputElement).value;
    if (!uid || !nickname.trim()) return;
    setLoading(true);
    try {
      await addMajsoulAccount(player.id, uid, nickname);
      showToast('添加成功', 'success');
      const updated = await getMajsoulAccounts(player.id);
      setAccounts(updated);
      (form.elements.namedItem('uid') as HTMLInputElement).value = '';
      (form.elements.namedItem('ms_nickname') as HTMLInputElement).value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '添加失败';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (accountId: string) => {
    try {
      await deleteMajsoulAccount(accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      showToast('已移除', 'success');
    } catch {
      showToast('移除失败');
    }
  };

  return (
    <>
      {ToastComponent}
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-light)' }}>
        {player.nickname} 的雀魂账号
      </p>
      {accounts.length > 0 && (
        <div className="space-y-2 mb-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#f9f5f2' }}>
              <div>
                <div className="text-sm font-medium">{acc.nickname}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>UID: {acc.uid}</div>
              </div>
              <button className="text-red-400 hover:text-red-500 text-xs" onClick={() => handleRemove(acc.id)}>移除</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd}>
        <div className="form-group">
          <label className="form-label">UID</label>
          <input name="uid" type="number" className="form-input" placeholder="雀魂UID" required />
        </div>
        <div className="form-group">
          <label className="form-label">雀魂昵称</label>
          <input name="ms_nickname" className="form-input" placeholder="雀魂昵称" required />
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>关闭</button>
          <button type="submit" disabled={loading} className="btn btn-primary btn-sm">添加</button>
        </div>
      </form>
    </>
  );
}
