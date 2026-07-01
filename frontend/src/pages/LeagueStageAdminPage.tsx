import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
    AlertTriangle, ArrowLeft, BarChart2, CheckCircle, ChevronUp,
    Download, Eye, Globe, Home, Link2, Lock,
    Pencil, Play, RefreshCw, Save, Settings, Sparkles, Swords,
    Trash2, Trophy, UserPlus, Users,
} from 'lucide-react';

import {
    finishLeagueStage,
    generateSemifinalMatches,
    getLeagueStage,
    getStageMatches,
    getStagePlayers,
    getLeagueSeason,
    promoteStage,
    recalculateStagePt,
    removeStagePlayer,
    reopenLeagueStage,
    startLeagueStage,
    syncStagePlayersFromSeason,
    updateLeagueStage,
    updateStagePlayer,
} from '@/api/leagues';
import { sortLeagueMatchesByTime } from '@/utils/sortLeagueMatches';
import LeagueMatchTimeLabel from '@/components/league/LeagueMatchTimeLabel';
import Modal from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import type {
    GroupType, LeagueMatch, LeagueStage, LeagueStagePlayer,
} from '@/types';
import {
    GROUP_TYPE_LABELS, STAGE_STATUS_LABELS,
    STAGE_TYPE_I18N_KEY, STAGE_TYPE_LABELS,
} from '@/types';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

function stageIcon(type: string) {
    if (type === 'final') return <Trophy size={20} className="text-amber-600" />;
    if (type === 'semifinal') return <Trophy size={20} className="text-purple-600" />;
    if (type === 'revival') return <Sparkles size={20} className="text-blue-600" />;
    if (type.startsWith('elimination')) return <Swords size={20} className="text-red-600" />;
    return <BarChart2 size={20} className="text-green-600" />;
}

