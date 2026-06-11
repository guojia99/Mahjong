import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Table } from 'lucide-react';

export type ViewMode = 'card' | 'table';

export function useViewMode(storageKey: string, defaultMode: ViewMode = 'card'): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === 'table' || saved === 'card' ? saved : defaultMode;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, mode);
  }, [storageKey, mode]);

  return [mode, setMode];
}

export default function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
          mode === 'card' ? 'bg-pink-50 text-pink-600' : 'bg-white text-gray-500 hover:bg-gray-50'
        }`}
        onClick={() => onChange('card')}
        title={t('viewMode.card')}
      >
        <LayoutGrid size={14} />
        {t('viewMode.card')}
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors border-l ${
          mode === 'table' ? 'bg-pink-50 text-pink-600' : 'bg-white text-gray-500 hover:bg-gray-50'
        }`}
        style={{ borderColor: 'var(--color-border)' }}
        onClick={() => onChange('table')}
        title={t('viewMode.table')}
      >
        <Table size={14} />
        {t('viewMode.table')}
      </button>
    </div>
  );
}
