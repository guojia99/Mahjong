import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft, BarChart2, ChevronDown, ChevronUp, Layers,
    Lock, Plus, Settings, Sparkles, Trash2, Trophy,
} from 'lucide-react';

import {
    createLeagueStage,
    createStandardStages,
    deleteLeagueStage,
    getLeagueSeason,
    getLeagueStages,
    reorderStages,
} from '@/api/leagues';
import Modal from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import type { LeagueSeason, LeagueStage, StageType } from '@/types';
import {
    STAGE_STATUS_LABELS, STAGE_TYPE_I18N_KEY, STAGE_TYPE_LABELS,
} from '@/types';

function stageIcon(type: string) {
    if (type === 'final') return <Trophy size={18} className="text-amber-600" />;
    if (type === 'semifinal') return <Trophy size={18} className="text-purple-600" />;
    if (type === 'revival') return <Sparkles size={18} className="text-blue-600" />;
    if (type.startsWith('elimination')) return <Layers size={18} className="text-red-600" />;
    return <BarChart2 size={18} className="text-green-600" />;
}

export default function LeagueSeasonStagesAdminPage() {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const { seasonId } = useParams<{ seasonId: string }>();

    const [season, setSeason] = useState<LeagueSeason | null>(null);
    const [stages, setStages] = useState<LeagueStage[]>([]);
    const [loading, setLoading] = useState(true);

    const [showAddModal, setShowAddModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<StageType>('swiss');
    const [newGames, setNewGames] = useState(8);
    const [newU1, setNewU1] = useState(20);
    const [newU2, setNewU2] = useState(10);
    const [newU3, setNewU3] = useState(-10);
    const [newU4, setNewU4] = useState(-20);

    function resetForm() {
        setNewName('');
        setNewType('swiss');
        setNewGames(8);
        setNewU1(20);
        setNewU2(10);
        setNewU3(-10);
        setNewU4(-20);
    }

    async function handleCreate() {
        if (!seasonId || !newName.trim()) return;
        try {
            const created = await createLeagueStage(seasonId, {
                name: newName.trim(),
                stage_type: newType,
                games_per_player: newGames,
                uma_1st: newU1,
                uma_2nd: newU2,
                uma_3rd: newU3,
                uma_4th: newU4,
            });
            setStages(prev => [...prev, created]);
            setShowAddModal(false);
            resetForm();
            showToast(t('league.stageCreated'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    useEffect(() => {
        if (!seasonId) return;
        (async () => {
            try {
                const [s, st] = await Promise.all([
                    getLeagueSeason(seasonId),
                    getLeagueStages(seasonId),
                ]);
                setSeason(s);
                setStages(st);
            } catch {
                showToast(t('league.loadFailed'));
            } finally {
                setLoading(false);
            }
        })();
    }, [seasonId, t, showToast]);

    const isRegistration = season?.status === 'registration';
    const registeredCount = season?.player_count ?? 0;
    const templateFormat: 'compact' | 'standard' | 'insufficient' =
        registeredCount >= 16 ? 'standard' : registeredCount >= 12 ? 'compact' : 'insufficient';

    async function handleApplyStandard() {
        if (!seasonId) return;
        const playerCount = season?.player_count ?? 0;
        const confirmKey = playerCount >= 16
            ? 'league.applyStandardConfirm'
            : playerCount >= 12
                ? 'league.applyStandardConfirmCompact'
                : 'league.applyStandardConfirm';
        if (!confirm(t(confirmKey))) return;
        try {
            const res = await createStandardStages(seasonId);
            setStages(res.stages);
            const toastKey = res.format === 'compact'
                ? 'league.standardStagesCreatedCompact'
                : 'league.standardStagesCreated';
            showToast(t(toastKey), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleDelete(stage: LeagueStage) {
        if (!confirm(t('league.deleteStageConfirm', { name: stage.name }))) return;
        try {
            await deleteLeagueStage(stage.id);
            setStages(prev => prev.filter(s => s.id !== stage.id));
            showToast(t('league.stageDeleted'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleMove(idx: number, dir: -1 | 1) {
        if (!seasonId) return;
        const next = [...stages];
        const swap = idx + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setStages(next);
        try {
            await reorderStages(seasonId, next.map(s => s.id));
        } catch {
            showToast(t('league.actionFailed'));
        }
    }

    if (loading) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('common.loading')}</div>;
    }

    if (!season) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('league.loadFailed')}</div>;
    }

    return (
        <div className="space-y-6">
            {ToastComponent}

            <div className="flex items-center gap-3">
                <Link
                    to={`/league-admin/seasons/${seasonId}`}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                    style={{ color: 'var(--color-text-light)' }}
                >
                    <ArrowLeft size={18} />
                </Link>
                <Layers size={20} className="text-amber-500" />
                <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                        {t('league.stageManagement')}
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                        {season.name}
                    </p>
                </div>
                {!isRegistration && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-orange-50 text-orange-600">
                        <Lock size={12} /> {t('league.stagesLocked')}
                    </span>
                )}
            </div>

            {/* Standard template */}
            {isRegistration && (
                <div className="rounded-2xl border-2 border-dashed bg-gradient-to-br from-amber-50 to-orange-50 p-5" style={{ borderColor: 'rgb(252 211 77)' }}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="font-bold flex items-center gap-2 mb-1" style={{ color: 'var(--color-text)' }}>
                                <Sparkles size={16} className="text-amber-500" />
                                {t('league.standardTemplateTitle')}
                            </h3>
                            <p className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                                {templateFormat === 'compact'
                                    ? t('league.standardTemplateDescCompact', { n: registeredCount })
                                    : templateFormat === 'standard'
                                        ? t('league.standardTemplateDesc')
                                        : t('league.standardTemplateNeedPlayers', { n: registeredCount })}
                            </p>
                            {templateFormat === 'standard' && (
                            <ul className="mt-2 text-xs space-y-0.5" style={{ color: 'var(--color-text-light)' }}>
                                <li>1. {t('league.stageType.swiss')} (8半庄)</li>
                                <li>2~4. {t('league.stageType.elimination1')} / {t('league.stageType.elimination2')} / {t('league.stageType.elimination3')} (各4半庄)</li>
                                <li>5. {t('league.stageType.revival')} (4半庄)</li>
                                <li>6. {t('league.stageType.semifinal')} (6半庄)</li>
                                <li>7. {t('league.stageType.final')} (4半庄)</li>
                            </ul>
                            )}
                            {templateFormat === 'compact' && (
                            <ul className="mt-2 text-xs space-y-0.5" style={{ color: 'var(--color-text-light)' }}>
                                <li>1. {t('league.stageType.swiss')} (8半庄，前6胜者组)</li>
                                <li>2~3. {t('league.stageType.elimination1')} / {t('league.stageType.elimination2')} (各4半庄)</li>
                                <li>4. {t('league.stageType.elimination3')} (8人混打4半庄)</li>
                                <li>5. {t('league.stageType.semifinal')} (6半庄)</li>
                                <li>6. {t('league.stageType.final')} (4半庄)</li>
                            </ul>
                            )}
                        </div>
                        <button
                            onClick={handleApplyStandard}
                            disabled={templateFormat === 'insufficient'}
                            className="self-center inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'var(--color-primary)' }}
                        >
                            <Sparkles size={14} /> {t('league.applyStandard')}
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {stages.length === 0 ? (
                    <div className="text-center py-12 rounded-2xl border-2 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
                            {t('league.noStages')}
                        </p>
                    </div>
                ) : (
                    stages.map((stage, idx) => (
                        <div
                            key={stage.id}
                            className="p-4 rounded-2xl border bg-white flex items-center gap-3"
                            style={{ borderColor: 'var(--color-border)' }}
                        >
                            <div className="flex flex-col gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => handleMove(idx, -1)}
                                    disabled={!isRegistration || idx === 0}
                                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--color-text-light)' }}
                                >
                                    <ChevronUp size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleMove(idx, 1)}
                                    disabled={!isRegistration || idx === stages.length - 1}
                                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--color-text-light)' }}
                                >
                                    <ChevronDown size={14} />
                                </button>
                            </div>
                            <span className="w-7 h-7 rounded-lg bg-gray-100 inline-flex items-center justify-center text-xs font-bold" style={{ color: 'var(--color-text-light)' }}>
                                {stage.order}
                            </span>
                            <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50">
                                {stageIcon(stage.stage_type)}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
                                        {stage.name}
                                    </h4>
                                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100" style={{ color: 'var(--color-text-light)' }}>
                                        {t(STAGE_TYPE_I18N_KEY[stage.stage_type], { defaultValue: STAGE_TYPE_LABELS[stage.stage_type] })}
                                    </span>
                                </div>
                                <div className="text-xs mt-1 flex flex-wrap gap-2" style={{ color: 'var(--color-text-light)' }}>
                                    <span>{stage.games_per_player}{t('league.gamesUnit')}</span>
                                    <span>uma {stage.uma_1st}/{stage.uma_2nd}/{stage.uma_3rd}/{stage.uma_4th}</span>
                                    <span>{stage.player_count}{t('common.peopleUnit')}</span>
                                    <span>{stage.game_count} matches</span>
                                </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                stage.status === 'pending' ? 'bg-gray-100 text-gray-500'
                                : stage.status === 'ongoing' ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                                {STAGE_STATUS_LABELS[stage.status]}
                            </span>
                            <Link
                                to={`/league-admin/stages/${stage.id}`}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-all"
                                style={{ color: 'var(--color-text-light)' }}
                                title={t('common.edit')}
                            >
                                <Settings size={16} />
                            </Link>
                            {isRegistration && (
                                <button
                                    onClick={() => handleDelete(stage)}
                                    className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-all"
                                    title={t('common.delete')}
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>

            {isRegistration && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                        <Plus size={14} /> {t('league.addStage')}
                    </button>
                </div>
            )}

            <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title={t('league.createStage')}>
                <div className="space-y-3">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder={t('league.stageNamePlaceholder')}
                        className="w-full px-3 py-2 rounded-xl border text-sm"
                        style={{ borderColor: 'var(--color-border)' }}
                    />
                    <select
                        value={newType}
                        onChange={e => setNewType(e.target.value as StageType)}
                        className="w-full px-3 py-2 rounded-xl border text-sm bg-white"
                        style={{ borderColor: 'var(--color-border)' }}
                    >
                        {(Object.keys(STAGE_TYPE_LABELS) as StageType[]).map(k => (
                            <option key={k} value={k}>
                                {t(STAGE_TYPE_I18N_KEY[k], { defaultValue: STAGE_TYPE_LABELS[k] })}
                            </option>
                        ))}
                    </select>
                    <div>
                        <label className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                            {t('league.gamesPerPlayerLabel')}
                        </label>
                        <input
                            type="number"
                            value={newGames}
                            onChange={e => setNewGames(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 rounded-xl border text-sm"
                            style={{ borderColor: 'var(--color-border)' }}
                        />
                    </div>
                    <div>
                        <label className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                            {t('league.umaConfig')}
                        </label>
                        <div className="grid grid-cols-4 gap-2 mt-1">
                            {[
                                { v: newU1, set: setNewU1 },
                                { v: newU2, set: setNewU2 },
                                { v: newU3, set: setNewU3 },
                                { v: newU4, set: setNewU4 },
                            ].map((item, i) => (
                                <div key={i}>
                                    <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                                        {i + 1}{t('league.umaLabel')}
                                    </div>
                                    <input
                                        type="number"
                                        value={item.v}
                                        onChange={e => item.set(parseFloat(e.target.value) || 0)}
                                        className="w-full px-2 py-1.5 rounded-lg border text-sm"
                                        style={{ borderColor: 'var(--color-border)' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={() => setShowAddModal(false)}
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
