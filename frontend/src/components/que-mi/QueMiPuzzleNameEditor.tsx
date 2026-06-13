import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, X } from 'lucide-react';
import { renamePuzzle } from '@/api/queMi';

export interface QueMiPuzzleNameEditorProps {
  puzzleId: string;
  name: string;
  onRenamed: (name: string) => void;
  className?: string;
}

export function QueMiPuzzleNameEditor({ puzzleId, name, onRenamed, className = '' }: QueMiPuzzleNameEditorProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(name);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(name);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(t('queMiOnline.nameRequired'));
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await renamePuzzle(puzzleId, trimmed);
      onRenamed(updated.name);
      setEditing(false);
    } catch {
      setError(t('queMiOnline.renameFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className={`space-y-1 ${className}`}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input text-sm flex-1 min-w-[12rem]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={100}
            autoFocus
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') cancelEdit();
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm p-1.5"
            disabled={saving}
            onClick={() => void save()}
            aria-label={t('common.save')}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm p-1.5"
            disabled={saving}
            onClick={cancelEdit}
            aria-label={t('common.cancel')}
          >
            <X size={14} />
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <span className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
        {name}
      </span>
      <button
        type="button"
        className="shrink-0 p-1 rounded-md hover:bg-black/5"
        onClick={startEdit}
        aria-label={t('queMiOnline.rename')}
        title={t('queMiOnline.rename')}
      >
        <Pencil size={14} style={{ color: 'var(--color-text-light)' }} />
      </button>
    </div>
  );
}