export default function LeagueStageAdminPage() {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const { stageId } = useParams<{ stageId: string }>();

    const [stage, setStage] = useState<LeagueStage | null>(null);
    const [players, setPlayers] = useState<LeagueStagePlayer[]>([]);
    const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
    const [matches, setMatches] = useState<LeagueMatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'config' | 'players' | 'matches'>('config');

    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit form
    const [name, setName] = useState('');
    const [notes, setNotes] = useState('');
    const [games, setGames] = useState(8);
    const [u1, setU1] = useState(20);
    const [u2, setU2] = useState(10);
    const [u3, setU3] = useState(-10);
    const [u4, setU4] = useState(-20);
    const [base, setBase] = useState(25000);
    const [allowCompanion, setAllowCompanion] = useState(false);
    const [allowFreeTable, setAllowFreeTable] = useState(true);
    const [recordRanking, setRecordRanking] = useState(true);

    function fillForm(s: LeagueStage) {
        setName(s.name);
        setNotes(s.notes || '');
        setGames(s.games_per_player);
        setU1(s.uma_1st);
        setU2(s.uma_2nd);
        setU3(s.uma_3rd);
        setU4(s.uma_4th);
        setBase(s.base_score);
        setAllowCompanion(s.allow_companion);
        setAllowFreeTable(s.allow_free_table);
        setRecordRanking(s.record_ranking);
    }

    async function reloadAll(id: string) {
        const [s, ps, ms] = await Promise.all([
            getLeagueStage(id),
            getStagePlayers(id),
            getStageMatches(id),
        ]);
        let seasonStatus = s.season_status;
        if (!seasonStatus && s.season) {
            try {
                const season = await getLeagueSeason(s.season);
                seasonStatus = season.status;
            } catch {
                // ignore
            }
        }
        setStage({ ...s, season_status: seasonStatus });
        setPlayers(ps);
        setMatches(ms);
        fillForm(s);
    }

    useEffect(() => {
        if (!stageId) return;
        (async () => {
            try {
                await reloadAll(stageId);
            } catch {
                showToast(t('league.loadFailed'));
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stageId, t, showToast]);

    useEffect(() => {
        if (!stageId) return;
        const refresh = () => {
            void reloadAll(stageId).catch(() => {
                showToast(t('league.loadFailed'));
            });
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        window.addEventListener('pageshow', refresh);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('pageshow', refresh);
            document.removeEventListener('visibilitychange', onVisibility);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stageId, t, showToast]);

    const avatarPlayerIds = useMemo(() => {
        const ids: string[] = [];
        for (const p of stage?.bypass_players ?? []) {
            if (p.id) ids.push(p.id);
        }
        return [...new Set(ids)];
    }, [stage?.bypass_players]);

    useEffect(() => {
        if (avatarPlayerIds.length === 0) return;
        let cancelled = false;
        loadPlayerAvatarsForList(avatarPlayerIds, { skipCache: true }).then((map) => {
            if (!cancelled) setPlayerAvatars(map);
        });
        return () => { cancelled = true; };
    }, [avatarPlayerIds]);

    async function handleSave() {
        if (!stage) return;
        setSaving(true);
        try {
            const updated = await updateLeagueStage(stage.id, {
                name,
                notes,
                games_per_player: games,
                uma_1st: u1,
                uma_2nd: u2,
                uma_3rd: u3,
                uma_4th: u4,
                base_score: base,
                allow_companion: allowCompanion,
                allow_free_table: allowFreeTable,
                record_ranking: recordRanking,
            });
            setStage(updated);
            fillForm(updated);
            setEditing(false);
            showToast(t('league.stageUpdated'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        } finally {
            setSaving(false);
        }
    }

    async function handleStart() {
        if (!stage) return;
        try {
            await startLeagueStage(stage.id);
            await reloadAll(stage.id);
            showToast(t('league.stageStarted'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleFinish() {
        if (!stage) return;
        if (!confirm(t('league.finishStageConfirm'))) return;
        try {
            await finishLeagueStage(stage.id);
            await reloadAll(stage.id);
            showToast(t('league.stageFinished'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleReopen() {
        if (!stage) return;
        if (!confirm(t('league.reopenStageConfirm'))) return;
        try {
            await reopenLeagueStage(stage.id);
            await reloadAll(stage.id);
            showToast(t('league.stageReopened'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleRecalc() {
        if (!stage) return;
        try {
            await recalculateStagePt(stage.id);
            await reloadAll(stage.id);
            showToast(t('league.recalcSuccess'), 'success');
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    async function handlePromote() {
        if (!stage) return;
        if (!confirm(t('league.promoteConfirm'))) return;
        try {
            await promoteStage(stage.id);
            await reloadAll(stage.id);
            showToast(t('league.promoteSuccess'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleSyncPlayers() {
        if (!stage) return;
        try {
            await syncStagePlayersFromSeason(stage.id);
            const ps = await getStagePlayers(stage.id);
            setPlayers(ps);
            showToast(t('league.syncSuccess'), 'success');
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    async function handleGenerateSemifinal() {
        if (!stage) return;
        if (!confirm(t('league.generateSemifinalConfirm'))) return;
        try {
            await generateSemifinalMatches(stage.id);
            await reloadAll(stage.id);
            showToast(t('league.semifinalGenerated'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleSetGroup(sp: LeagueStagePlayer, group: GroupType) {
        if (!stage) return;
        try {
            const updated = await updateStagePlayer(stage.id, sp.id, { group_type: group });
            setPlayers(prev => prev.map(p => p.id === sp.id ? { ...p, ...updated } : p));
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    async function handleToggleEliminated(sp: LeagueStagePlayer) {
        if (!stage) return;
        try {
            const updated = await updateStagePlayer(stage.id, sp.id, {
                is_eliminated: !sp.is_eliminated,
            });
            setPlayers(prev => prev.map(p => p.id === sp.id ? { ...p, ...updated } : p));
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    async function handleRemovePlayer(sp: LeagueStagePlayer) {
        if (!stage) return;
        if (!confirm(t('league.removeStagePlayerConfirm'))) return;
        try {
            await removeStagePlayer(stage.id, sp.id);
            setPlayers(prev => prev.filter(p => p.id !== sp.id));
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    const groupedPlayers = useMemo(() => {
        const groups: Record<GroupType, LeagueStagePlayer[]> = { winners: [], losers: [], none: [] };
        for (const sp of players) groups[sp.group_type].push(sp);
        for (const k of Object.keys(groups) as GroupType[]) {
            // 未上场（games_played === 0）的选手排到末尾，并按种子号 / 昵称升序便于查找
            groups[k].sort((a, b) => {
                const aPlayed = (a.games_played || 0) > 0 ? 0 : 1;
                const bPlayed = (b.games_played || 0) > 0 ? 0 : 1;
                if (aPlayed !== bPlayed) return aPlayed - bPlayed;
                if (b.total_pt !== a.total_pt) return b.total_pt - a.total_pt;
                const aSeed = a.seed_label || '';
                const bSeed = b.seed_label || '';
                if (aSeed !== bSeed) return aSeed.localeCompare(bSeed);
                return (a.player.nickname || '').localeCompare(b.player.nickname || '');
            });
        }
        return groups;
    }, [players]);

    const bypassPlayers = stage?.bypass_players ?? [];
    const bypassIds = useMemo(() => new Set(bypassPlayers.map((p) => p.id)), [bypassPlayers]);
    const showBypassBanner =
        !!stage &&
        (stage.stage_type === 'elimination_2' || stage.stage_type === 'elimination_3') &&
        bypassPlayers.length > 0;

    if (loading) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('common.loading')}</div>;
    }
    if (!stage) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('league.loadFailed')}</div>;
    }

    const stagePending = stage.status === 'pending';
    const isOngoing = stage.status === 'ongoing';
    const isFinished = stage.status === 'finished';
    const canSyncPlayers = stagePending || (stage.stage_type === 'swiss' && isOngoing);

    return (
        <div className="space-y-6">
            {ToastComponent}

            <div className="flex items-center gap-3">
                <Link
                    to={`/league-admin/seasons/${stage.season}/stages`}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    style={{ color: 'var(--color-text-light)' }}
                >
                    <ArrowLeft size={18} />
                </Link>
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                    {stageIcon(stage.stage_type)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-bold truncate" style={{ color: 'var(--color-text)' }}>
                            {stage.name}
                        </h2>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isFinished ? 'bg-blue-100 text-blue-700'
                            : isOngoing ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                            {STAGE_STATUS_LABELS[stage.status]}
                        </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                        {t(STAGE_TYPE_I18N_KEY[stage.stage_type], { defaultValue: STAGE_TYPE_LABELS[stage.stage_type] })}
                        {' · '}
                        {t('league.gamesPerPlayer', { n: stage.games_per_player })}
                    </p>
                </div>
                <Link
                    to={`/leagues/stage/${stage.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
                >
                    <Eye size={12} /> {t('league.viewPublic')}
                </Link>
            </div>

            <div className="flex flex-wrap gap-2 p-4 rounded-2xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-sm font-medium self-center mr-2" style={{ color: 'var(--color-text)' }}>
                    {t('league.actions')}:
                </span>
                <button
                    onClick={handleStart}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-all"
                >
                    <Play size={14} /> {t('league.startStage')}
                </button>
                <button
                    onClick={handleFinish}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all"
                >
                    <CheckCircle size={14} /> {t('league.finishStage')}
                </button>
                <button
                    onClick={handleReopen}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
                >
                    <RefreshCw size={14} /> {t('league.reopenStage')}
                </button>
                {(isOngoing || isFinished) && (
                    <button
                        onClick={handleRecalc}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                    >
                        <RefreshCw size={14} /> {t('league.recalculate')}
                    </button>
                )}
                {isFinished && (
                    <button
                        onClick={handlePromote}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-all"
                    >
                        <ChevronUp size={14} /> {t('league.applyPromotion')}
                    </button>
                )}
                {stage.stage_type === 'semifinal' && isOngoing && (
                    <button
                        onClick={handleGenerateSemifinal}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-purple-500 text-white hover:bg-purple-600 transition-all"
                    >
                        <Swords size={14} /> {t('league.generateSemifinal')}
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                <div className="border-b flex" style={{ borderColor: 'var(--color-border)' }}>
                    {(['config', 'players', 'matches'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                                activeTab === tab ? 'border-amber-400 text-amber-600' : 'border-transparent'
                            }`}
                            style={{ color: activeTab === tab ? undefined : 'var(--color-text-light)' }}
                        >
                            {t(`league.adminTab.${tab}`)}
                        </button>
                    ))}
                </div>

                {activeTab === 'config' && (
                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                <Settings size={16} /> {t('league.configHeader')}
                            </h3>
                            {stagePending ? (
                                editing ? (
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEditing(false); fillForm(stage); }} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: 'var(--color-text-light)' }}>
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-white"
                                            style={{ background: 'var(--color-primary)' }}
                                        >
                                            <Save size={12} /> {saving ? t('rankingAdmin.saving') : t('common.save')}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg"
                                        style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
                                    >
                                        <Pencil size={12} /> {t('common.edit')}
                                    </button>
                                )
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-orange-50 text-orange-600">
                                    <Lock size={12} /> {t('league.coreLockedHint')}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label={t('league.fieldName')}>
                                {editing ? (
                                    <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--color-border)' }} />
                                ) : (
                                    <span style={{ color: 'var(--color-text)' }}>{stage.name}</span>
                                )}
                            </Field>
                            <Field label={t('league.gamesPerPlayerLabel')}>
                                {editing ? (
                                    <input type="number" value={games} onChange={e => setGames(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--color-border)' }} />
                                ) : (
                                    <span style={{ color: 'var(--color-text)' }}>{stage.games_per_player}</span>
                                )}
                            </Field>
                            <Field label={t('league.umaConfig')} full>
                                {editing ? (
                                    <div className="grid grid-cols-4 gap-2">
                                        {[{ v: u1, set: setU1 }, { v: u2, set: setU2 }, { v: u3, set: setU3 }, { v: u4, set: setU4 }].map((it, i) => (
                                            <div key={i}>
                                                <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{i + 1}{t('league.umaLabel')}</div>
                                                <input type="number" value={it.v} onChange={e => it.set(parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: 'var(--color-border)' }} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="font-mono text-sm" style={{ color: 'var(--color-text)' }}>
                                        <span className="text-green-600">+{stage.uma_1st}</span> / <span className="text-green-600">+{stage.uma_2nd}</span> / <span className="text-red-500">{stage.uma_3rd}</span> / <span className="text-red-500">{stage.uma_4th}</span>
                                    </div>
                                )}
                            </Field>
                            <Field label={t('league.returnPoint')}>
                                {editing ? (
                                    <input type="number" value={base} onChange={e => setBase(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--color-border)' }} />
                                ) : (
                                    <span style={{ color: 'var(--color-text)' }}>{stage.base_score}</span>
                                )}
                            </Field>
                            <Field label={t('league.fieldFlags')}>
                                {editing ? (
                                    <div className="flex flex-col gap-1.5 text-sm">
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={allowCompanion} onChange={e => setAllowCompanion(e.target.checked)} />{t('league.allowCompanion')}</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={allowFreeTable} onChange={e => setAllowFreeTable(e.target.checked)} />{t('league.freeTable')}</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={recordRanking} onChange={e => setRecordRanking(e.target.checked)} />{t('league.recordRanking')}</label>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <Tag color="blue" active={stage.allow_companion}>{t('league.allowCompanion')}</Tag>
                                        <Tag color="green" active={stage.allow_free_table}>{t('league.freeTable')}</Tag>
                                        <Tag color="amber" active={stage.record_ranking}>{t('league.recordRanking')}</Tag>
                                    </div>
                                )}
                            </Field>
                            <Field label={t('league.fieldNotes')} full>
                                {editing ? (
                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-xl border text-sm resize-y" style={{ borderColor: 'var(--color-border)' }} />
                                ) : (
                                    <pre className="text-sm whitespace-pre-wrap font-sans" style={{ color: 'var(--color-text-light)' }}>
                                        {stage.notes || '-'}
                                    </pre>
                                )}
                            </Field>
                        </div>
                    </div>
                )}

                {activeTab === 'players' && (
                    <div className="p-5 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                <Users size={16} /> {t('league.stagePlayers')} ({players.length})
                            </h3>
                            {canSyncPlayers && (
                                <button
                                    onClick={handleSyncPlayers}
                                    className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg"
                                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
                                >
                                    <UserPlus size={12} /> {t('league.syncFromSeason')}
                                </button>
                            )}
                        </div>

                        {showBypassBanner && (
                            <div
                                className="p-4 rounded-xl border"
                                style={{
                                    borderColor: 'var(--color-border)',
                                    background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.45), rgba(255, 247, 237, 0.9))',
                                }}
                            >
                                <h4 className="font-semibold mb-1.5 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                                    <Trophy size={16} className="text-amber-600 flex-shrink-0" />
                                    {t('league.elimBypassTitle')}
                                </h4>
                                <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-text-light)' }}>
                                    {stage.stage_type === 'elimination_2'
                                        ? t('league.elimBypassHintElim2')
                                        : t('league.elimBypassHintElim3')}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {bypassPlayers.map((p) => (
                                        <span
                                            key={p.id}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border text-sm"
                                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                                        >
                                            {(playerAvatars[p.id] || p.avatar) ? (
                                                <img src={playerAvatars[p.id] || p.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                                            ) : (
                                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-amber-100 text-amber-800">
                                                    {(p.nickname || '?').charAt(0)}
                                                </span>
                                            )}
                                            <span className="font-medium">{p.nickname}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(['winners', 'losers', 'none'] as const).map(group => {
                            const list = groupedPlayers[group];
                            if (list.length === 0) return null;
                            return (
                                <div key={group}>
                                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                        <span className={`w-2 h-2 rounded-full ${
                                            group === 'winners' ? 'bg-green-500'
                                            : group === 'losers' ? 'bg-red-500'
                                            : 'bg-gray-400'
                                        }`} />
                                        {GROUP_TYPE_LABELS[group]} ({list.length})
                                    </h4>
                                    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-gray-50">
                                                    <th className="text-left px-3 py-2 font-medium w-10" style={{ color: 'var(--color-text-light)' }}>#</th>
                                                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('league.player')}</th>
                                                    <th className="text-center px-3 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('league.gamesPlayed')}</th>
                                                    <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>PT</th>
                                                    <th className="text-center px-3 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('common.status')}</th>
                                                    <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--color-text-light)' }}>{t('common.actions')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {list.map((sp, idx) => {
                                                    const notPlayed = (sp.games_played || 0) === 0;
                                                    const dimStyle = notPlayed ? { opacity: 0.45 } : undefined;
                                                    return (
                                                    <tr
                                                        key={sp.id}
                                                        className="border-t"
                                                        style={{ borderColor: 'var(--color-border)', background: notPlayed ? '#fafafa' : undefined }}
                                                        title={notPlayed ? t('league.notPlayedYet') : undefined}
                                                    >
                                                        <td className="px-3 py-2 font-bold" style={{ ...dimStyle, color: 'var(--color-text)' }}>{idx + 1}</td>
                                                        <td className="px-3 py-2" style={dimStyle}>
                                                            <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
                                                                {sp.seed_label && (
                                                                    <span className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                                                        {sp.seed_label}
                                                                    </span>
                                                                )}
                                                                {sp.player.nickname}
                                                                {stage.stage_type === 'elimination_3' && group === 'winners' && bypassIds.has(sp.player.id) && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 border border-amber-200/80 font-medium">
                                                                        {t('league.bypassBadge')}
                                                                    </span>
                                                                )}
                                                                {notPlayed && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
                                                                        {t('league.notPlayedYet')}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="text-center px-3 py-2" style={{ ...dimStyle, color: 'var(--color-text-light)' }}>
                                                            {sp.games_played}/{sp.games_per_player || stage.games_per_player}
                                                        </td>
                                                        <td className="text-right px-3 py-2 font-mono font-bold" style={{
                                                            ...dimStyle,
                                                            color: notPlayed
                                                                ? 'var(--color-text-light)'
                                                                : sp.total_pt > 0 ? '#22c55e' : sp.total_pt < 0 ? '#ef4444' : 'var(--color-text)',
                                                        }}>
                                                            {notPlayed ? '—' : `${sp.total_pt > 0 ? '+' : ''}${sp.total_pt.toFixed(1)}`}
                                                        </td>
                                                        <td className="text-center px-3 py-2 space-x-1">
                                                            {sp.is_promoted && (
                                                                <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                                                    {t('league.promoted')}
                                                                </span>
                                                            )}
                                                            {sp.is_eliminated && (
                                                                <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600">
                                                                    {t('league.eliminated')}
                                                                </span>
                                                            )}
                                                            {!sp.is_promoted && !sp.is_eliminated && (
                                                                <span className="text-gray-300 text-xs">—</span>
                                                            )}
                                                        </td>
                                                        <td className="text-right px-3 py-2 space-x-1">
                                                            {stagePending && stage.has_groups && (
                                                                <select
                                                                    value={sp.group_type}
                                                                    onChange={e => handleSetGroup(sp, e.target.value as GroupType)}
                                                                    className="px-1.5 py-0.5 rounded border text-xs bg-white"
                                                                    style={{ borderColor: 'var(--color-border)' }}
                                                                >
                                                                    <option value="none">—</option>
                                                                    <option value="winners">{GROUP_TYPE_LABELS.winners}</option>
                                                                    <option value="losers">{GROUP_TYPE_LABELS.losers}</option>
                                                                </select>
                                                            )}
                                                            {(isOngoing || isFinished) && (
                                                                <button
                                                                    onClick={() => handleToggleEliminated(sp)}
                                                                    className="inline-block px-2 py-0.5 rounded text-xs hover:bg-red-50 text-red-500"
                                                                >
                                                                    {sp.is_eliminated ? t('league.undoEliminate') : t('league.markEliminated')}
                                                                </button>
                                                            )}
                                                            {stagePending && (
                                                                <button
                                                                    onClick={() => handleRemovePlayer(sp)}
                                                                    className="inline-block p-1 rounded hover:bg-red-50 text-red-400"
                                                                    title={t('common.remove')}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}

                        {players.length === 0 && (
                            <div className="text-center py-10 text-sm" style={{ color: 'var(--color-text-light)' }}>
                                {t('league.noPlayersStage')}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'matches' && (
                    <StageMatchesAdminPanel
                        stage={stage}
                        matches={matches}
                        players={players}
                        leagueAdminStagePath={`/league-admin/stages/${stage.id}`}
                        onChanged={() => stage && reloadAll(stage.id)}
                    />
                )}
            </div>
        </div>
    );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={full ? 'md:col-span-2' : ''}>
            <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>{label}</div>
            <div>{children}</div>
        </div>
    );
}

function Tag({ color, active, children }: { color: 'blue' | 'green' | 'amber'; active: boolean; children: React.ReactNode }) {
    if (!active) {
        return <span className="px-2 py-0.5 rounded-md bg-gray-50 text-gray-400 line-through">{children}</span>;
    }
    const cls = color === 'blue' ? 'bg-blue-50 text-blue-600' : color === 'green' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600';
    return <span className={`px-2 py-0.5 rounded-md ${cls}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Matches Admin Panel
// ---------------------------------------------------------------------------

import {
    createOfflineLeagueMatch, deleteLeagueMatch, importOnlineLeagueMatch,
    previewOnlineLeagueMatch,
    type LeagueOnlineMatchPreview,
    type OfflineMatchScore,
} from '@/api/leagues';

function StageMatchesAdminPanel({
    stage, matches, players, onChanged, leagueAdminStagePath,
}: {
    stage: LeagueStage;
    matches: LeagueMatch[];
    players: LeagueStagePlayer[];
    onChanged: () => Promise<void>;
    leagueAdminStagePath: string;
}) {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const [showOffline, setShowOffline] = useState(false);
    const [showOnline, setShowOnline] = useState(false);

    const playerById = useMemo(() => {
        const m = new Map<string, LeagueStagePlayer>();
        for (const p of players) m.set(p.player.id, p);
        return m;
    }, [players]);

    const sortedMatches = useMemo(() => sortLeagueMatchesByTime(matches), [matches]);

    async function handleDeleteMatch(id: string) {
        if (!confirm(t('league.deleteMatchConfirm'))) return;
        try {
            await deleteLeagueMatch(id);
            await onChanged();
            showToast(t('league.matchDeleted'), 'success');
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    return (
        <div className="p-5 space-y-4">
            {ToastComponent}

            <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                    <Swords size={16} /> {t('league.matchesHeader')} ({matches.length})
                </h3>
                {stage.status === 'ongoing' && (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setShowOnline(true)}
                            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-white"
                            style={{ background: 'var(--color-primary)' }}
                        >
                            <Globe size={12} /> {t('league.matchOnlineImport')}
                        </button>
                        <button
                            onClick={() => setShowOffline(true)}
                            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-white"
                            style={{ background: 'var(--color-secondary-dark, #6b7280)' }}
                        >
                            <Home size={12} /> {t('league.matchOfflineCreate')}
                        </button>
                    </div>
                )}
            </div>

            <p className="text-xs px-3 py-2 rounded-lg bg-blue-50 text-blue-700">
                {t('league.matchScoringHintV2')}
            </p>
            <p className="text-xs px-3 py-2 rounded-lg bg-orange-50 text-orange-700">
                {t('league.autoCompanionHint')}
            </p>

            {sortedMatches.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ color: 'var(--color-text-light)' }}>
                    {t('league.noMatches')}
                </div>
            ) : (
                <ul className="space-y-2">
                    {sortedMatches.map((m, idx) => (
                        <li key={m.id} className="rounded-xl border bg-white p-3" style={{ borderColor: 'var(--color-border)' }}>
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-sm font-medium flex items-center flex-wrap gap-x-2 gap-y-0.5" style={{ color: 'var(--color-text)' }}>
                                        {t('league.matchOrdinal', { n: idx + 1 })}
                                        {m.round_index > 0 && (
                                            <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                                                R{m.round_index}/T{m.table_index}
                                            </span>
                                        )}
                                        {m.game_is_scored && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                                                {t('league.matchScored')}
                                            </span>
                                        )}
                                    </span>
                                    <LeagueMatchTimeLabel match={m} />
                                </div>
                                <div className="flex items-center gap-1">
                                    {m.game_id && (
                                        <Link
                                            to={`/games/${m.game_id}`}
                                            state={{ backTo: leagueAdminStagePath }}
                                            className="text-xs px-2 py-1 rounded hover:bg-gray-100"
                                            style={{ color: 'var(--color-text-light)' }}
                                        >
                                            {t('league.viewGame')}
                                        </Link>
                                    )}
                                    {(stage.status === 'ongoing' || !m.game_id) && (
                                        <button onClick={() => handleDeleteMatch(m.id)} className="p-1 rounded text-red-400 hover:bg-red-50">
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {m.scheduled_players.map((pid, i) => {
                                    const sp = playerById.get(pid);
                                    const isCompanion = m.companion_players.includes(pid);
                                    const score = m.game_scores.find(gs => gs.player_id === pid)?.score;
                                    return (
                                        <div key={pid} className="px-2 py-1.5 rounded-lg bg-gray-50 text-sm flex items-center justify-between">
                                            <span style={{ color: 'var(--color-text)' }}>
                                                {sp?.player.nickname || `Player ${i + 1}`}
                                                {isCompanion && (
                                                    <span className="ml-1 px-1 rounded text-[10px] bg-orange-100 text-orange-600">
                                                        {t('league.companion')}
                                                    </span>
                                                )}
                                            </span>
                                            {score !== undefined && score !== null ? (
                                                <span className="text-xs font-mono" style={{ color: 'var(--color-text-light)' }}>
                                                    {score}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-300">—</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {showOffline && (
                <OfflineMatchModal
                    stage={stage}
                    players={players}
                    onClose={() => setShowOffline(false)}
                    onCreated={async () => {
                        setShowOffline(false);
                        await onChanged();
                        showToast(t('league.matchCreated'), 'success');
                    }}
                />
            )}

            {showOnline && (
                <OnlineMatchModal
                    stage={stage}
                    onClose={() => setShowOnline(false)}
                    onCreated={async () => {
                        setShowOnline(false);
                        await onChanged();
                        showToast(t('league.matchImported'), 'success');
                    }}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Offline match modal — pick 4 players, optionally enter scores
// ---------------------------------------------------------------------------

function OfflineMatchModal({
    stage, players, onClose, onCreated,
}: {
    stage: LeagueStage;
    players: LeagueStagePlayer[];
    onClose: () => void;
    onCreated: () => Promise<void>;
}) {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const [label, setLabel] = useState('');
    const [pickedPlayers, setPickedPlayers] = useState<string[]>([]);
    const [pickedCompanions, setPickedCompanions] = useState<string[]>([]);
    const [enterScores, setEnterScores] = useState(false);
    const [scoreMap, setScoreMap] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    function togglePicked(id: string) {
        setPickedPlayers(prev => {
            if (prev.includes(id)) {
                const next = prev.filter(x => x !== id);
                setPickedCompanions(c => c.filter(x => x !== id));
                setScoreMap(s => {
                    const ns = { ...s };
                    delete ns[id];
                    return ns;
                });
                return next;
            }
            if (prev.length >= 4) return prev;
            return [...prev, id];
        });
    }
    function toggleCompanion(id: string) {
        setPickedCompanions(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            if (prev.length >= 2) return prev;
            return [...prev, id];
        });
    }

    const scoreSum = pickedPlayers.reduce(
        (s, pid) => s + (parseInt(scoreMap[pid] || '0', 10) || 0),
        0,
    );
    const expectedSum = pickedPlayers.length === 3 ? 1050 : 1000;
    const scoresValid = enterScores
        ? pickedPlayers.length === 4 &&
          pickedPlayers.every(pid => /^-?\d+$/.test((scoreMap[pid] || '').trim())) &&
          scoreSum === expectedSum
        : true;

    async function handleSubmit() {
        if (pickedPlayers.length !== 4) {
            showToast(t('league.matchNeedsFour'));
            return;
        }
        if (enterScores && !scoresValid) {
            showToast(t('league.scoreInvalid', { sum: scoreSum, exp: expectedSum }));
            return;
        }
        setSaving(true);
        try {
            const payload: Parameters<typeof createOfflineLeagueMatch>[1] = {
                match_label: label.trim(),
                scheduled_players: pickedPlayers,
                companion_players: pickedCompanions,
            };
            if (enterScores) {
                const scores: OfflineMatchScore[] = pickedPlayers.map((pid, i) => ({
                    player_id: pid,
                    score: parseInt(scoreMap[pid] || '0', 10),
                    seat_number: i,
                    is_dealer_start: i === 0,
                }));
                payload.scores = scores;
            }
            await createOfflineLeagueMatch(stage.id, payload);
            await onCreated();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={t('league.matchOfflineCreate')}>
            {ToastComponent}
            <div className="space-y-3">
                <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder={t('league.matchLabelPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl border text-sm"
                    style={{ borderColor: 'var(--color-border)' }}
                />
                <div>
                    <label className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        {t('league.selectPlayers4')} ({pickedPlayers.length}/4)
                    </label>
                    <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-0.5" style={{ borderColor: 'var(--color-border)' }}>
                        {players.filter(p => !p.is_eliminated).map(p => {
                            const checked = pickedPlayers.includes(p.player.id);
                            return (
                                <label key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${checked ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => togglePicked(p.player.id)}
                                    />
                                    <span style={{ color: 'var(--color-text)' }}>{p.player.nickname}</span>
                                    {p.is_full && <span className="text-[10px] text-green-600">●full</span>}
                                </label>
                            );
                        })}
                        {players.length === 0 && (
                            <p className="text-xs px-2 py-1" style={{ color: 'var(--color-text-light)' }}>
                                {t('league.noPlayersStage')}
                            </p>
                        )}
                    </div>
                </div>
                {stage.allow_companion && pickedPlayers.length > 0 && (
                    <div>
                        <label className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                            {t('league.companionPlayers')} ({pickedCompanions.length}/2)
                        </label>
                        <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-0.5" style={{ borderColor: 'var(--color-border)' }}>
                            {players.filter(p => p.is_full && pickedPlayers.includes(p.player.id)).map(p => {
                                const checked = pickedCompanions.includes(p.player.id);
                                return (
                                    <label key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${checked ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                                        <input type="checkbox" checked={checked} onChange={() => toggleCompanion(p.player.id)} />
                                        <span style={{ color: 'var(--color-text)' }}>{p.player.nickname}</span>
                                    </label>
                                );
                            })}
                            {!players.some(p => p.is_full && pickedPlayers.includes(p.player.id)) && (
                                <p className="text-xs px-2 py-1" style={{ color: 'var(--color-text-light)' }}>
                                    {t('league.noFullPlayers')}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enterScores}
                        onChange={e => setEnterScores(e.target.checked)}
                    />
                    <span style={{ color: 'var(--color-text)' }}>{t('league.enterScoresInline')}</span>
                </label>

                {enterScores && pickedPlayers.length > 0 && (
                    <div className="space-y-1.5 border rounded-lg p-3" style={{ borderColor: 'var(--color-border)' }}>
                        {pickedPlayers.map((pid, i) => {
                            const sp = players.find(p => p.player.id === pid);
                            return (
                                <div key={pid} className="flex items-center gap-2 text-sm">
                                    <span className="w-5 text-xs" style={{ color: 'var(--color-text-light)' }}>{i + 1}.</span>
                                    <span className="flex-1 truncate" style={{ color: 'var(--color-text)' }}>{sp?.player.nickname || pid}</span>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={scoreMap[pid] || ''}
                                        onChange={e => setScoreMap(s => ({ ...s, [pid]: e.target.value }))}
                                        className="w-24 px-2 py-1 rounded border text-right font-mono text-sm"
                                        style={{ borderColor: 'var(--color-border)' }}
                                        placeholder="0"
                                    />
                                </div>
                            );
                        })}
                        <div className="flex justify-between text-xs pt-1" style={{ color: scoreSum === expectedSum ? 'var(--color-text-light)' : '#dc2626' }}>
                            <span>{t('league.scoreSum')} {scoreSum} / {expectedSum}</span>
                            {scoreSum !== expectedSum && <span>{t('league.scoreSumMismatch')}</span>}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--color-text-light)' }}>
                    {t('common.cancel')}
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={saving || pickedPlayers.length !== 4 || (enterScores && !scoresValid)}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--color-primary)' }}
                >
                    {saving ? t('common.loading') : t('common.create')}
                </button>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Online match modal — paste paipu URL, auto-recognize players from UID
// ---------------------------------------------------------------------------

function OnlineMatchModal({
    stage, onClose, onCreated,
}: {
    stage: LeagueStage;
    onClose: () => void;
    onCreated: () => Promise<void>;
}) {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const [url, setUrl] = useState('');
    const [label, setLabel] = useState('');
    const [allowDup, setAllowDup] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorDetail, setErrorDetail] = useState('');
    const [preview, setPreview] = useState<LeagueOnlineMatchPreview | null>(null);

    async function handleParse() {
        if (!url.trim()) {
            showToast(t('league.matchOnlineUrlRequired'));
            return;
        }
        setParsing(true);
        setErrorDetail('');
        setPreview(null);
        try {
            const data = await previewOnlineLeagueMatch(stage.id, {
                source_url: url.trim(),
                allow_duplicate_url: allowDup,
            });
            setPreview(data);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            setErrorDetail(msg);
            showToast(msg);
        } finally {
            setParsing(false);
        }
    }

    async function handleSubmit() {
        if (!url.trim()) {
            showToast(t('league.matchOnlineUrlRequired'));
            return;
        }
        setSubmitting(true);
        setErrorDetail('');
        try {
            const match = await importOnlineLeagueMatch(stage.id, {
                source_url: url.trim(),
                allow_duplicate_url: allowDup,
                match_label: label.trim(),
            });
            const companionCount = match.companion_players?.length ?? 0;
            if (companionCount > 0) {
                showToast(t('league.matchOnlineCompanionImported', { n: companionCount }), 'success');
            }
            await onCreated();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            setErrorDetail(msg);
            showToast(msg);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={t('league.matchOnlineImport')}>
            {ToastComponent}
            <div className="space-y-3">
                <p className="text-xs px-3 py-2 rounded-lg bg-blue-50 text-blue-700 flex items-start gap-2">
                    <Link2 size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{t('league.matchOnlineHint')}</span>
                </p>
                <p className="text-xs px-3 py-2 rounded-lg bg-orange-50 text-orange-700">
                    {t('league.autoCompanionHint')}
                </p>
                <div>
                    <label className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                        {t('league.matchOnlineUrlLabel')}
                    </label>
                    <textarea
                        value={url}
                        onChange={e => { setUrl(e.target.value); setPreview(null); setErrorDetail(''); }}
                        rows={3}
                        placeholder="https://game.maj-soul.com/1/?paipu=..."
                        className="w-full px-3 py-2 rounded-xl border text-sm font-mono"
                        style={{ borderColor: 'var(--color-border)' }}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleParse}
                        disabled={parsing || !url.trim()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                        <RefreshCw size={14} className={parsing ? 'animate-spin' : ''} />
                        {parsing ? t('common.loading') : t('league.matchOnlineParse')}
                    </button>
                </div>
                <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder={t('league.matchLabelPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl border text-sm"
                    style={{ borderColor: 'var(--color-border)' }}
                />
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                        type="checkbox"
                        checked={allowDup}
                        onChange={e => { setAllowDup(e.target.checked); setPreview(null); }}
                    />
                    <span style={{ color: 'var(--color-text)' }}>{t('league.matchOnlineAllowDup')}</span>
                </label>

                {preview && (
                    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                            {t('league.matchOnlinePreview')}
                            {preview.game_start_time && (
                                <span className="ml-2 font-normal" style={{ color: 'var(--color-text-light)' }}>
                                    {preview.game_start_time}
                                    {preview.game_end_time ? ` ~ ${preview.game_end_time}` : ''}
                                </span>
                            )}
                        </div>
                        <ul className="space-y-1.5">
                            {preview.players.map((p) => (
                                <li
                                    key={p.player_id}
                                    className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm ${
                                        p.is_companion ? 'bg-orange-50' : 'bg-gray-50'
                                    }`}
                                >
                                    <span style={{ color: 'var(--color-text)' }}>
                                        {p.nickname}
                                        <span className="ml-1 text-xs" style={{ color: 'var(--color-text-light)' }}>
                                            ({p.games_played}/{p.games_per_player})
                                        </span>
                                        {p.is_companion && (
                                            <span className="ml-1 px-1 rounded text-[10px] bg-orange-100 text-orange-600">
                                                {t('league.companion')}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-light)' }}>
                                        {p.score}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {(preview.companion_players?.length ?? 0) > 0 && (
                            <p className="text-xs text-orange-700">{t('league.matchOnlineCompanionHint')}</p>
                        )}
                    </div>
                )}

                {errorDetail && (
                    <div className="p-3 rounded-xl text-sm flex items-start gap-2"
                         style={{ background: '#fde8e8', border: '1px solid #f5c6c6', color: '#c0392b' }}>
                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                        <span>{errorDetail}</span>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--color-text-light)' }}>
                    {t('common.cancel')}
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={submitting || !url.trim()}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--color-primary)' }}
                >
                    <Download size={14} />
                    {submitting ? t('league.parsingPaipu') : t('league.matchOnlineImportBtn')}
                </button>
            </div>
        </Modal>
    );
}
