import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { useTranslation } from 'react-i18next';
import { getPlayers, createPlayer, deletePlayer, updatePlayer, addMajsoulAccount, deleteMajsoulAccount, getMajsoulAccounts } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import SearchBar from '@/components/SearchBar';
import type { Player, MajsoulAccount } from '@/types';
import { Plus, Edit2, Trash2, Link as LinkIcon } from 'lucide-react';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PlayersPage() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [uidModal, setUidModal] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();

  const loadPlayers = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getPlayers(query, signal ? { signal } : undefined);
      setPlayers(data);
    } catch (e) {
      if (isAbortError(e)) return;
      showToast(t('players.loadFailed'));
    }
  }, [query, showToast, t]);

  useAbortableEffect((signal) => {
    void loadPlayers(signal);
  }, [loadPlayers]);

  const playerIds = useMemo(() => {
    return [...new Set(players.map((p) => p.id))];
  }, [players]);

  useAbortableEffect((signal) => {
    if (playerIds.length === 0) return;
    loadPlayerAvatarsForList(playerIds, signal).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [playerIds]);

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
      showToast(t('players.createSuccess'), 'success');
      setShowCreate(false);
      loadPlayers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('players.createFailed');
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
      showToast(t('players.updateSuccess'), 'success');
      setEditingPlayer(null);
      loadPlayers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('players.updateFailed');
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('players.deleteConfirm'))) return;
    try {
      await deletePlayer(id);
      showToast(t('players.deleteSuccess'), 'success');
      loadPlayers();
    } catch {
      showToast(t('players.deleteFailed'));
    }
  };

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <SearchBar query={query} onQueryChange={setQuery} placeholder={t('players.searchPlaceholder')} />
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> {t('players.addPlayer')}
        </button>
      </div>

      {players.length === 0 ? (
        <div className="empty-state card">
          <div style={{ margin: '0 auto 1rem' }}>
            <Users size={48} />
          </div>
          <p>{t('players.noPlayers')}</p>
          <button className="btn btn-outline btn-sm mt-3" onClick={() => setShowCreate(true)}>
            {t('players.addFirstPlayer')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map((player) => (
            <div key={player.id} className="card flex items-center gap-3">
              {(playerAvatars[player.id] || player.avatar) ? (
                <img src={playerAvatars[player.id] || player.avatar} alt={player.nickname} className="avatar" />
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
                  title={t('players.manageMajsoulTitle')}
                >
                  <LinkIcon size={14} />
                </button>
                <button
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-500 transition-colors"
                  onClick={() => setEditingPlayer(player)}
                  title={t('players.editTitle')}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
                  onClick={() => handleDelete(player.id)}
                  title={t('players.deleteTitle')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('players.addModalTitle')}>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">{t('players.nicknameLabel')}</label>
            <input name="nickname" className="form-input" placeholder={t('players.nicknamePlaceholder')} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">{t('players.realNameLabel')}</label>
            <input name="real_name" className="form-input" placeholder={t('players.realNamePlaceholder')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('players.avatarLabel')}</label>
            <input name="avatar_file" type="file" accept="image/*" className="form-input" />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">{t('common.create')}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingPlayer} onClose={() => setEditingPlayer(null)} title={t('players.editModalTitle')}>
        {editingPlayer && (
          <form onSubmit={handleUpdate}>
            <div className="form-group">
              <label className="form-label">{t('players.nicknameLabel')}</label>
              <input name="nickname" className="form-input" defaultValue={editingPlayer.nickname} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('players.realNameLabel')}</label>
              <input name="real_name" className="form-input" defaultValue={editingPlayer.real_name} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('players.avatarLabel')}</label>
              <input name="avatar_file" type="file" accept="image/*" className="form-input" />
              {(playerAvatars[editingPlayer.id] || editingPlayer.avatar) && (
                <img src={playerAvatars[editingPlayer.id] || editingPlayer.avatar} alt={t('players.currentAvatar')} className="avatar mt-2" />
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingPlayer(null)}>{t('common.cancel')}</button>
              <button type="submit" disabled={loading} className="btn btn-primary btn-sm">{t('common.save')}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!uidModal} onClose={() => setUidModal(null)} title={t('players.majsoulModalTitle')}>
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
  const { t } = useTranslation();
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
      showToast(t('players.bindAddSuccess'), 'success');
      const updated = await getMajsoulAccounts(player.id);
      setAccounts(updated);
      (form.elements.namedItem('uid') as HTMLInputElement).value = '';
      (form.elements.namedItem('ms_nickname') as HTMLInputElement).value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('players.bindAddFailed');
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (accountId: string) => {
    try {
      await deleteMajsoulAccount(accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      showToast(t('players.bindRemoveSuccess'), 'success');
    } catch {
      showToast(t('players.bindRemoveFailed'));
    }
  };

  return (
    <>
      {ToastComponent}
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-light)' }}>
        {player.nickname}{t('players.majsoulAccountOf')}
      </p>
      {accounts.length > 0 && (
        <div className="space-y-2 mb-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: '#f9f5f2' }}>
              <div>
                <div className="text-sm font-medium">{acc.nickname}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>UID: {acc.uid}</div>
              </div>
              <button className="text-red-400 hover:text-red-500 text-xs" onClick={() => handleRemove(acc.id)}>{t('common.remove')}</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd}>
        <div className="form-group">
          <label className="form-label">UID</label>
          <input name="uid" type="number" className="form-input" placeholder={t('players.uidLabel')} required />
        </div>
        <div className="form-group">
          <label className="form-label">{t('players.majsoulNicknameLabel')}</label>
          <input name="ms_nickname" className="form-input" placeholder={t('players.majsoulNicknamePlaceholder')} required />
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t('common.close')}</button>
          <button type="submit" disabled={loading} className="btn btn-primary btn-sm">{t('common.add')}</button>
        </div>
      </form>
    </>
  );
}
