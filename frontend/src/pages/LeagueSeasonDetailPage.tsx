import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import {
    Trophy, Users, Calendar, Clock, ChevronRight,
    Play, CheckCircle, Settings, BarChart2, Swords,
} from 'lucide-react';
import { getLeagueSeason, getStageRanking, startLeagueSeason, finishLeagueSeason } from '@/api/leagues';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import type { LeagueSeason, LeagueStage, LeagueStagePlayer } from '@/types';
import { LEAGUE_SEASON_STATUS_LABELS, STAGE_STATUS_LABELS, STAGE_TYPE_I18N_KEY, STAGE_TYPE_LABELS } from '@/types';

/** 当前赛段：优先进行中；否则取按顺序最后一个已结束赛段（赛季结束时展示决赛成绩等）。 */
function pickCurrentStage(stages: LeagueStage[]): LeagueStage | null {
    const list = [...stages].sort((a, b) => a.order - b.order);
    const ongoing = list.find(s => s.status === 'ongoing');
    if (ongoing) return ongoing;
    const finished = list.filter(s => s.status === 'finished');
    if (finished.length) return finished[finished.length - 1];
    return null;
}

export default function LeagueSeasonDetailPage() {
    const { t } = useTranslation();
    const { seasonId } = useParams<{ seasonId: string }>();
    const { showToast } = useToast();
    const [season, setSeason] = useState<LeagueSeason | null>(null);
    const [rankingMap, setRankingMap] = useState<Record<string, LeagueStagePlayer[]>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'stages' | 'ranking'>('stages');

    const admin = isAdmin();

    useEffect(() => {
        if (!seasonId) return;
        (async () => {
            try {
                const data = await getLeagueSeason(seasonId);
                setSeason(data);
                if (data.stages) {
                    const map: Record<string, LeagueStagePlayer[]> = {};
                    for (const stage of data.stages) {
                        if (stage.status !== 'pending') {
                            try {
                                map[stage.id] = await getStageRanking(stage.id);
                            } catch { map[stage.id] = []; }
                        }
                    }
                    setRankingMap(map);
                }
            } catch {
                showToast(t('league.loadFailed'));
            } finally {
                setLoading(false);
            }
        })();
    }, [seasonId, t, showToast]);

    const stages = season?.stages ?? [];

    const currentStage = useMemo(() => pickCurrentStage(stages), [stages]);

    const currentStageRows = useMemo(() => {
        if (!currentStage || currentStage.status === 'pending') return [];
        const rows = rankingMap[currentStage.id] ?? [];
        return [...rows].sort((a, b) => {
            const ap = (a.games_played || 0) > 0 ? 0 : 1;
            const bp = (b.games_played || 0) > 0 ? 0 : 1;
            if (ap !== bp) return ap - bp;
            if (b.total_pt !== a.total_pt) return b.total_pt - a.total_pt;
            const aSeed = a.seed_label || '';
            const bSeed = b.seed_label || '';
            if (aSeed !== bSeed) return aSeed.localeCompare(bSeed);
            return (a.player.nickname || '').localeCompare(b.player.nickname || '');
        });
    }, [currentStage, rankingMap]);

    async function handleStartSeason() {
        if (!seasonId) return;
        try {
            const updated = await startLeagueSeason(seasonId);
            setSeason(prev => ({ ...prev, ...updated }));
            showToast(t('league.seasonStarted'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleFinishSeason() {
        if (!seasonId) return;
        try {
            const updated = await finishLeagueSeason(seasonId);
            setSeason(prev => ({ ...prev, ...updated }));
            showToast(t('league.seasonFinished'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    if (loading) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('common.loading')}</div>;
    }

    if (!season) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('league.loadFailed')}</div>;
    }

    const statusColors: Record<string, string> = {
        registration: 'bg-blue-100 text-blue-700',
        ongoing: 'bg-green-100 text-green-700',
        finished: 'bg-gray-100 text-gray-500',
    };
    const stageStatusColors: Record<string, string> = {
        pending: 'bg-gray-100 text-gray-500',
        ongoing: 'bg-green-100 text-green-700',
        finished: 'bg-blue-100 text-blue-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-light)' }}>
                <Link to="/leagues" className="hover:underline">{t('league.title')}</Link>
                <ChevronRight size={14} />
                <span style={{ color: 'var(--color-text)' }}>{season.name}</span>
            </div>

            <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{season.name}</h2>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[season.status]}`}>
                                    {LEAGUE_SEASON_STATUS_LABELS[season.status]}
                                </span>
                            </div>
                            <p className="text-sm mb-3" style={{ color: 'var(--color-text-light)' }}>
                                {season.series_name} · {t('league.seasonNumber', { n: season.season_number })}
                            </p>
                            <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--color-text-light)' }}>
                                <span className="flex items-center gap-1"><Users size={14} /> {season.player_count}{t('common.peopleUnit')}</span>
                                <span className="flex items-center gap-1"><Calendar size={14} /> {season.stage_count}{t('league.stageUnit')}</span>
                                {season.start_time && <span className="flex items-center gap-1"><Clock size={14} /> {season.start_time.slice(0, 10)}</span>}
                            </div>
                        </div>
                        {admin && (
                            <div className="flex gap-2">
                                {season.status === 'registration' && (
                                    <button onClick={handleStartSeason} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-all">
                                        <Play size={14} /> {t('league.startSeason')}
                                    </button>
                                )}
                                {season.status === 'ongoing' && (
                                    <button onClick={handleFinishSeason} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all">
                                        <CheckCircle size={14} /> {t('league.finishSeason')}
                                    </button>
                                )}
                                <Link
                                    to={`/league-admin/seasons/${season.id}`}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:shadow-md"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                                >
                                    <Settings size={14} /> {t('league.manage')}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {season.description && (
                    <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: season.description }} />
                    </div>
                )}

                {currentStage && currentStage.status !== 'pending' && (
                    <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)', background: 'linear-gradient(to bottom, rgba(254, 243, 199, 0.35), transparent)' }}>
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                    <BarChart2 size={20} className="text-amber-600 flex-shrink-0" />
                                    {t('league.currentStageResults')}
                                </h3>
                                <p className="text-sm mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--color-text-light)' }}>
                                    <span className="font-medium" style={{ color: 'var(--color-text)' }}>{currentStage.name}</span>
                                    <span>·</span>
                                    <span>{t(STAGE_TYPE_I18N_KEY[currentStage.stage_type], { defaultValue: STAGE_TYPE_LABELS[currentStage.stage_type] })}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageStatusColors[currentStage.status]}`}>
                                        {STAGE_STATUS_LABELS[currentStage.status]}
                                    </span>
                                </p>
                            </div>
                            <Link
                                to={`/leagues/stage/${currentStage.id}`}
                                className="inline-flex items-center gap-0.5 text-sm font-medium hover:underline flex-shrink-0"
                                style={{ color: 'var(--color-primary-dark, #b45309)' }}
                            >
                                {t('league.viewStageDetail')}
                                <ChevronRight size={16} />
                            </Link>
                        </div>
                        <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-medium w-10" style={{ color: 'var(--color-text-light)' }}>#</th>
                                        <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('league.player')}</th>
                                        <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('league.gamesPlayed')}</th>
                                        <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-light)' }}>PT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentStageRows.map((sp, idx) => {
                                        const notPlayed = (sp.games_played || 0) === 0;
                                        const dimStyle = notPlayed ? { opacity: 0.45 } : undefined;
                                        return (
                                            <tr
                                                key={sp.id}
                                                className="border-t"
                                                style={{ borderColor: 'var(--color-border)', background: notPlayed ? '#fafafa' : undefined }}
                                            >
                                                <td className="px-4 py-2.5 font-bold" style={{
                                                    ...dimStyle,
                                                    color: notPlayed ? 'var(--color-text-light)' :
                                                        idx === 0 ? '#f59e0b' :
                                                        idx === 1 ? '#a0aec0' :
                                                        idx === 2 ? '#cd7f32' :
                                                        'var(--color-text)',
                                                }}>
                                                    {idx + 1}
                                                </td>
                                                <td className="px-4 py-2.5" style={{ ...dimStyle, color: 'var(--color-text)' }}>
                                                    <span className="flex items-center gap-2 flex-wrap">
                                                        {sp.seed_label && (
                                                            <span className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                                                {sp.seed_label}
                                                            </span>
                                                        )}
                                                        {sp.player.nickname}
                                                        {notPlayed && (
                                                            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                                                                {t('league.notPlayedYet')}
                                                            </span>
                                                        )}
                                                        {sp.is_promoted && (
                                                            <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                                                {t('league.promoted')}
                                                            </span>
                                                        )}
                                                        {sp.is_eliminated && (
                                                            <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600">
                                                                {t('league.eliminated')}
                                                            </span>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="text-center px-4 py-2.5" style={{ ...dimStyle, color: 'var(--color-text-light)' }}>
                                                    <span className={sp.is_full ? 'text-green-600' : ''}>
                                                        {sp.games_played}/{sp.games_per_player || currentStage.games_per_player}
                                                    </span>
                                                </td>
                                                <td className="text-right px-4 py-2.5 font-mono font-bold" style={{
                                                    ...dimStyle,
                                                    color: notPlayed
                                                        ? 'var(--color-text-light)'
                                                        : sp.total_pt > 0 ? '#22c55e'
                                                        : sp.total_pt < 0 ? '#ef4444'
                                                        : 'var(--color-text)',
                                                }}>
                                                    {notPlayed ? '—' : `${sp.total_pt > 0 ? '+' : ''}${sp.total_pt.toFixed(1)}`}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {currentStageRows.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="text-center py-8 text-gray-400">
                                                {t('league.noRankingData')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text)' }}>
                        {t('league.tab.info')}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { icon: Users, label: t('league.registeredPlayers'), value: season.player_count },
                            { icon: Calendar, label: t('league.stageCount'), value: season.stage_count },
                            { icon: Trophy, label: t('league.onlineEnabled'), value: season.allow_online ? '✓' : '✗' },
                            { icon: Trophy, label: t('league.offlineEnabled'), value: season.allow_offline ? '✓' : '✗' },
                        ].map((item, i) => (
                            <div key={i} className="p-4 rounded-xl bg-gray-50 text-center">
                                <item.icon size={20} className="mx-auto mb-2 text-gray-400" />
                                <div className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{item.value}</div>
                                <div className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{item.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-b flex" style={{ borderColor: 'var(--color-border)' }}>
                    {(['stages', 'ranking'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                                activeTab === tab
                                    ? 'border-amber-400 text-amber-600'
                                    : 'border-transparent hover:text-gray-600'
                            }`}
                            style={{ color: activeTab === tab ? undefined : 'var(--color-text-light)' }}
                        >
                            {t(`league.tab.${tab}`)}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {activeTab === 'stages' && (
                        <div className="space-y-3">
                            {stages.length === 0 && (
                                <div className="text-center py-8 text-gray-400">{t('league.noStages')}</div>
                            )}
                            {stages.map(stage => {
                                const isElim = stage.stage_type.startsWith('elimination');
                                return (
                                <Link
                                    key={stage.id}
                                    to={`/leagues/stage/${stage.id}`}
                                    className="flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md hover:border-amber-200/80"
                                    style={{ borderColor: 'var(--color-border)', textDecoration: 'none', color: 'inherit' }}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                            stage.stage_type === 'final' ? 'bg-amber-100' :
                                            stage.stage_type === 'semifinal' ? 'bg-purple-100' :
                                            isElim ? 'bg-red-100' :
                                            stage.stage_type === 'revival' ? 'bg-blue-100' :
                                            'bg-green-100'
                                        }`}>
                                            {stage.stage_type === 'final' ? <Trophy size={18} className="text-amber-600" /> :
                                             stage.stage_type === 'semifinal' ? <Trophy size={18} className="text-purple-600" /> :
                                             isElim ? <Swords size={18} className="text-red-600" /> :
                                             stage.stage_type === 'revival' ? <Swords size={18} className="text-blue-600" /> :
                                             <BarChart2 size={18} className="text-green-600" />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{stage.name}</div>
                                            <div className="text-xs truncate" style={{ color: 'var(--color-text-light)' }}>
                                                {t(STAGE_TYPE_I18N_KEY[stage.stage_type], { defaultValue: STAGE_TYPE_LABELS[stage.stage_type] })} · {t('league.gamesPerPlayer', { n: stage.games_per_player })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                                            {stage.player_count}{t('common.peopleUnit')}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageStatusColors[stage.status]}`}>
                                            {STAGE_STATUS_LABELS[stage.status]}
                                        </span>
                                        <ChevronRight size={16} style={{ color: 'var(--color-text-light)' }} aria-hidden />
                                    </div>
                                </Link>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'ranking' && (
                        <div className="space-y-6">
                            {stages.filter(s => s.status !== 'pending').map(stage => (
                                <div key={stage.id}>
                                    <h4 className="font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                        <BarChart2 size={16} /> {stage.name}
                                    </h4>
                                    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-gray-50">
                                                    <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>#</th>
                                                    <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('league.player')}</th>
                                                    <th className="text-center px-4 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('league.gamesPlayed')}</th>
                                                    <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>PT</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(rankingMap[stage.id] || []).map((sp, idx) => (
                                                    <tr key={sp.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                                                        <td className="px-4 py-2 font-bold" style={{ color: idx < 3 ? 'var(--color-primary-dark)' : 'var(--color-text)' }}>
                                                            {idx + 1}
                                                        </td>
                                                        <td className="px-4 py-2" style={{ color: 'var(--color-text)' }}>
                                                            <span className="flex items-center gap-2">
                                                                {sp.seed_label && (
                                                                    <span className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                                                        {sp.seed_label}
                                                                    </span>
                                                                )}
                                                                {sp.player.nickname}
                                                                {sp.is_promoted && (
                                                                    <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                                                        {t('league.promoted')}
                                                                    </span>
                                                                )}
                                                                {sp.is_eliminated && (
                                                                    <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600">
                                                                        {t('league.eliminated')}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="text-center px-4 py-2" style={{ color: 'var(--color-text-light)' }}>
                                                            {sp.games_played}/{sp.games_per_player || stage.games_per_player}
                                                        </td>
                                                        <td className="text-right px-4 py-2 font-mono font-bold" style={{ color: sp.total_pt >= 0 ? 'var(--color-primary-dark)' : '#ef4444' }}>
                                                            {sp.total_pt > 0 ? '+' : ''}{sp.total_pt.toFixed(1)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!rankingMap[stage.id] || rankingMap[stage.id].length === 0) && (
                                                    <tr>
                                                        <td colSpan={4} className="text-center py-4 text-gray-400">
                                                            {t('league.noRankingData')}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                            {stages.filter(s => s.status !== 'pending').length === 0 && (
                                <div className="text-center py-8 text-gray-400">{t('league.noRankingData')}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
