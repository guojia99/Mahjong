import { useEffect, useState, useCallback } from 'react';
import { getUmaConfigs, updateUmaConfig, getRankTiers, updateRankTier, recalculateRanking } from '@/api/ranking';
import { useToast } from '@/hooks/useToast';
import type { RankTier, UmaConfig } from '@/types';
import RankTierBadge from '@/components/RankTierBadge';
import { Settings, RefreshCw, Save } from 'lucide-react';

const INPUT_STYLE: React.CSSProperties = {
  padding: '0.375rem 0.5rem',
  fontSize: '0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--color-border)',
  background: 'white',
  outline: 'none',
  width: '100%',
};

export default function RankingAdminPage() {
  const [tab, setTab] = useState<'tiers' | 'uma'>('tiers');
  const [tiers, setTiers] = useState<RankTier[]>([]);
  const [umaConfigs, setUmaConfigs] = useState<UmaConfig[]>([]);
  const [dirty, setDirty] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast, ToastComponent } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([getRankTiers(), getUmaConfigs()]);
      setTiers(t);
      setUmaConfigs(u);
      setDirty(false);
    } catch {
      showToast('加载配置失败');
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleTierChange = (idx: number, field: keyof RankTier, value: string | number | boolean) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
    setDirty(true);
  };

  const handleUmaChange = (idx: number, field: keyof UmaConfig, value: string | number | boolean) => {
    setUmaConfigs((prev) => prev.map((u, i) => (i === idx ? { ...u, [field]: value } : u)));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(tiers.map((t) => updateRankTier(t.id, t)));
      await Promise.all(umaConfigs.map((u) => updateUmaConfig(u.id, u)));
      showToast('保存成功', 'success');
      setDirty(false);
    } catch {
      showToast('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (!confirm('重算将清空所有排位数据并按时间顺序重新结算，确认继续？')) return;
    setRecalculating(true);
    try {
      await recalculateRanking();
      showToast('排位分重算完成', 'success');
    } catch {
      showToast('重算失败');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div>
      {ToastComponent}
      <div className="flex items-center gap-2 mb-6">
        <Settings size={20} style={{ color: 'var(--color-primary)' }} />
        <h2 className="text-lg font-bold">排位配置管理</h2>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <button
          className="btn btn-sm"
          style={{
            background: tab === 'tiers' ? 'var(--color-primary-light)' : 'transparent',
            color: tab === 'tiers' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
            border: tab === 'tiers' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('tiers')}
        >
          段位表
        </button>
        <button
          className="btn btn-sm"
          style={{
            background: tab === 'uma' ? 'var(--color-primary-light)' : 'transparent',
            color: tab === 'uma' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
            border: tab === 'uma' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          }}
          onClick={() => setTab('uma')}
        >
          马点配置
        </button>
        <div className="flex-1" />
        {dirty && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <Save size={14} /> {saving ? '保存中...' : '保存修改'}
          </button>
        )}
        <button
          className="btn btn-sm"
          style={{ background: '#fde8e8', color: '#e74c3c', border: '1px solid #f5c6c6' }}
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          <RefreshCw size={14} style={{ animation: recalculating ? 'spin 1s linear infinite' : 'none' }} />
          {recalculating ? '重算中...' : '一键重算'}
        </button>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      {tab === 'tiers' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th className="text-left py-2 px-2" style={{ color: 'var(--color-text-light)' }}>段位</th>
                <th className="text-center py-2 px-2" style={{ color: 'var(--color-text-light)' }}>顺序</th>
                <th className="text-right py-2 px-2" style={{ color: 'var(--color-text-light)' }}>初始分</th>
                <th className="text-right py-2 px-2" style={{ color: 'var(--color-text-light)' }}>升级pt</th>
                <th className="text-right py-2 px-2" style={{ color: 'var(--color-text-light)' }}>打点分</th>
                <th className="text-right py-2 px-2" style={{ color: 'var(--color-text-light)' }}>四位扣点</th>
                <th className="text-center py-2 px-2" style={{ color: 'var(--color-text-light)' }}>保护</th>
                <th className="text-left py-2 px-2" style={{ color: 'var(--color-text-light)' }}>颜色</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, idx) => (
                <tr key={tier.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className="py-1.5 px-2">
                    <RankTierBadge tier={tier} showScore={false} size="sm" />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={tier.level_order}
                      onChange={(e) => handleTierChange(idx, 'level_order', parseInt(e.target.value))}
                      style={{ ...INPUT_STYLE, width: '3rem', textAlign: 'center' }}
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={tier.initial_score}
                      onChange={(e) => handleTierChange(idx, 'initial_score', parseFloat(e.target.value))}
                      style={{ ...INPUT_STYLE, width: '5rem', textAlign: 'right' }}
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={tier.promotion_score}
                      onChange={(e) => handleTierChange(idx, 'promotion_score', parseFloat(e.target.value))}
                      style={{ ...INPUT_STYLE, width: '5rem', textAlign: 'right' }}
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={tier.dajiang_score}
                      onChange={(e) => handleTierChange(idx, 'dajiang_score', parseFloat(e.target.value))}
                      style={{ ...INPUT_STYLE, width: '5rem', textAlign: 'right' }}
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={tier.fourth_penalty}
                      onChange={(e) => handleTierChange(idx, 'fourth_penalty', parseFloat(e.target.value))}
                      style={{ ...INPUT_STYLE, width: '5rem', textAlign: 'right' }}
                    />
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={tier.is_protected}
                      onChange={(e) => handleTierChange(idx, 'is_protected', e.target.checked)}
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="color"
                      value={tier.bg_color}
                      onChange={(e) => handleTierChange(idx, 'bg_color', e.target.value)}
                      style={{ width: '2rem', height: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '0.25rem', cursor: 'pointer' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'uma' && (
        <div className="space-y-4">
          {umaConfigs.map((config, idx) => (
            <div key={config.id} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-semibold text-sm flex-1">{config.name}</span>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={config.is_active}
                    onChange={(e) => handleUmaChange(idx, 'is_active', e.target.checked)}
                  />
                  启用
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>返点</div>
                  <input
                    type="number"
                    value={config.base_score}
                    onChange={(e) => handleUmaChange(idx, 'base_score', parseFloat(e.target.value))}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>一位马点</div>
                  <input
                    type="number"
                    value={config.uma_1st}
                    onChange={(e) => handleUmaChange(idx, 'uma_1st', parseFloat(e.target.value))}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>二位马点</div>
                  <input
                    type="number"
                    value={config.uma_2nd}
                    onChange={(e) => handleUmaChange(idx, 'uma_2nd', parseFloat(e.target.value))}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>三位马点</div>
                  <input
                    type="number"
                    value={config.uma_3rd}
                    onChange={(e) => handleUmaChange(idx, 'uma_3rd', parseFloat(e.target.value))}
                    style={INPUT_STYLE}
                  />
                </div>
                {config.player_count === 4 && (
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>四位马点</div>
                    <input
                      type="number"
                      value={config.uma_4th}
                      onChange={(e) => handleUmaChange(idx, 'uma_4th', parseFloat(e.target.value))}
                      style={INPUT_STYLE}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <div className="fixed bottom-4 right-4 z-50">
          <button className="btn btn-primary shadow-lg" onClick={handleSave} disabled={saving}>
            <Save size={14} /> {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      )}
    </div>
  );
}
