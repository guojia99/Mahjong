import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, Users, ChevronRight, Sparkles, Clock } from 'lucide-react';
import { getCurrentSeasons, getLeagueSeriesList, getSeriesSeasons } from '@/api/leagues';
import { isAdmin } from '@/api/auth';
import type { LeagueSeason } from '@/types';
import { LEAGUE_SEASON_STATUS_LABELS } from '@/types';

export default function LeaguesPage() {
    const { t } = useTranslation();
    const [currentSeasons, setCurrentSeasons] = useState<LeagueSeason[]>([]);
    const [pastSeasons, setPastSeasons] = useState<LeagueSeason[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPast, setShowPast] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [current, seriesList] = await Promise.all([
                    getCurrentSeasons(),
                    getLeagueSeriesList(),
                ]);
                setCurrentSeasons(current);

                const past: LeagueSeason[] = [];
                for (const s of seriesList) {
                    const seasons = await getSeriesSeasons(s.id);
                    past.push(...seasons.filter(se => !se.is_current && se.status === 'finished'));
                }
                setPastSeasons(past);
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const admin = isAdmin();

    function StatusBadge({ status }: { status: string }) {
        const colors: Record<string, string> = {
            registration: 'bg-blue-100 text-blue-700',
            ongoing: 'bg-green-100 text-green-700',
            finished: 'bg-gray-100 text-gray-500',
        };
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-500'}`}>
                {LEAGUE_SEASON_STATUS_LABELS[status as keyof typeof LEAGUE_SEASON_STATUS_LABELS] || status}
            </span>
        );
    }

    function SeasonCard({ season, highlight }: { season: LeagueSeason; highlight?: boolean }) {
        return (
            <Link
                to={`/leagues/${season.id}`}
                className={`block rounded-2xl border transition-all hover:shadow-lg ${
                    highlight
                        ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 shadow-md'
                        : 'border-gray-100 bg-white hover:border-pink-200'
                }`}
            >
                <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                {highlight && <Sparkles size={16} className="text-amber-500" />}
                                <h3 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>
                                    {season.name}
                                </h3>
                            </div>
                            <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                                {season.series_name}
                            </p>
                        </div>
                        <StatusBadge status={season.status} />
                    </div>
                    <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--color-text-light)' }}>
                        <span className="flex items-center gap-1">
                            <Users size={14} />
                            {season.player_count}{t('common.peopleUnit')}
                        </span>
                        <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {season.stage_count}{t('league.stageUnit')}
                        </span>
                        {season.start_time && (
                            <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {season.start_time.slice(0, 10)}
                            </span>
                        )}
                    </div>
                </div>
            </Link>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center" style={{ color: 'var(--color-text-light)' }}>
                    {t('common.loading')}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
                        <Trophy size={24} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                            {t('league.title')}
                        </h2>
                        <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                            {t('league.subtitle')}
                        </p>
                    </div>
                </div>
                {admin && (
                    <Link
                        to="/league-admin"
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                        style={{ background: 'var(--color-primary)', color: 'white' }}
                    >
                        {t('league.manage')}
                    </Link>
                )}
            </div>

            {currentSeasons.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                        <Sparkles size={18} className="text-amber-500" />
                        {t('league.currentSeason')}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                        {currentSeasons.map(season => (
                            <SeasonCard key={season.id} season={season} highlight />
                        ))}
                    </div>
                </div>
            )}

            {currentSeasons.length === 0 && pastSeasons.length === 0 && (
                <div className="text-center py-16 rounded-2xl border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                    <Trophy size={48} className="mx-auto mb-4 text-gray-300" />
                    <p style={{ color: 'var(--color-text-light)' }}>{t('league.noLeagues')}</p>
                </div>
            )}

            {pastSeasons.length > 0 && (
                <div className="space-y-4">
                    <button
                        onClick={() => setShowPast(!showPast)}
                        className="flex items-center gap-2 text-sm font-medium transition-all"
                        style={{ color: 'var(--color-text-light)' }}
                    >
                        <ChevronRight size={16} className={`transition-transform ${showPast ? 'rotate-90' : ''}`} />
                        {t('league.pastSeasons')} ({pastSeasons.length})
                    </button>
                    {showPast && (
                        <div className="grid gap-4 md:grid-cols-2">
                            {pastSeasons.map(season => (
                                <SeasonCard key={season.id} season={season} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
