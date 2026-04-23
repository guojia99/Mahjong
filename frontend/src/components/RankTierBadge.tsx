import type { RankTier } from '@/types';

interface RankTierBadgeProps {
  tier: RankTier;
  score?: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function RankTierBadge({ tier, score, showScore = true, size = 'md' }: RankTierBadgeProps) {
  const isDanShen = tier.level_order >= 10 && tier.level_order <= 14;
  const isHuntian = tier.level_order >= 15;

  const sizeMap = {
    sm: { padding: '0.125rem 0.5rem', fontSize: '0.625rem', iconSize: 12 },
    md: { padding: '0.25rem 0.75rem', fontSize: '0.75rem', iconSize: 16 },
    lg: { padding: '0.5rem 1rem', fontSize: '0.875rem', iconSize: 20 },
  };

  const s = sizeMap[size];

  if (isHuntian) {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-bold rounded-lg text-white"
        style={{
          padding: s.padding,
          fontSize: s.fontSize,
          background: tier.bg_gradient || tier.bg_color,
          boxShadow: '0 0 12px rgba(243,156,18,0.6), 0 0 24px rgba(231,76,60,0.3)',
          animation: 'huntianGlow 2s ease-in-out infinite alternate',
        }}
      >
        <span style={{ fontSize: `${s.iconSize}px` }}>&#x2726;</span>
        {tier.name}
        {showScore && score !== undefined && (
          <span style={{ opacity: 0.9, marginLeft: '0.25rem' }}>{Math.round(score)}</span>
        )}
      </span>
    );
  }

  if (isDanShen) {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-bold rounded-lg text-white"
        style={{
          padding: s.padding,
          fontSize: s.fontSize,
          background: tier.bg_gradient || tier.bg_color,
          boxShadow: `0 2px 8px ${tier.bg_color}60`,
        }}
      >
        <span style={{ fontSize: `${s.iconSize}px` }}>&#x2694;</span>
        {tier.name}
        {showScore && score !== undefined && (
          <span style={{ opacity: 0.85, marginLeft: '0.25rem' }}>{Math.round(score)}</span>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 font-semibold rounded-lg"
      style={{
        padding: s.padding,
        fontSize: s.fontSize,
        background: `${tier.bg_color}18`,
        color: tier.bg_color,
        border: `1.5px solid ${tier.bg_color}50`,
      }}
    >
      {tier.name}
      {showScore && score !== undefined && (
        <span style={{ opacity: 0.75, marginLeft: '0.25rem' }}>{Math.round(score)}</span>
      )}
    </span>
  );
}
