import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, Plus, Settings, Sparkles, Trash2, Trophy } from 'lucide-react';

import {
    createLeagueSeries,
    deleteLeagueSeries,
    getLeagueSeriesList,
} from '@/api/leagues';
import Modal from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import type { LeagueSeries } from '@/types';

export default function LeagueAdminPage() {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const [allSeries, setAllSeries] = useState<LeagueSeries[]>([]);
    const [loading, setLoading] = useState(true);

    const [showModal, setShowModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setAllSeries(await getLeagueSeriesList());
            } catch {
                showToast(t('league.loadFailed'));
            } finally {
                setLoading(false);
            }
        })();
    }, [t, showToast]);

    async function handleCreate() {
        if (!newName.trim()) return;
        try {
            const s = await createLeagueSeries({
                name: newName.trim(),
                description: newDesc.trim(),
            });
            setAllSeries(prev => [s, ...prev]);
            setShowModal(false);
            setNewName('');
            setNewDesc('');
            showToast(t('league.seriesCreated'), 'success');
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    async function handleDelete(s: LeagueSeries) {
        if (!confirm(t('league.deleteSeriesConfirm', { name: s.name }))) return;
        try {
            await deleteLeagueSeries(s.id);
            setAllSeries(prev => prev.filter(x => x.id !== s.id));
            showToast(t('league.seriesDeleted'), 'success');
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    return (
        <div className="space-y-6">
            {ToastComponent}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md">
                        <Settings size={22} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                            {t('league.adminTitle')}
                        </h2>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                            {t('league.adminSubtitle')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-xl transition-all"
                    style={{ background: 'var(--color-primary)', color: 'white' }}
                >
                    <Plus size={14} /> {t('league.createSeries')}
                </button>
            </div>

            {loading ? (
                <div className="text-center py-16" style={{ color: 'var(--color-text-light)' }}>
                    {t('common.loading')}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allSeries.map(s => (
                        <div
                            key={s.id}
                            className="rounded-2xl border bg-white hover:shadow-lg hover:border-amber-200 transition-all group relative"
                            style={{ borderColor: 'var(--color-border)' }}
                        >
                            <Link to={`/league-admin/series/${s.id}`} className="block p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                                        <Trophy size={22} className="text-white" />
                                    </div>
                                    <ChevronRight size={18} className="text-gray-300 group-hover:text-amber-400 transition-colors" />
                                </div>
                                <h4 className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>
                                    {s.name}
                                </h4>
                                {s.description && (
                                    <p className="text-sm mb-2 line-clamp-2" style={{ color: 'var(--color-text-light)' }}>
                                        {s.description}
                                    </p>
                                )}
                                <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-light)' }}>
                                    <span className="flex items-center gap-1">
                                        <Calendar size={13} /> {s.season_count}{t('league.seasonUnit')}
                                    </span>
                                </div>
                                {s.current_season_name && (
                                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">
                                        <Sparkles size={12} /> {s.current_season_name}
                                    </div>
                                )}
                            </Link>
                            <button
                                type="button"
                                onClick={() => handleDelete(s)}
                                title={t('common.delete')}
                                className="absolute top-3 right-12 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {allSeries.length === 0 && (
                        <div className="col-span-full text-center py-16 rounded-2xl border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                            <Trophy size={40} className="mx-auto mb-3 text-gray-300" />
                            <p style={{ color: 'var(--color-text-light)' }}>{t('league.noSeries')}</p>
                        </div>
                    )}
                </div>
            )}

            <Modal open={showModal} onClose={() => setShowModal(false)} title={t('league.createSeries')}>
                <div className="space-y-3">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder={t('league.seriesNamePlaceholder')}
                        className="w-full px-4 py-2 rounded-xl border text-sm"
                        style={{ borderColor: 'var(--color-border)' }}
                    />
                    <textarea
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                        placeholder={t('league.seriesDescPlaceholder')}
                        rows={3}
                        className="w-full px-4 py-2 rounded-xl border text-sm resize-none"
                        style={{ borderColor: 'var(--color-border)' }}
                    />
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
