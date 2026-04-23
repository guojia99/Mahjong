import { useEffect, useState } from 'react';
import { getRankTiers, getUmaConfigs } from '@/api/ranking';
import { useToast } from '@/hooks/useToast';
import type { RankTier, UmaConfig } from '@/types';
import { Info } from 'lucide-react';
import RankTierBadge from '@/components/RankTierBadge';

export default function RankingInfoPage() {
  const [tiers, setTiers] = useState<RankTier[]>([]);
  const [umaConfigs, setUmaConfigs] = useState<UmaConfig[]>([]);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    Promise.all([getRankTiers(), getUmaConfigs()])
      .then(([t, u]) => {
        setTiers(t);
        setUmaConfigs(u);
      })
      .catch(() => showToast('加载排位信息失败'));
  }, [showToast]);

  return (
    <div>
      {ToastComponent}
      <style>{`
        @keyframes huntianGlow {
          from { filter: brightness(1); }
          to { filter: brightness(1.15); }
        }
      `}</style>

      <div className="flex items-center gap-2 mb-6">
        <Info size={20} style={{ color: 'var(--color-primary)' }} />
        <h2 className="text-lg font-bold">排位分说明</h2>
      </div>

      <div className="card mb-6">
        <h3 className="font-bold mb-2 text-sm">计分规则</h3>
        <div className="text-xs space-y-1" style={{ color: 'var(--color-text-light)', lineHeight: 1.8 }}>
          <p>排位分仅记录<b>四麻半庄</b>对局成绩，不分线上线下。</p>
          <p>计算公式：<code style={{ background: '#f5f5f5', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>(终局分 - 返点) / 10 + 马点 + 打点分 - 扣点分</code></p>
          <p>打点分：一位时额外加分（一位且终局分超过450分时再加一次打点分）</p>
          <p>扣点分：四位时根据当前段位扣除额外分数</p>
          <p>入门～雀士段位为保护段，到达后不再掉段</p>
          <p>超过雀神-赤木鬼神境后，从7000分开始完整排位；低于6000分自动回到赤木鬼神境(5000分)</p>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-bold mb-3 text-sm">段位一览</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>段位</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>初始分</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>升级pt</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>打点分</th>
                <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>四位扣点</th>
                <th className="text-center py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>保护</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className="py-2 px-2">
                    <RankTierBadge tier={tier} showScore={false} size="sm" />
                  </td>
                  <td className="text-right py-2 px-2 font-mono">{tier.initial_score}</td>
                  <td className="text-right py-2 px-2 font-mono">{tier.promotion_score || '-'}</td>
                  <td className="text-right py-2 px-2 font-mono">+{tier.dajiang_score}</td>
                  <td className="text-right py-2 px-2 font-mono" style={{ color: tier.fourth_penalty > 0 ? '#e74c3c' : 'inherit' }}>
                    {tier.fourth_penalty > 0 ? `-${tier.fourth_penalty}` : '0'}
                  </td>
                  <td className="text-center py-2 px-2">
                    {tier.is_protected ? (
                      <span className="text-xs" style={{ color: '#2d9d78' }}>&#10003;</span>
                    ) : (
                      <span style={{ color: '#ccc' }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {umaConfigs.length > 0 && (
        <div className="card">
          <h3 className="font-bold mb-3 text-sm">马点配置</h3>
          <div className="space-y-3">
            {umaConfigs.map((config) => (
              <div key={config.id} className="p-3 rounded-xl" style={{ background: '#f9f9f9' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-xs">{config.name}</span>
                  {config.is_active && (
                    <span className="badge badge-open" style={{ fontSize: '0.5rem', padding: '0.0625rem 0.375rem' }}>启用</span>
                  )}
                </div>
                <div className="flex gap-4 text-xs">
                  <div>
                    <span style={{ color: 'var(--color-text-light)' }}>返点：</span>
                    <span className="font-mono font-semibold">{config.base_score}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-light)' }}>一位：</span>
                    <span className="font-mono" style={{ color: '#2d9d78' }}>+{config.uma_1st}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-light)' }}>二位：</span>
                    <span className="font-mono" style={{ color: '#2d9d78' }}>+{config.uma_2nd}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-light)' }}>三位：</span>
                    <span className="font-mono" style={{ color: config.uma_3rd < 0 ? '#e74c3c' : '#2d9d78' }}>
                      {config.uma_3rd > 0 ? '+' : ''}{config.uma_3rd}
                    </span>
                  </div>
                  {config.player_count === 4 && (
                    <div>
                      <span style={{ color: 'var(--color-text-light)' }}>四位：</span>
                      <span className="font-mono" style={{ color: '#e74c3c' }}>{config.uma_4th}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
