import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { deletePuzzle, getMyPuzzles } from '@/api/queMi';
import { isLoggedIn } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import { QueMiPuzzleListCard } from '@/components/que-mi/QueMiPuzzleListCard';
import type { QueMiPuzzleListItem } from '@/types/queMi';

export default function QueMiMyPuzzlesPage() {
  const { t } = useTranslation();
  const { showToast, ToastComponent } = useToast();
  const [items, setItems] = useState<QueMiPuzzleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getMyPuzzles({ signal });
      if (!signal?.aborted) setItems(data);
    } catch (e) {
      if (!isAbortError(e)) {
        // ignore
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useAbortableEffect((signal) => {
    load(signal);
  }, [load]);

  const handleDelete = async (e: React.MouseEvent, item: QueMiPuzzleListItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.play_count > 0) return;
    if (!window.confirm(t('queMiOnline.deleteConfirm'))) return;
    setDeletingId(item.id);
    try {
      await deletePuzzle(item.id);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
      showToast(t('queMiOnline.deleteSuccess'), 'success');
    } catch {
      showToast(t('queMiOnline.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/que-mi/online" className="btn btn-sm btn-outline inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            {t('queMiOnline.back')}
          </Link>
          <div className="flex items-center gap-2">
            <Lightbulb size={20} style={{ color: 'var(--color-primary)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
              {t('queMiOnline.myPuzzlesTitle')}
            </h1>
          </div>
        </div>
        <Link to="/que-mi/online/create" className="btn btn-primary btn-sm inline-flex items-center gap-1">
          <Plus size={14} />
          {t('queMiOnline.create')}
        </Link>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center text-sm space-y-3"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
        >
          <p>{t('queMiOnline.myPuzzlesEmpty')}</p>
          <Link to="/que-mi/online/create" className="btn btn-primary btn-sm inline-flex items-center gap-1">
            <Plus size={14} />
            {t('queMiOnline.create')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <QueMiPuzzleListCard
              key={item.id}
              item={item}
              href={`/que-mi/online/${item.id}`}
              subtitle={`${t(`queMi.handMode.${item.puzzle.handMode}`)} · ${item.created_at.slice(0, 10)}${
                item.puzzle.shanten != null ? ` · ${t('queMi.shanten')} ${item.puzzle.shanten}` : ''
              }`}
              trailing={
                item.play_count === 0 ? (
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"
                    disabled={deletingId === item.id}
                    onClick={(e) => void handleDelete(e, item)}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
