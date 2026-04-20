import { useEffect, useState } from 'react';
import { getAllYakumans } from '@/api/games';
import { Sparkles } from 'lucide-react';
import type { HandRecord } from '@/types';
import YakumanCard from '@/components/YakumanCard';

export default function YakumanListPage() {
  const [records, setRecords] = useState<HandRecord[]>([]);

  useEffect(() => {
    getAllYakumans().then(setRecords).catch(() => setRecords([]));
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
        <Sparkles size={20} style={{ color: '#e65100' }} /> 役满列表
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-light)' }}>全部役满记录 ({records.length})</p>

      {records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p className="text-sm">暂无役满记录</p>
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
