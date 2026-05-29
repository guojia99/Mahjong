import { useState } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { getAllYakumans } from '@/api/games';
import { Sparkles } from 'lucide-react';
import type { HandRecord } from '@/types';
import { HAND_RECORD_TYPE_LABELS } from '@/types';
import YakumanCard from '@/components/YakumanCard';
import { useTranslation } from 'react-i18next';

const SELECT_STYLE: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.75rem',
  borderRadius: '0.5rem',
  border: '2px solid var(--color-border)',
  background: 'white',
  color: 'var(--color-text)',
  outline: 'none',
  cursor: 'pointer',
};

export default function YakumanListPage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<HandRecord[]>([]);

  const TYPE_OPTIONS = [
    { value: '', label: t('yakumanList.typeAll') },
    { value: 'yakuman', label: t('yakumanList.typeYakuman') },
    { value: 'yakuman_confirmed', label: t('yakumanList.typeConfirmed') },
    { value: 'yakuman_chance', label: t('yakumanList.typeChance') },
  ];
  const [typeFilter, setTypeFilter] = useState('');

  useAbortableEffect((signal) => {
    getAllYakumans(typeFilter || undefined, { signal })
      .then(setRecords)
      .catch((e) => {
        if (isAbortError(e)) return;
        setRecords([]);
      });
  }, [typeFilter]);

  const typeLabel = typeFilter ? HAND_RECORD_TYPE_LABELS[typeFilter] : '';

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
        <Sparkles size={20} style={{ color: '#e65100' }} /> {t('yakumanList.title')}
      </h2>
      <div className="flex items-center gap-3 mb-6">
        <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
          {typeLabel ? `${typeLabel}${t('yakumanList.recordLabel')}` : t('yakumanList.allRecords')} ({records.length})
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={SELECT_STYLE}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p className="text-sm">{t('yakumanList.noRecords')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((yr) => (
            <YakumanCard key={yr.id} record={yr} showPlayer showLink />
          ))}
        </div>
      )}
    </div>
  );
}
