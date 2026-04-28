import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';

interface Props {
  player: Player;
  size?: 'sm' | 'md';
  showScore?: boolean;
  score?: number | null;
  isDealer?: boolean;
  onClick?: () => void;
  removable?: boolean;
  onRemove?: () => void;
}

export default function PlayerCard({
  player,
  size = 'md',
  showScore,
  score,
  isDealer,
  onClick,
  removable,
  onRemove,
}: Props) {
  const { t } = useTranslation();
  const isSmall = size === 'sm';

  return (
    <div
      className={`flex items-center gap-3 p-${isSmall ? '2' : '3'} rounded-xl transition-all duration-150 ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      style={{
        background: isDealer ? '#fff8e8' : 'white',
        border: isDealer ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
      onClick={onClick}
    >
      {player.avatar ? (
        <img src={player.avatar} alt={player.nickname} className={isSmall ? 'avatar' : 'avatar'} style={isSmall ? { width: '2rem', height: '2rem' } : {}} />
      ) : (
        <div className={isSmall ? 'avatar-placeholder' : 'avatar-placeholder'} style={isSmall ? { width: '2rem', height: '2rem', fontSize: '0.75rem' } : {}}>
          {player.nickname.charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold truncate ${isSmall ? 'text-sm' : ''}`}>{player.nickname}</span>
          {isDealer && (
            <span className="badge" style={{ background: '#fff3e0', color: '#e68a00', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
              {t('wind.east')}
            </span>
          )}
        </div>
        {player.real_name && (
          <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{player.real_name}</div>
        )}
      </div>
      {showScore && score !== null && score !== undefined && (
        <div
          className={`font-bold ${isSmall ? 'text-sm' : 'text-lg'}`}
          style={{ color: score > 0 ? '#2d9d78' : score < 0 ? '#e74c3c' : 'var(--color-text)' }}
        >
          {score > 0 ? `+${score}` : score}
        </div>
      )}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
          style={{ fontSize: '0.75rem' }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
