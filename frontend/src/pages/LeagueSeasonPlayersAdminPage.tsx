import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft, CheckSquare, Lock, Search, Square,
    UserMinus, UserPlus, Users,
} from 'lucide-react';

import {
    batchRegisterPlayers,
    getLeagueSeason,
    getSeasonPlayers,
    unregisterPlayer,
} from '@/api/leagues';
import { getPlayers } from '@/api/players';
import { useToast } from '@/hooks/useToast';
import type { LeagueSeason, LeagueSeasonPlayerItem, Player } from '@/types';

function avatarUrl(p: Pick<Player, 'avatar' | 'nickname'>) {
    if (p.avatar) return p.avatar;
    return null;
}

function Avatar({ player, size = 36 }: { player: Pick<Player, 'avatar' | 'nickname'>; size?: number }) {
    const url = avatarUrl(player);
    if (url) {
        return (
            <img
                src={url}
                alt={player.nickname}
                width={size}
                height={size}
                className="rounded-full object-cover flex-shrink-0"
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <div
            className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{
                width: size,
                height: size,
                fontSize: Math.max(10, Math.floor(size * 0.4)),
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
            }}
        >
            {(player.nickname || '?').slice(0, 1).toUpperCase()}
        </div>
    );
}

export default function LeagueSeasonPlayersAdminPage() {
    const { t } = useTranslation();
    const { showToast, ToastComponent } = useToast();
    const { seasonId } = useParams<{ seasonId: string }>();

    const [season, setSeason] = useState<LeagueSeason | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [seasonPlayers, setSeasonPlayers] = useState<LeagueSeasonPlayerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [requireMajsoul, setRequireMajsoul] = useState(true);

    useEffect(() => {
        if (!seasonId) return;
        let cancelled = false;
        (async () => {
            const settled = await Promise.allSettled([
                getLeagueSeason(seasonId),
                getPlayers(),
                getSeasonPlayers(seasonId),
            ]);
            if (cancelled) return;
            const [seasonResult, playersResult, seasonPlayersResult] = settled;

            if (seasonResult.status === 'fulfilled') {
                setSeason(seasonResult.value);
            } else {
                console.error('[LeagueSeasonPlayers] getLeagueSeason failed', seasonResult.reason);
                showToast(t('league.loadFailed'));
            }
            if (playersResult.status === 'fulfilled') {
                setPlayers(Array.isArray(playersResult.value) ? playersResult.value : []);
            } else {
                console.error('[LeagueSeasonPlayers] getPlayers failed', playersResult.reason);
            }
            if (seasonPlayersResult.status === 'fulfilled') {
                setSeasonPlayers(seasonPlayersResult.value);
            } else {
                console.error('[LeagueSeasonPlayers] getSeasonPlayers failed', seasonPlayersResult.reason);
            }
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [seasonId, t, showToast]);

    const registeredIds = useMemo(
        () => new Set(seasonPlayers.map(sp => sp.player.id)),
        [seasonPlayers],
    );

    const availablePlayers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return players.filter(p => {
            if (registeredIds.has(p.id)) return false;
            if (requireMajsoul && (!p.majsoul_uids || p.majsoul_uids.length === 0)) return false;
            if (!q) return true;
            return (
                p.nickname.toLowerCase().includes(q)
                || (p.real_name || '').toLowerCase().includes(q)
                || (p.majsoul_uids || []).some(uid => String(uid).includes(q))
            );
        });
    }, [players, registeredIds, search, requireMajsoul]);

    const playersWithoutMajsoul = useMemo(
        () => players.filter(p => !registeredIds.has(p.id) && (!p.majsoul_uids || p.majsoul_uids.length === 0)).length,
        [players, registeredIds],
    );

    const isLocked = season?.status !== 'registration';

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleAll() {
        if (availablePlayers.every(p => selected.has(p.id))) {
            setSelected(prev => {
                const next = new Set(prev);
                for (const p of availablePlayers) next.delete(p.id);
                return next;
            });
        } else {
            setSelected(prev => {
                const next = new Set(prev);
                for (const p of availablePlayers) next.add(p.id);
                return next;
            });
        }
    }

    async function handleBatchRegister() {
        if (!seasonId || selected.size === 0) return;
        try {
            const ids = Array.from(selected);
            await batchRegisterPlayers(seasonId, ids);
            const sp = await getSeasonPlayers(seasonId);
            setSeasonPlayers(sp);
            setSelected(new Set());
            showToast(t('league.registerSuccess'), 'success');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || t('league.actionFailed');
            showToast(msg);
        }
    }

    async function handleUnregister(playerId: string) {
        if (!seasonId) return;
        if (!confirm(t('league.unregisterConfirm'))) return;
        try {
            await unregisterPlayer(seasonId, playerId);
            setSeasonPlayers(prev => prev.filter(sp => sp.player.id !== playerId));
            showToast(t('league.unregisterSuccess'), 'success');
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
                <Users size={20} className="text-blue-500" />
                <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                        {t('league.playerManagement')}
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                        {season.name}
                    </p>
                </div>
                {isLocked && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-orange-50 text-orange-600">
                        <Lock size={12} /> {t('league.registrationLocked')}
                    </span>
                )}
            </div>

            {/* Registered players (card mode) */}
            <section className="rounded-2xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                <header className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                    <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                        <Users size={16} />
                        {t('league.registeredPlayers')}
                        <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            {seasonPlayers.length}
                        </span>
                    </h3>
                </header>
                {seasonPlayers.length === 0 ? (
                    <div className="text-center py-12 text-sm" style={{ color: 'var(--color-text-light)' }}>
                        <Users size={32} className="mx-auto mb-3 text-gray-300" />
                        {t('league.noPlayers')}
                    </div>
                ) : (
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {seasonPlayers.map(sp => (
                            <div
                                key={sp.id}
                                className="relative rounded-xl border bg-gradient-to-br from-white to-amber-50/30 p-3 transition-all hover:shadow-md hover:border-amber-200"
                                style={{ borderColor: 'var(--color-border)' }}
                            >
                                {sp.seed_label && (
                                    <span className="absolute top-2 right-2 w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
                                        {sp.seed_label}
                                    </span>
                                )}
                                <div className="flex items-center gap-2.5 mb-2">
                                    <Avatar player={sp.player} size={36} />
                                    <div className="min-w-0 flex-1 pr-6">
                                        <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                                            {sp.player.nickname}
                                        </div>
                                        {sp.player.real_name && (
                                            <div className="text-[11px] truncate" style={{ color: 'var(--color-text-light)' }}>
                                                {sp.player.real_name}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {sp.player.majsoul_uids && sp.player.majsoul_uids.length > 0 && (
                                    <div className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-light)' }}>
                                        UID {sp.player.majsoul_uids.join(' / ')}
                                    </div>
                                )}
                                {!isLocked && (
                                    <button
                                        onClick={() => handleUnregister(sp.player.id)}
                                        className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 transition-all border"
                                        style={{ borderColor: 'var(--color-border)' }}
                                    >
                                        <UserMinus size={11} /> {t('league.unregister')}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Add players (only when registration open, card mode) */}
            {!isLocked && (
                <section className="rounded-2xl border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                    <header className="px-5 py-3 border-b flex flex-col sm:flex-row sm:items-center gap-2 justify-between" style={{ borderColor: 'var(--color-border)' }}>
                        <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                            <UserPlus size={16} />
                            {t('league.addPlayers')}
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                                {availablePlayers.length}
                            </span>
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={t('common.search')}
                                    className="pl-8 pr-3 py-1.5 rounded-lg border text-sm"
                                    style={{ borderColor: 'var(--color-border)' }}
                                />
                            </div>
                            <button
                                onClick={toggleAll}
                                disabled={availablePlayers.length === 0}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-50"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}
                            >
                                <CheckSquare size={12} /> {t('common.all')}
                            </button>
                            <button
                                onClick={handleBatchRegister}
                                disabled={selected.size === 0}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: 'var(--color-primary)' }}
                            >
                                <UserPlus size={12} /> {t('league.batchRegister')} ({selected.size})
                            </button>
                        </div>
                    </header>

                    <div className="px-5 py-2.5 border-b flex items-center justify-between text-xs flex-wrap gap-2" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={requireMajsoul}
                                onChange={e => setRequireMajsoul(e.target.checked)}
                                className="accent-amber-500"
                            />
                            {t('league.onlyWithMajsoul')}
                        </label>
                        {requireMajsoul && playersWithoutMajsoul > 0 && (
                            <span>
                                {t('league.playersWithoutMajsoulHidden', { n: playersWithoutMajsoul })}
                            </span>
                        )}
                    </div>

                    <div className="p-4">
                        {availablePlayers.length === 0 ? (
                            <div className="text-center py-12 text-sm" style={{ color: 'var(--color-text-light)' }}>
                                <UserPlus size={32} className="mx-auto mb-3 text-gray-300" />
                                {requireMajsoul && playersWithoutMajsoul > 0 ? (
                                    <>
                                        {t('league.noAvailableMajsoulPlayers')}
                                        <button
                                            onClick={() => setRequireMajsoul(false)}
                                            className="block mx-auto mt-2 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                                            style={{ borderColor: 'var(--color-border)' }}
                                        >
                                            {t('league.showAllPlayers')}
                                        </button>
                                    </>
                                ) : (
                                    t('league.noAvailablePlayers')
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {availablePlayers.map(p => {
                                    const checked = selected.has(p.id);
                                    return (
                                        <button
                                            type="button"
                                            key={p.id}
                                            onClick={() => toggle(p.id)}
                                            className={`relative text-left rounded-xl border p-3 transition-all hover:shadow-md ${
                                                checked
                                                    ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
                                                    : 'bg-white hover:border-amber-200'
                                            }`}
                                            style={!checked ? { borderColor: 'var(--color-border)' } : undefined}
                                        >
                                            <span className="absolute top-2 right-2">
                                                {checked ? (
                                                    <CheckSquare size={16} className="text-amber-500" />
                                                ) : (
                                                    <Square size={16} className="text-gray-300" />
                                                )}
                                            </span>
                                            <div className="flex items-center gap-2.5 mb-2">
                                                <Avatar player={p} size={36} />
                                                <div className="min-w-0 flex-1 pr-6">
                                                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                                                        {p.nickname}
                                                    </div>
                                                    {p.real_name && (
                                                        <div className="text-[11px] truncate" style={{ color: 'var(--color-text-light)' }}>
                                                            {p.real_name}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {p.majsoul_uids && p.majsoul_uids.length > 0 ? (
                                                <div className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-light)' }}>
                                                    UID {p.majsoul_uids.join(' / ')}
                                                </div>
                                            ) : (
                                                <div className="text-[11px]" style={{ color: 'var(--color-text-light)' }}>
                                                    <span className="px-1.5 py-0.5 rounded bg-gray-100">{t('league.noMajsoulUid')}</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {isLocked && (
                <div className="p-4 rounded-2xl border-2 border-dashed text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-light)' }}>
                    <Lock size={20} className="inline-block mr-2 align-text-bottom" />
                    {t('league.registrationLockedHint')}
                </div>
            )}
        </div>
    );
}
