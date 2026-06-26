import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LeagueMatch } from '@/types';
import { getLeagueMatchTimeInfo } from '@/utils/sortLeagueMatches';

export default function LeagueMatchTimeLabel({
    match,
    className = '',
    compact = false,
}: {
    match: LeagueMatch;
    className?: string;
    compact?: boolean;
}) {
    const { t } = useTranslation();
    const timeInfo = getLeagueMatchTimeInfo(match);
    if (!timeInfo) return null;

    const label = timeInfo.isGameTime
        ? t('league.matchGameTime')
        : t('league.matchRecordedTime');

    if (compact) {
        return (
            <span
                className={`inline-flex items-center gap-1 text-xs tabular-nums ${className}`}
                style={{ color: 'var(--color-text-light)' }}
                title={`${label}: ${timeInfo.text}`}
            >
                <Clock size={11} className="flex-shrink-0 opacity-70" aria-hidden />
                <span>{timeInfo.text}</span>
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${className}`}>
            <Clock size={12} className="flex-shrink-0 opacity-70" aria-hidden />
            <span className="opacity-75">{label}</span>
            <span className="font-medium">{timeInfo.text}</span>
        </span>
    );
}
