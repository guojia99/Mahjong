import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Ban, Plus } from 'lucide-react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { adminListPuzzles, adminPatchPuzzle, addBlacklist, listBlacklist, removeBlacklist } from '@/api/queMi';
import { useToast } from '@/hooks/useToast';
import type { QueMiBlacklistEntry, QueMiPuzzleListItem } from '@/types/queMi';

export default function QueMiAdminPage() {
  const { t } = useTranslation();
  const { showToast, ToastComponent } = useToast();
  const [tab, setTab] = useState<'puzzles' | 'blacklist'>('puzzles');
  const [puzzles, setPuzzles] = useState<QueMiPuzzleListItem[]>([]);
  const [blacklist, setBlacklist] = useState<QueMiBlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');

  const loadPuzzles = useCallback(async () => {
    const data = await adminListPuzzles();
    setPuzzles(data);
  }, []);

  const loadBlacklist = useCallback(async () => {
    const data = await listBlacklist();
    setBlacklist(data);
  }, []);

  useAbortableEffect((signal) => {
    (async () => {
      try {
        await Promise.all([loadPuzzles(), loadBlacklist()]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();
  }, [loadPuzzles, loadBlacklist]);

  const toggleDisabled = async (item: QueMiPuzzleListItem) => {
    try {
      await adminPatchPuzzle(item.id, { is_disabled: !item.is_disabled });
      await loadPuzzles();
      showToast(t('queMiAdmin.saveSuccess'), 'success');
    } catch {
      showToast(t('queMiAdmin.saveFailed'));
    }
  };

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    try {
      await addBlacklist({ username: username.trim() });
      setUsername('');
      await loadBlacklist();
      showToast(t('queMiAdmin.blacklistAdded'), 'success');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || t('queMiAdmin.blacklistAddFailed'));
    }
  };

  const handleRemoveBlacklist = async (userId: number) => {
    if (!confirm(t('queMiAdmin.blacklistRemoveConfirm'))) return;
    try {
      await removeBlacklist(userId);
      await loadBlacklist();
      showToast(t('queMiAdmin.blacklistRemoved'), 'success');
    } catch {
      showToast(t('queMiAdmin.blacklistRemoveFailed'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'var(--color-text-light)' }}>
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ToastComponent}
      <div className="flex items-center gap-2">
        <Shield size={20} style={{ color: 'var(--color-primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
          {t('queMiAdmin.title')}
        </h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm"
          style={{
            background: tab === 'puzzles' ? 'var(--color-primary-light)' : 'transparent',
            color: tab === 'puzzles' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
            border: tab === 'puzzles' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('puzzles')}
        >
          {t('queMiAdmin.puzzlesTab')}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          style={{
            background: tab === 'blacklist' ? 'var(--color-primary-light)' : 'transparent',
            color: tab === 'blacklist' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
            border: tab === 'blacklist' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('blacklist')}
        >
          {t('queMiAdmin.blacklistTab')}
        </button>
      </div>

      {tab === 'puzzles' ? (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50" style={{ color: 'var(--color-text-light)' }}>
                <th className="text-left p-3">{t('queMiAdmin.creator')}</th>
                <th className="text-left p-3">{t('queMi.selectType')}</th>
                <th className="text-left p-3">{t('queMi.selectDifficulty')}</th>
                <th className="text-right p-3">{t('queMiAdmin.plays')}</th>
                <th className="text-right p-3">{t('queMiAdmin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {puzzles.map((item) => (
                <tr key={item.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="p-3">{item.creator_name}</td>
                  <td className="p-3">{t(`queMi.type.${item.puzzle.type}`)}</td>
                  <td className="p-3">{t(`queMi.difficulty.${item.puzzle.difficulty}`)}</td>
                  <td className="p-3 text-right tabular-nums">{item.play_count}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline mr-2"
                      onClick={() => toggleDisabled(item)}
                    >
                      {item.is_disabled ? t('queMiAdmin.enable') : t('queMiAdmin.disable')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={handleAddBlacklist} className="flex flex-wrap gap-2 items-end">
            <label className="flex-1 min-w-[200px]">
              <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--color-text-light)' }}>
                {t('queMiAdmin.username')}
              </span>
              <input
                className="input w-full"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('queMiAdmin.usernamePlaceholder')}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm inline-flex items-center gap-1">
              <Plus size={14} />
              {t('queMiAdmin.addBlacklist')}
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50" style={{ color: 'var(--color-text-light)' }}>
                  <th className="text-left p-3">{t('queMiAdmin.username')}</th>
                  <th className="text-left p-3">{t('queMiOnline.player')}</th>
                  <th className="text-left p-3">{t('queMiAdmin.addedAt')}</th>
                  <th className="text-right p-3">{t('queMiAdmin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {blacklist.map((row) => (
                  <tr key={row.user_id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="p-3">{row.username}</td>
                    <td className="p-3">{row.nickname || '—'}</td>
                    <td className="p-3">{row.created_at.slice(0, 10)}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline text-red-600 inline-flex items-center gap-1"
                        onClick={() => handleRemoveBlacklist(row.user_id)}
                      >
                        <Ban size={14} />
                        {t('queMiAdmin.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {blacklist.length === 0 && (
              <p className="p-6 text-center text-sm" style={{ color: 'var(--color-text-light)' }}>
                {t('queMiAdmin.blacklistEmpty')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
