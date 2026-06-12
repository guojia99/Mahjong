import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { useTranslation } from 'react-i18next';
import {
  getPlayers, createPlayer, deletePlayer, updatePlayer,
  bindPlayerAccount, enablePlayerAccount, updatePlayerAccount, resetPlayerSystemPassword,
  setPlayerPassword, addMajsoulAccount, deleteMajsoulAccount, getMajsoulAccounts,
} from '@/api/players';
import { generateRandomPassword } from '@/utils/randomPassword';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import SearchBar from '@/components/SearchBar';
import { getUnboundUsers } from '@/api/users';
import type { Player, PlayerAccount, UnboundUser, MajsoulAccount } from '@/types';
import { Plus, Edit2, Trash2, Link as LinkIcon, KeyRound } from 'lucide-react';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';
import ViewModeToggle, { useViewMode } from '@/components/ViewModeToggle';

const visiblePasswordClass = 'form-input font-mono select-all';

function PasswordFieldWithGenerate({
  name,
  value,
  onChange,
  label,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="flex gap-2">
        <input
          name={name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${visiblePasswordClass} flex-1 min-w-0`}
          minLength={6}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn btn-outline btn-sm shrink-0"
          onClick={() => onChange(generateRandomPassword())}
        >
          {t('players.generatePassword')}
        </button>
      </div>
      <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{t('players.passwordVisibleHint')}</p>
    </div>
  );
}

function PlayerRowActions({
  onAccount,
  onMajsoul,
  onEdit,
  onDelete,
}: {
  onAccount: () => void;
  onMajsoul: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className="btn btn-sm btn-outline inline-flex items-center gap-1" onClick={onAccount}>
        <KeyRound size={14} />
        {t('players.accountTitle')}
      </button>
      <button type="button" className="btn btn-sm btn-outline inline-flex items-center gap-1" onClick={onMajsoul}>
        <LinkIcon size={14} />
        {t('players.btnMajsoul')}
      </button>
      <button type="button" className="btn btn-sm btn-outline inline-flex items-center gap-1" onClick={onEdit}>
        <Edit2 size={14} />
        {t('common.edit')}
      </button>
      <button type="button" className="btn btn-sm btn-danger inline-flex items-center gap-1" onClick={onDelete}>
        <Trash2 size={14} />
        {t('common.delete')}
      </button>
    </div>
  );
}

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
  const [accountModal, setAccountModal] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useViewMode('admin-players-view', 'card');
  const [createPassword, setCreatePassword] = useState('');
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
    loadPlayerAvatarsForList(playerIds, { signal, skipCache: true }).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [playerIds]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const nickname = (form.elements.namedItem('nickname') as HTMLInputElement).value;
    const real_name = (form.elements.namedItem('real_name') as HTMLInputElement).value;
    const avatarInput = (form.elements.namedItem('avatar_file') as HTMLInputElement);
    const enable_account = (form.elements.namedItem('enable_account') as HTMLInputElement).checked;
    const email = (form.elements.namedItem('account_email') as HTMLInputElement).value;
    const password = createPassword;
    const is_admin = (form.elements.namedItem('account_is_admin') as HTMLInputElement).checked;
    if (!nickname.trim()) return;
    setLoading(true);
    try {
      let avatar = '';
      if (avatarInput.files && avatarInput.files[0]) {
        avatar = await fileToBase64(avatarInput.files[0]);
      }
      await createPlayer({
        nickname, real_name, avatar,
        enable_account,
        email: email || undefined,
        password: password || undefined,
        is_admin,
      });
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
        <div className="flex items-center gap-2">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {t('players.addPlayer')}
          </button>
        </div>
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
      ) : viewMode === 'table' ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)' }}>
                <th className="p-3">{t('players.nicknameLabel')}</th>
                <th className="p-3">{t('players.realNameLabel')}</th>
                <th className="p-3">{t('resetPassword.email')}</th>
                <th className="p-3">UID</th>
                <th className="p-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {(playerAvatars[player.id] || player.avatar) ? (
                        <img src={playerAvatars[player.id] || player.avatar} alt="" className="avatar w-8 h-8" />
                      ) : (
                        <div className="avatar-placeholder w-8 h-8 text-xs">{player.nickname.charAt(0)}</div>
                      )}
                      <span className="font-medium">{player.nickname}</span>
                    </div>
                  </td>
                  <td className="p-3">{player.real_name || '—'}</td>
                  <td className="p-3 text-xs">{player.account?.has_account ? (player.account.email || '—') : t('players.noAccount')}</td>
                  <td className="p-3 text-xs font-mono">{player.majsoul_uids?.join(', ') || '—'}</td>
                  <td className="p-3">
                    <PlayerRowActions
                      onAccount={() => setAccountModal(player)}
                      onMajsoul={() => setUidModal(player)}
                      onEdit={() => setEditingPlayer(player)}
                      onDelete={() => handleDelete(player.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <div className="flex flex-col gap-1.5 shrink-0">
                <PlayerRowActions
                  onAccount={() => setAccountModal(player)}
                  onMajsoul={() => setUidModal(player)}
                  onEdit={() => setEditingPlayer(player)}
                  onDelete={() => handleDelete(player.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreatePassword(''); }} title={t('players.addModalTitle')}>
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
          <label className="flex items-center gap-2 text-sm mb-2">
            <input name="enable_account" type="checkbox" />
            {t('players.enableAccount')}
          </label>
          <div className="form-group">
            <label className="form-label">{t('resetPassword.email')}</label>
            <input name="account_email" type="email" className="form-input" />
          </div>
          <PasswordFieldWithGenerate
            name="account_password"
            value={createPassword}
            onChange={setCreatePassword}
            label={t('login.password')}
          />
          <label className="flex items-center gap-2 text-sm mb-4">
            <input name="account_is_admin" type="checkbox" />
            {t('users.isAdmin')}
          </label>
          <div className="flex gap-3 justify-end">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowCreate(false); setCreatePassword(''); }}>{t('common.cancel')}</button>
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

      <Modal open={!!accountModal} onClose={() => setAccountModal(null)} title={t('players.accountModalTitle')}>
        {accountModal && (
          <AccountModalContent
            player={accountModal}
            onClose={() => { setAccountModal(null); loadPlayers(); }}
          />
        )}
      </Modal>
    </div>
  );
}

function AccountModalContent({
  player,
  onClose,
}: {
  player: Player;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<PlayerAccount | undefined>(player.account);
  const [enableMode, setEnableMode] = useState<'create' | 'bind'>('create');
  const [unboundUsers, setUnboundUsers] = useState<UnboundUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [enablePassword, setEnablePassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    if (enableMode !== 'bind' || account?.has_account) return;
    let cancelled = false;
    getUnboundUsers()
      .then((list) => {
        if (!cancelled) setUnboundUsers(list);
      })
      .catch(() => {
        if (!cancelled) showToast(t('players.loadUnboundUsersFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [enableMode, account?.has_account, showToast, t]);

  const handleEnable = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const is_admin = (form.elements.namedItem('is_admin') as HTMLInputElement).checked;
    setLoading(true);
    try {
      const updated = await enablePlayerAccount(player.id, { email, password: enablePassword || undefined, is_admin });
      setAccount(updated);
      showToast(t('players.accountEnabled'), 'success');
      onClose();
    } catch {
      showToast(t('players.accountEnableFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const is_admin = (form.elements.namedItem('is_admin') as HTMLInputElement).checked;
    const is_active = (form.elements.namedItem('is_active') as HTMLInputElement).checked;
    setLoading(true);
    try {
      const updated = await updatePlayerAccount(player.id, { email, is_admin, is_active });
      setAccount(updated);
      showToast(t('players.accountUpdated'), 'success');
    } catch {
      showToast(t('players.accountUpdateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (adminPassword.length < 6) {
      showToast(t('players.passwordTooShort'));
      return;
    }
    if (!confirm(t('players.setPasswordConfirm', { name: player.nickname }))) return;
    setLoading(true);
    try {
      const updated = await setPlayerPassword(player.id, adminPassword);
      setAccount(updated);
      setAdminPassword('');
      showToast(t('players.passwordSet'), 'success');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('players.passwordSetFailed');
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSystemPassword = async () => {
    if (!account?.email?.trim()) {
      showToast(t('players.emailRequiredForReset'));
      return;
    }
    if (!confirm(t('users.resetSystemPasswordConfirm', { name: player.nickname }))) return;
    try {
      const updated = await resetPlayerSystemPassword(player.id);
      setAccount(updated);
      showToast(t('players.systemPasswordReset'), 'success');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('users.resetSystemPasswordFailed');
      showToast(msg);
    }
  };

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      showToast(t('players.selectUserRequired'));
      return;
    }
    setLoading(true);
    try {
      const updated = await bindPlayerAccount(player.id, Number(selectedUserId));
      setAccount(updated);
      showToast(t('players.accountBound'), 'success');
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('players.accountBindFailed');
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const hasEmail = Boolean(account?.email?.trim());

  if (!account?.has_account) {
    return (
      <div>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            className={`btn btn-sm flex-1 ${enableMode === 'create' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setEnableMode('create')}
          >
            {t('players.enableAccountCreate')}
          </button>
          <button
            type="button"
            className={`btn btn-sm flex-1 ${enableMode === 'bind' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setEnableMode('bind')}
          >
            {t('players.enableAccountBind')}
          </button>
        </div>

        {enableMode === 'create' ? (
          <form onSubmit={handleEnable}>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-light)' }}>{t('players.accountEnableHint')}</p>
            <div className="form-group">
              <label className="form-label">{t('resetPassword.email')}</label>
              <input name="email" type="email" className="form-input" required />
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{t('players.adminSetEmailHint')}</p>
            </div>
            <PasswordFieldWithGenerate
              name="password"
              value={enablePassword}
              onChange={setEnablePassword}
              label={t('login.password')}
            />
            <label className="flex items-center gap-2 text-sm mb-4">
              <input name="is_admin" type="checkbox" />
              {t('users.isAdmin')}
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>{t('players.enableAccount')}</button>
          </form>
        ) : (
          <form onSubmit={handleBind}>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-light)' }}>{t('players.accountBindHint')}</p>
            {unboundUsers.length === 0 ? (
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-light)' }}>{t('players.noUnboundUsers')}</p>
            ) : (
              <div className="form-group">
                <label className="form-label">{t('players.selectExistingUser')}</label>
                <select
                  className="form-input"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  required
                >
                  <option value="">{t('players.selectUserPlaceholder')}</option>
                  {unboundUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                      {u.email ? ` · ${u.email}` : ''}
                      {u.is_admin ? ` · ${t('users.isAdmin')}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || unboundUsers.length === 0}
            >
              {t('players.bindAccount')}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleUpdate}>
      <div className="form-group">
        <label className="form-label">{t('login.username')}</label>
        <input name="username" className="form-input" defaultValue={account.username || player.nickname} disabled />
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-light)' }}>{t('players.loginWithNicknameHint')}</p>
      <div className="form-group">
        <label className="form-label">{t('resetPassword.email')}</label>
        <input name="email" type="email" className="form-input" defaultValue={account.email || ''} required />
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{t('players.adminSetEmailHint')}</p>
      </div>
      <div className="form-group">
        <label className="form-label">{t('users.systemPasswordTitle')}</label>
        {account.has_system_password && account.system_password ? (
          <div className="p-3 rounded-lg bg-pink-50 font-mono text-sm break-all select-all">{account.system_password}</div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>{t('players.noSystemPassword')}</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm mb-2">
        <input name="is_admin" type="checkbox" defaultChecked={account.is_admin} />
        {t('users.isAdmin')}
      </label>
      <label className="flex items-center gap-2 text-sm mb-2">
        <input name="is_active" type="checkbox" defaultChecked={account.is_active !== false} />
        {t('users.active')}
      </label>
      {!hasEmail && (
        <p className="text-xs mb-3 text-orange-600">{t('players.emailRequiredForReset')}</p>
      )}
      <PasswordFieldWithGenerate
        name="admin_password"
        value={adminPassword}
        onChange={setAdminPassword}
        label={t('players.setPassword')}
      />
      <div className="flex flex-col gap-2">
        <button type="submit" className="btn btn-primary w-full" disabled={loading}>{t('common.save')}</button>
        <button
          type="button"
          className="btn btn-outline w-full"
          onClick={handleSetPassword}
          disabled={loading || adminPassword.length < 6}
        >
          {t('players.setPassword')}
        </button>
        <button
          type="button"
          className="btn btn-outline w-full"
          onClick={handleResetSystemPassword}
          disabled={!hasEmail}
        >
          {t('users.resetSystemPassword')}
        </button>
      </div>
    </form>
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
