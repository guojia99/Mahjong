import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft, Calendar, CheckCircle, Eye, Layers,
    Lock, Pencil, Play, RefreshCw, Save, Trash2, Users,
} from 'lucide-react';

import {
    deleteLeagueSeason,
    finishLeagueSeason,
    getLeagueSeason,
    reopenLeagueSeason,
    startLeagueSeason,
    updateLeagueSeason,
} from '@/api/leagues';
import { useToast } from '@/hooks/useToast';
import type { LeagueSeason } from '@/types';
import { LEAGUE_SEASON_STATUS_LABELS } from '@/types';
import LeagueMarkdownBody from '@/components/LeagueMarkdownBody';
import LeagueMarkdownEditor from '@/components/LeagueMarkdownEditor';

export default function LeagueSeasonAdminPage() {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const { seasonId } = useParams<{ seasonId: string }>();

    const [season, setSeason] = useState<LeagueSeason | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [allowOnline, setAllowOnline] = useState(true);
    const [allowOffline, setAllowOffline] = useState(true);
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [isCurrent, setIsCurrent] = useState(false);

    function fillForm(s: LeagueSeason) {
        setName(s.name);
        setDescription(s.description || '');
        setAllowOnline(s.allow_online);
        setAllowOffline(s.allow_offline);
        setStartTime(s.start_time ? s.start_time.slice(0, 16) : '');
        setEndTime(s.end_time ? s.end_time.slice(0, 16) : '');
        setIsCurrent(s.is_current);
    }

    useEffect(() => {
        if (!seasonId) return;
        (async () => {
            try {
                const data = await getLeagueSeason(seasonId);
                setSeason(data);
                fillForm(data);
            } catch {
                showToast(t('league.loadFailed'));
            } finally {
                setLoading(false);
            }
        })();
    }, [seasonId, t, showToast]);

    async function handleSave() {
        if (!season) return;
        setSaving(true);
        try {
            const updated = await updateLeagueSeason(season.id, {
                name,
                description,
                allow_online: allowOnline,
                allow_offline: allowOffline,
                start_time: startTime || null,
                end_time: endTime || null,
                is_current: isCurrent,
            });
            setSeason(updated);
            fillForm(updated);
            setEditing(false);
            showToast(t('league.seasonUpdated'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        } finally {
            setSaving(false);
        }
    }

    async function handleStart() {
        if (!season) return;
        try {
            const updated = await startLeagueSeason(season.id);
            setSeason(prev => prev ? { ...prev, ...updated } : updated);
            showToast(t('league.seasonStarted'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleFinish() {
        if (!season) return;
        if (!confirm(t('league.finishSeasonConfirm'))) return;
        try {
            const updated = await finishLeagueSeason(season.id);
            setSeason(prev => prev ? { ...prev, ...updated } : updated);
            showToast(t('league.seasonFinished'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleReopen() {
        if (!season) return;
        if (!confirm(t('league.reopenSeasonConfirm'))) return;
        try {
            const updated = await reopenLeagueSeason(season.id);
            setSeason(prev => prev ? { ...prev, ...updated } : updated);
            showToast(t('league.seasonReopened'), 'success');
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    async function handleDelete() {
        if (!season) return;
        if (!confirm(t('league.deleteSeasonConfirm'))) return;
        try {
            await deleteLeagueSeason(season.id);
            showToast(t('league.seasonDeleted'), 'success');
            window.location.href = `/league-admin/series/${season.series}`;
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

    const statusColor = (s: string) =>
        s === 'registration' ? 'bg-blue-100 text-blue-700'
        : s === 'ongoing' ? 'bg-green-100 text-green-700'
        : 'bg-gray-100 text-gray-500';

    return (
        <div className="space-y-6">
            {ToastComponent}

            <div className="flex items-center gap-3">
                <Link
                    to={`/league-admin/series/${season.series}`}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    style={{ color: 'var(--color-text-light)' }}
                >
                    <ArrowLeft size={18} />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-bold truncate" style={{ color: 'var(--color-text)' }}>
                            {season.name}
                        </h2>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(season.status)}`}>
                            {LEAGUE_SEASON_STATUS_LABELS[season.status]}
                        </span>
                        {season.is_locked && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600">
                                <Lock size={10} /> {t('league.lockedBadge')}
                            </span>
                        )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                        {season.series_name} · {t('league.seasonNumber', { n: season.season_number })}
                    </p>
                </div>
                <Link
                    to={`/leagues/${season.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
                >
                    <Eye size={12} /> {t('league.viewPublic')}
                </Link>
            </div>

            {/* Lifecycle actions */}
            <div className="flex flex-wrap gap-2 p-4 rounded-2xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-sm font-medium self-center mr-2" style={{ color: 'var(--color-text)' }}>
                    {t('league.lifecycle')}:
                </span>
                {season.status === 'registration' && (
                    <button
                        onClick={handleStart}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-all"
                    >
                        <Play size={14} /> {t('league.startSeason')}
                    </button>
                )}
                {season.status === 'ongoing' && (
                    <button
                        onClick={handleFinish}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all"
                    >
                        <CheckCircle size={14} /> {t('league.finishSeason')}
                    </button>
                )}
                {season.status !== 'registration' && (
                    <button
                        onClick={handleReopen}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
                        title={t('league.reopenHint')}
                    >
                        <RefreshCw size={14} /> {t('league.reopenSeason')}
                    </button>
                )}
                {season.status === 'registration' && (
                    <button
                        onClick={handleDelete}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-all"
                    >
                        <Trash2 size={14} /> {t('common.delete')}
                    </button>
                )}
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                    to={`/league-admin/seasons/${season.id}/players`}
                    className="p-5 rounded-2xl border bg-white hover:shadow-md hover:border-blue-200 transition-all flex items-center justify-between"
                    style={{ borderColor: 'var(--color-border)' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                            <Users size={22} className="text-blue-600" />
                        </div>
                        <div>
                            <h4 className="font-bold" style={{ color: 'var(--color-text)' }}>
                                {t('league.playerManagement')}
                            </h4>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                                {t('league.playerManagementDesc', { n: season.player_count })}
                            </p>
                        </div>
                    </div>
                    <span className="text-2xl font-bold" style={{ color: 'var(--color-text-light)' }}>
                        {season.player_count}
                    </span>
                </Link>

                <Link
                    to={`/league-admin/seasons/${season.id}/stages`}
                    className="p-5 rounded-2xl border bg-white hover:shadow-md hover:border-amber-200 transition-all flex items-center justify-between"
                    style={{ borderColor: 'var(--color-border)' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                            <Layers size={22} className="text-amber-600" />
                        </div>
                        <div>
                            <h4 className="font-bold" style={{ color: 'var(--color-text)' }}>
                                {t('league.stageManagement')}
                            </h4>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                                {t('league.stageManagementDesc', { n: season.stage_count })}
                            </p>
                        </div>
                    </div>
                    <span className="text-2xl font-bold" style={{ color: 'var(--color-text-light)' }}>
                        {season.stage_count}
                    </span>
                </Link>
            </div>

            {/* Info / edit */}
            <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                        <Calendar size={16} /> {t('league.basicInfo')}
                    </h3>
                    {!editing ? (
                        <button
                            onClick={() => setEditing(true)}
                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all"
                            style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
                        >
                            <Pencil size={12} /> {t('common.edit')}
                        </button>
                    ) : (
                        <div className="flex gap-1.5">
                            <button
                                onClick={() => { setEditing(false); fillForm(season); }}
                                className="text-xs px-3 py-1.5 rounded-lg"
                                style={{ color: 'var(--color-text-light)' }}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white"
                                style={{ background: 'var(--color-primary)' }}
                            >
                                <Save size={12} /> {saving ? t('rankingAdmin.saving') : t('common.save')}
                            </button>
                        </div>
                    )}
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={t('league.fieldName')}>
                        {editing ? (
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border text-sm"
                                style={{ borderColor: 'var(--color-border)' }}
                            />
                        ) : (
                            <span style={{ color: 'var(--color-text)' }}>{season.name}</span>
                        )}
                    </Field>
                    <Field label={t('league.fieldStartTime')}>
                        {editing ? (
                            <input
                                type="datetime-local"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border text-sm"
                                style={{ borderColor: 'var(--color-border)' }}
                            />
                        ) : (
                            <span style={{ color: 'var(--color-text)' }}>{season.start_time?.replace('T', ' ').slice(0, 16) || '-'}</span>
                        )}
                    </Field>
                    <Field label={t('league.fieldEndTime')}>
                        {editing ? (
                            <input
                                type="datetime-local"
                                value={endTime}
                                onChange={e => setEndTime(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border text-sm"
                                style={{ borderColor: 'var(--color-border)' }}
                            />
                        ) : (
                            <span style={{ color: 'var(--color-text)' }}>{season.end_time?.replace('T', ' ').slice(0, 16) || '-'}</span>
                        )}
                    </Field>
                    <Field label={t('league.fieldFlags')}>
                        {editing ? (
                            <div className="flex flex-col gap-1.5 text-sm">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={allowOnline} onChange={e => setAllowOnline(e.target.checked)} />
                                    {t('league.allowOnline')}
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={allowOffline} onChange={e => setAllowOffline(e.target.checked)} />
                                    {t('league.allowOffline')}
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={isCurrent} onChange={e => setIsCurrent(e.target.checked)} />
                                    {t('league.markCurrent')}
                                </label>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2 text-xs">
                                <Tag color="blue" active={season.allow_online}>{t('league.allowOnline')}</Tag>
                                <Tag color="green" active={season.allow_offline}>{t('league.allowOffline')}</Tag>
                                <Tag color="amber" active={season.is_current}>{t('league.currentSeason')}</Tag>
                            </div>
                        )}
                    </Field>
                    <Field label={t('league.fieldDescription')} full>
                        {editing ? (
                            <LeagueMarkdownEditor
                                value={description}
                                onChange={setDescription}
                                seasonId={season.id}
                                rows={14}
                            />
                        ) : season.description?.trim() ? (
                            <LeagueMarkdownBody source={season.description} />
                        ) : (
                            <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>-</span>
                        )}
                    </Field>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={full ? 'md:col-span-2' : ''}>
            <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>
                {label}
            </div>
            <div>{children}</div>
        </div>
    );
}

function Tag({ color, active, children }: { color: 'blue' | 'green' | 'amber'; active: boolean; children: React.ReactNode }) {
    if (!active) {
        return (
            <span className="px-2 py-0.5 rounded-md bg-gray-50 text-gray-400 line-through">
                {children}
            </span>
        );
    }
    const cls =
        color === 'blue' ? 'bg-blue-50 text-blue-600'
        : color === 'green' ? 'bg-green-50 text-green-600'
        : 'bg-amber-50 text-amber-600';
    return <span className={`px-2 py-0.5 rounded-md ${cls}`}>{children}</span>;
}
