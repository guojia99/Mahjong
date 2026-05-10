import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft, Calendar, ChevronRight, Clock, Layers,
    Plus, Sparkles, Trophy, Upload,
} from 'lucide-react';

import {
    createLeagueSeason,
    getLeagueSeries,
    getSeriesSeasons,
    uploadLeagueSeriesLogo,
} from '@/api/leagues';
import Modal from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import type { LeagueSeason, LeagueSeries } from '@/types';
import { LEAGUE_SEASON_STATUS_LABELS } from '@/types';

export default function LeagueSeriesAdminPage() {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const { seriesId } = useParams<{ seriesId: string }>();

    const [series, setSeries] = useState<LeagueSeries | null>(null);
    const [seasons, setSeasons] = useState<LeagueSeason[]>([]);
    const [loading, setLoading] = useState(true);
    const logoInputRef = useRef<HTMLInputElement>(null);

    const [showModal, setShowModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [isCurrent, setIsCurrent] = useState(true);

    useEffect(() => {
        if (!seriesId) return;
        (async () => {
            try {
                const [s, ss] = await Promise.all([
                    getLeagueSeries(seriesId),
                    getSeriesSeasons(seriesId),
                ]);
                setSeries(s);
                setSeasons(ss);
            } catch {
                showToast(t('league.loadFailed'));
            } finally {
                setLoading(false);
            }
        })();
    }, [seriesId, t, showToast]);

    async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !seriesId) return;
        try {
            const updated = await uploadLeagueSeriesLogo(seriesId, file);
            setSeries(updated);
            showToast(t('league.logoUpdated'), 'success');
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { error?: string } } })?.response?.data?.error
                || t('league.actionFailed');
            showToast(msg);
        } finally {
            e.target.value = '';
        }
    }

    async function handleCreate() {
        if (!seriesId || !newName.trim()) return;
        try {
            const created = await createLeagueSeason(seriesId, {
                name: newName.trim(),
                description: newDesc.trim(),
                is_current: isCurrent,
            });
            // 切换 current：把其它 season 的 is_current 置为 false
            setSeasons(prev => {
                const next = prev.map(p =>
                    isCurrent ? { ...p, is_current: false } : p,
                );
                return [created, ...next];
            });
            setShowModal(false);
            setNewName('');
            setNewDesc('');
            setIsCurrent(true);
            showToast(t('league.seasonCreated'), 'success');
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { error?: string } } })?.response?.data?.error
                || t('league.actionFailed');
            showToast(msg);
        }
    }

    const statusColor = (s: string) =>
        s === 'registration' ? 'bg-blue-100 text-blue-700'
        : s === 'ongoing' ? 'bg-green-100 text-green-700'
        : 'bg-gray-100 text-gray-500';

    if (loading) {
        return (
            <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>
                {t('common.loading')}
            </div>
        );
    }

    if (!series) {
        return (
            <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>
                {t('league.loadFailed')}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {ToastComponent}

            <div className="flex items-center gap-3">
                <Link
                    to="/league-admin"
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    style={{ color: 'var(--color-text-light)' }}
                >
                    <ArrowLeft size={18} />
                </Link>
                <Trophy size={20} className="text-amber-500" />
                <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                    {series.name}
                </h2>
            </div>

            {series.description && (
                <div className="p-4 rounded-2xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text-light)' }}>
                        {series.description}
                    </p>
                </div>
            )}

            <div
                className="p-4 rounded-2xl border bg-white flex flex-col sm:flex-row gap-4 items-start"
                style={{ borderColor: 'var(--color-border)' }}
            >
                <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        {t('league.logoSection')}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-light)' }}>
                        {t('league.logoHint')}
                    </p>
                    <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={handleLogoChange}
                    />
                    <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-xl transition-all border"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                        <Upload size={14} /> {t('league.uploadLogo')}
                    </button>
                </div>
                {series.logo_url ? (
                    <img
                        src={series.logo_url}
                        alt=""
                        className="w-28 h-28 object-cover rounded-xl border flex-shrink-0"
                        style={{ borderColor: 'var(--color-border)' }}
                    />
                ) : null}
            </div>

            <div className="flex items-center justify-between">
                <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>
                    {t('league.seasonList')} ({seasons.length})
                </h3>
                <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-xl transition-all"
                    style={{ background: 'var(--color-primary)', color: 'white' }}
                >
                    <Plus size={14} /> {t('league.newSeason')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {seasons.map(s => (
                    <Link
                        key={s.id}
                        to={`/league-admin/seasons/${s.id}`}
                        className={`block p-4 rounded-2xl border transition-all hover:shadow-md ${
                            s.is_current ? 'border-amber-300 bg-amber-50/50' : 'bg-white'
                        }`}
                        style={s.is_current ? undefined : { borderColor: 'var(--color-border)' }}
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
                                        {s.name}
                                    </h4>
                                    {s.is_current && (
                                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                                            <Sparkles size={10} /> {t('league.currentSeason')}
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                                    {t('league.seasonNumber', { n: s.season_number })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(s.status)}`}>
                                    {LEAGUE_SEASON_STATUS_LABELS[s.status]}
                                </span>
                                <ChevronRight size={16} className="text-gray-300" />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--color-text-light)' }}>
                            <span className="flex items-center gap-1">
                                <Layers size={12} /> {s.player_count}{t('common.peopleUnit')}
                            </span>
                            <span className="flex items-center gap-1">
                                <Calendar size={12} /> {s.stage_count}{t('league.stageUnit')}
                            </span>
                            {s.start_time && (
                                <span className="flex items-center gap-1">
                                    <Clock size={12} /> {s.start_time.slice(0, 10)}
                                </span>
                            )}
                        </div>
                    </Link>
                ))}
                {seasons.length === 0 && (
                    <div className="col-span-full text-center py-12 rounded-2xl border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                            {t('league.noSeasons')}
                        </p>
                    </div>
                )}
            </div>

            <Modal open={showModal} onClose={() => setShowModal(false)} title={t('league.createSeason')}>
                <div className="space-y-3">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder={t('league.seasonNamePlaceholder')}
                        className="w-full px-4 py-2 rounded-xl border text-sm"
                        style={{ borderColor: 'var(--color-border)' }}
                    />
                    <textarea
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                        rows={3}
                        placeholder={t('league.seasonDescPlaceholder')}
                        className="w-full px-4 py-2 rounded-xl border text-sm resize-none"
                        style={{ borderColor: 'var(--color-border)' }}
                    />
                    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                        <input
                            type="checkbox"
                            checked={isCurrent}
                            onChange={e => setIsCurrent(e.target.checked)}
                            className="rounded"
                        />
                        {t('league.markCurrent')}
                    </label>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={() => setShowModal(false)}
                        className="px-4 py-2 rounded-xl text-sm"
                        style={{ color: 'var(--color-text-light)' }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                        style={{ background: 'var(--color-primary)' }}
                    >
                        {t('common.create')}
                    </button>
                </div>
            </Modal>
        </div>
    );
}
