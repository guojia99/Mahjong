import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Gamepad2, Users, TrendingUp, Sparkles, Info, Trophy } from 'lucide-react';
import { getRooms } from '@/api/games';
import { getRecentYakumans } from '@/api/games';
import { getPlayers } from '@/api/players';
import { getRankTiers, getUmaConfigs } from '@/api/ranking';
import type { Room, HandRecord, RankTier, UmaConfig } from '@/types';
import YakumanCard from '@/components/YakumanCard';
import RankTierBadge from '@/components/RankTierBadge';

export default function HomePage() {
  const { t } = useTranslation();
  const [openRooms, setOpenRooms] = useState<Room[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [totalGames, setTotalGames] = useState(0);
  const [recentYakumans, setRecentYakumans] = useState<HandRecord[]>([]);
  const [tiers, setTiers] = useState<RankTier[]>([]);
  const [umaConfigs, setUmaConfigs] = useState<UmaConfig[]>([]);
  const [showRules, setShowRules] = useState(false);

  const loadData = async () => {
    try {
      const [rooms, players, t, u] = await Promise.all([
        getRooms({ status: 'open' }),
        getPlayers(),
        getRankTiers(),
        getUmaConfigs(),
      ]);
      setOpenRooms(rooms);
      setPlayerCount(players.length);
      setTiers(t);
      setUmaConfigs(u);
      const allRooms = await getRooms();
      const games = allRooms.reduce((sum, r) => sum + r.game_count, 0);
      setTotalGames(games);
      const recent = await getRecentYakumans(5);
      setRecentYakumans(recent);
    } catch {
      // silently handle
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, []);

  const stats = [
    { label: t('home.playerCount'), value: playerCount, icon: Users, color: 'var(--color-primary)' },
    { label: t('home.openRooms'), value: openRooms.length, icon: Gamepad2, color: 'var(--color-secondary)' },
    { label: t('home.totalGames'), value: totalGames, icon: TrendingUp, color: 'var(--color-accent)' },
  ];

  return (
    <div>
      <style>{`
        @keyframes huntianGlow {
          from { filter: brightness(1); }
          to { filter: brightness(1.15); }
        }
      `}</style>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>{t('home.welcome')}</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>{t('home.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `${stat.color}20` }}
              >
                <Icon size={22} style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mb-6">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setShowRules(!showRules)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span className="font-bold flex items-center gap-2">
            <Info size={16} style={{ color: 'var(--color-primary)' }} /> {t('home.rankingRuleTitle')}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
            {showRules ? t('home.collapse') : t('home.expand')}
          </span>
        </button>

        {showRules && (
          <div className="mt-4 space-y-4">
            <div>
              <h4 className="font-bold mb-2 text-sm">{t('home.rankingRuleHeader')}</h4>
              <div className="text-xs space-y-1" style={{ color: 'var(--color-text-light)', lineHeight: 1.8 }}>
                <p>{t('home.rankingRule1')}</p>
                <p>
                  {t('home.rankingRuleFormulaLabel')}
                  <code style={{ background: '#f5f5f5', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                    (终局分 - 返点) / 10 + 马点 + 打点分 - 扣点分
                  </code>
                </p>
                <p>{t('home.rankingRuleDajiang')}</p>
                <p>{t('home.rankingRulePenalty')}</p>
                <p>{t('home.rankingRuleProtection')}</p>
                <p>{t('home.rankingRuleOverflow')}</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-2 text-sm">{t('home.tierTable')}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('home.tierCol')}</th>
                      <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('home.initialScoreCol')}</th>
                      <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('home.promotionPtCol')}</th>
                      <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('home.dajiangScoreCol')}</th>
                      <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('home.fourthPenaltyCol')}</th>
                      <th className="text-center py-2 px-2 font-semibold" style={{ color: 'var(--color-text-light)' }}>{t('home.protectionCol')}</th>
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
              <div>
                <h4 className="font-bold mb-2 text-sm">{t('home.umaConfigTitle')}</h4>
                <div className="space-y-3">
                  {umaConfigs.map((config) => (
                    <div key={config.id} className="p-3 rounded-xl" style={{ background: '#f9f9f9' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-xs">{config.name}</span>
                        {config.is_active && (
                          <span className="badge badge-open" style={{ fontSize: '0.5rem', padding: '0.0625rem 0.375rem' }}>{t('common.enabled')}</span>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs">
                        <div>
                           <span style={{ color: 'var(--color-text-light)' }}>{t('home.returnPoint')}</span>
                           <span className="font-mono font-semibold">{config.base_score}</span>
                         </div>
                         <div>
                           <span style={{ color: 'var(--color-text-light)' }}>{t('home.uma1st')}</span>
                           <span className="font-mono" style={{ color: '#2d9d78' }}>+{config.uma_1st}</span>
                         </div>
                         <div>
                           <span style={{ color: 'var(--color-text-light)' }}>{t('home.uma2nd')}</span>
                           <span className="font-mono" style={{ color: '#2d9d78' }}>+{config.uma_2nd}</span>
                         </div>
                         <div>
                           <span style={{ color: 'var(--color-text-light)' }}>{t('home.uma3rd')}</span>
                          <span className="font-mono" style={{ color: config.uma_3rd < 0 ? '#e74c3c' : '#2d9d78' }}>
                            {config.uma_3rd > 0 ? '+' : ''}{config.uma_3rd}
                          </span>
                        </div>
                        {config.player_count === 4 && (
                          <div>
                             <span style={{ color: 'var(--color-text-light)' }}>{t('home.uma4th')}</span>
                            <span className="font-mono" style={{ color: '#e74c3c' }}>{config.uma_4th}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Link to="/ranking" className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--color-primary-dark)' }}>
                <Trophy size={14} /> {t('home.viewRanking')}
              </Link>
            </div>
          </div>
        )}
      </div>

      {openRooms.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t('home.openRoomsTitle')}</h3>
            <Link to="/rooms" className="text-sm font-medium" style={{ color: 'var(--color-primary-dark)' }}>
              {t('home.viewAll')}
            </Link>
          </div>
          <div className="space-y-2">
            {openRooms.slice(0, 5).map((room) => (
              <Link
                key={room.id}
                to={`/rooms/${room.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div>
                  <div className="font-medium">{room.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                    {room.location || t('home.locationNotSet')} · {room.player_count}人
                  </div>
                </div>
                <span className="badge badge-open">{t('roomStatus.open')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentYakumans.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Sparkles size={16} style={{ color: '#e65100' }} /> {t('home.recentYakumans')}
            </h3>
            <Link to="/yakumans" className="text-sm font-medium" style={{ color: '#e65100' }}>
              {t('home.viewAll')}
            </Link>
          </div>
          <div className="space-y-3">
            {recentYakumans.map((yr) => (
              <YakumanCard key={yr.id} record={yr} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
