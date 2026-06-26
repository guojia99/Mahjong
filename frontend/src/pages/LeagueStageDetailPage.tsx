import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import {
    ChevronRight, BarChart2, Swords, Trophy, Sparkles,
    Users, Gamepad2, Heart,
} from 'lucide-react';
import {
    getLeagueStage, getStageRanking, getStageMatches,
} from '@/api/leagues';
import { sortLeagueMatchesByTime } from '@/utils/sortLeagueMatches';
import LeagueMatchTimeLabel from '@/components/league/LeagueMatchTimeLabel';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import type { LeagueStage, LeagueStagePlayer, LeagueMatch, GroupType, Player } from '@/types';
import { computeLeagueMatchPtBreakdown } from '@/utils/leagueMatchPtBreakdown';
import {
    STAGE_STATUS_LABELS, STAGE_TYPE_I18N_KEY, STAGE_TYPE_LABELS, GROUP_TYPE_LABELS,
} from '@/types';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

function stageIcon(type: string) {
    if (type === 'final') return <Trophy size={22} className="text-amber-600" />;
    if (type === 'semifinal') return <Trophy size={22} className="text-purple-600" />;
    if (type === 'revival') return <Sparkles size={22} className="text-blue-600" />;
    if (type.startsWith('elimination')) return <Swords size={22} className="text-red-600" />;
    return <BarChart2 size={22} className="text-green-600" />;
}

function stageBg(type: string) {
    if (type === 'final') return 'bg-amber-100';
    if (type === 'semifinal') return 'bg-purple-100';
    if (type === 'revival') return 'bg-blue-100';
    if (type.startsWith('elimination')) return 'bg-red-100';
    return 'bg-green-100';
}

function rankEmoji(rank: number) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}`;
}

function formatTenbaiPoints(n: number) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPtShort(n: number) {
    const s = n.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** 本局 PT：+12.1 pt（绿） / -10.2 pt（红） */
function formatSignedRoundPt(n: number): string {
    if (n === 0) return '0 pt';
    const body = formatPtShort(Math.abs(n));
    const sign = n > 0 ? '+' : '-';
    return `${sign}${body} pt`;
}

function resolveMatchPlayers(match: LeagueMatch): Player[] {
    if (match.players?.length) {
        return match.players;
    }
    const scores = match.game_scores ?? [];
    if (scores.length > 0) {
        const seen = new Set<string>();
        const out: Player[] = [];
        for (const row of scores) {
            if (seen.has(row.player_id)) continue;
            seen.add(row.player_id);
            out.push({ id: row.player_id, nickname: row.nickname } as Player);
        }
        if (out.length > 0) return out;
    }
    return (match.scheduled_players ?? []).map((id) => ({ id, nickname: id } as Player));
}

function orderedMatchPlayers(match: LeagueMatch): Player[] {
    const players = resolveMatchPlayers(match);
    const scores = match.game_scores ?? [];
    if (!scores.length) {
        return [...players];
    }
    const byScore = [...scores].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const seen = new Set<string>();
    const out: Player[] = [];
    for (const row of byScore) {
        const p = players.find(x => x.id === row.player_id);
        if (p && !seen.has(p.id)) {
            seen.add(p.id);
            out.push(p);
        }
    }
    for (const p of players) {
        if (!seen.has(p.id)) out.push(p);
    }
    return out;
}

export default function LeagueStageDetailPage() {
    const { t } = useTranslation();
    const { stageId } = useParams<{ stageId: string }>();
    const { showToast } = useToast();
    const [stage, setStage] = useState<LeagueStage | null>(null);
    const [ranking, setRanking] = useState<LeagueStagePlayer[]>([]);
    const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
    const [matches, setMatches] = useState<LeagueMatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ranking' | 'matches'>('ranking');

    const admin = isAdmin();

    const bypassPlayers = stage?.bypass_players ?? [];
    const bypassIds = useMemo(() => new Set(bypassPlayers.map((p) => p.id)), [bypassPlayers]);
    const showBypassBanner =
        !!stage &&
        (stage.stage_type === 'elimination_2' || stage.stage_type === 'elimination_3') &&
        bypassPlayers.length > 0;

    useEffect(() => {
        if (!stageId) return;
        (async () => {
            try {
                const [s, r, m] = await Promise.all([
                    getLeagueStage(stageId),
                    getStageRanking(stageId),
                    getStageMatches(stageId),
                ]);
                setStage(s);
                setRanking(r);
                setMatches(m);
            } catch {
                showToast(t('league.loadFailed'));
            } finally {
                setLoading(false);
            }
        })();
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
        loadPlayerAvatarsForList(avatarPlayerIds).then((map) => {
            if (!cancelled) setPlayerAvatars(map);
        });
        return () => { cancelled = true; };
    }, [avatarPlayerIds]);

    const sortedMatches = useMemo(() => sortLeagueMatchesByTime(matches), [matches]);

    const groupGroups = useMemo(
        () =>
            ranking.reduce<Record<GroupType, LeagueStagePlayer[]>>((acc, sp) => {
                if (!acc[sp.group_type]) acc[sp.group_type] = [];
                acc[sp.group_type].push(sp);
                return acc;
            }, { winners: [], losers: [], none: [] }),
        [ranking],
    );

    if (loading) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('common.loading')}</div>;
    }
    if (!stage) {
        return <div className="text-center py-20" style={{ color: 'var(--color-text-light)' }}>{t('league.loadFailed')}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-light)' }}>
                <Link to="/leagues" className="hover:underline">{t('league.title')}</Link>
                <ChevronRight size={14} />
                <Link to={`/leagues/${stage.season}`} className="hover:underline">{t('league.seasonDetail')}</Link>
                <ChevronRight size={14} />
                <span style={{ color: 'var(--color-text)' }}>{stage.name}</span>
            </div>

            <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-b flex items-center justify-between flex-wrap gap-3" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stageBg(stage.stage_type)}`}>
                            {stageIcon(stage.stage_type)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{stage.name}</h2>
                            <div className="flex items-center gap-3 text-sm mt-1" style={{ color: 'var(--color-text-light)' }}>
                                <span>{t(STAGE_TYPE_I18N_KEY[stage.stage_type], { defaultValue: STAGE_TYPE_LABELS[stage.stage_type] })}</span>
                                <span>{t('league.gamesPerPlayer', { n: stage.games_per_player })}</span>
                                <span>{stage.player_count}{t('common.peopleUnit')}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            stage.status === 'pending' ? 'bg-gray-100 text-gray-500' :
                            stage.status === 'ongoing' ? 'bg-green-100 text-green-700' :
                            'bg-blue-100 text-blue-700'
                        }`}>
                            {STAGE_STATUS_LABELS[stage.status]}
                        </span>
                        {admin && (
                            <Link
                                to={`/league-admin/stages/${stage.id}`}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                            >
                                {t('league.manage')}
                            </Link>
                        )}
                    </div>
                </div>

                <div className="border-b p-4 grid grid-cols-2 md:grid-cols-4 gap-4" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="text-center">
                        <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>{t('league.umaConfig')}</div>
                        <div className="text-sm font-mono">
                            <span className="text-green-600">+{stage.uma_1st}</span>{' / '}
                            <span className="text-green-600">+{stage.uma_2nd}</span>{' / '}
                            <span className="text-red-500">{stage.uma_3rd}</span>{' / '}
                            <span className="text-red-500">{stage.uma_4th}</span>
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>{t('league.returnPoint')}</div>
                        <div className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{stage.base_score}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>{t('league.allowCompanion')}</div>
                        <div className="text-sm font-bold" style={{ color: stage.allow_companion ? '#22c55e' : '#ef4444' }}>
                            {stage.allow_companion ? '✓' : '✗'}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs mb-1" style={{ color: 'var(--color-text-light)' }}>{t('league.freeTable')}</div>
                        <div className="text-sm font-bold" style={{ color: stage.allow_free_table ? '#22c55e' : '#ef4444' }}>
                            {stage.allow_free_table ? '✓' : '✗'}
                        </div>
                    </div>
                </div>

                <div className="border-b flex" style={{ borderColor: 'var(--color-border)' }}>
                    {(['ranking', 'matches'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                                activeTab === tab ? 'border-amber-400 text-amber-600' : 'border-transparent'
                            }`}
                            style={{ color: activeTab === tab ? undefined : 'var(--color-text-light)' }}
                        >
                            {t(`league.tab.${tab}`)}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {activeTab === 'ranking' && (
                        <div className="space-y-6">
                            {showBypassBanner && (
                                <div
                                    className="p-4 rounded-xl border mb-2"
                                    style={{
                                        borderColor: 'var(--color-border)',
                                        background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.45), rgba(255, 247, 237, 0.9))',
                                    }}
                                >
                                    <h4 className="font-semibold mb-1.5 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                        <Trophy size={18} className="text-amber-600 flex-shrink-0" />
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
                            {ranking.length === 0 && (
                                <div className="text-center py-8 text-gray-400">{t('league.noRankingData')}</div>
                            )}
                            {(['winners', 'losers', 'none'] as GroupType[]).map(group => {
                                const players = groupGroups[group];
                                if (!players || players.length === 0) return null;
                                return (
                                    <div key={group}>
                                        {group !== 'none' && (
                                            <h4 className="font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                                <Users size={16} />
                                                {GROUP_TYPE_LABELS[group]}
                                            </h4>
                                        )}
                                        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
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
                                                    {players.slice().sort((a, b) => {
                                                        const ap = (a.games_played || 0) > 0 ? 0 : 1;
                                                        const bp = (b.games_played || 0) > 0 ? 0 : 1;
                                                        if (ap !== bp) return ap - bp;
                                                        if (b.total_pt !== a.total_pt) return b.total_pt - a.total_pt;
                                                        const aSeed = a.seed_label || '';
                                                        const bSeed = b.seed_label || '';
                                                        if (aSeed !== bSeed) return aSeed.localeCompare(bSeed);
                                                        return (a.player.nickname || '').localeCompare(b.player.nickname || '');
                                                    }).map((sp, idx) => {
                                                        const notPlayed = (sp.games_played || 0) === 0;
                                                        const dimStyle = notPlayed ? { opacity: 0.45 } : undefined;
                                                        return (
                                                        <tr
                                                            key={sp.id}
                                                            className="border-t"
                                                            style={{ borderColor: 'var(--color-border)', background: notPlayed ? '#fafafa' : undefined }}
                                                            title={notPlayed ? t('league.notPlayedYet') : undefined}
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
                                                                <span className="flex items-center gap-2">
                                                                    {sp.seed_label && (
                                                                        <span className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                                                            {sp.seed_label}
                                                                        </span>
                                                                    )}
                                                                    {sp.player.nickname}
                                                                    {stage.stage_type === 'elimination_3' && group === 'winners' && bypassIds.has(sp.player.id) && (
                                                                        <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-900 border border-amber-200/80 font-medium">
                                                                            {t('league.bypassBadge')}
                                                                        </span>
                                                                    )}
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
                                                                    {sp.games_played}/{sp.games_per_player || stage.games_per_player}
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
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'matches' && (
                        <div className="space-y-5">
                            {sortedMatches.length === 0 && (
                                <div className="text-center py-10 rounded-3xl border border-dashed border-pink-200/80 bg-gradient-to-br from-pink-50/50 to-rose-50/40 text-pink-300/90">
                                    <Heart className="mx-auto mb-2 opacity-60" size={28} strokeWidth={1.5} />
                                    {t('league.noMatches')}
                                </div>
                            )}
                            {sortedMatches.map((match, matchIdx) => {
                                const gameScores = match.game_scores ?? [];
                                const companionSet = new Set((match.companion_players ?? []).map(String));
                                const breakdown = computeLeagueMatchPtBreakdown(stage, gameScores, companionSet);
                                const playersOrdered = orderedMatchPlayers(match);
                                const canShowPt = match.game_is_scored && gameScores.length >= 4
                                    && gameScores.every(g => g.score != null);

                                return (
                                    <div
                                        key={match.id}
                                        className="rounded-[1.35rem] border border-pink-100/90 bg-gradient-to-br from-pink-50/95 via-rose-50/85 to-amber-50/70 p-4 sm:p-5 shadow-[0_10px_40px_-18px_rgba(244,114,182,0.45)]"
                                    >
                                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <span className="text-sm font-semibold flex items-center gap-2 flex-wrap" style={{ color: 'var(--color-text)' }}>
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-white/80 border border-pink-100 text-pink-500 shadow-sm text-xs font-bold">
                                                        {matchIdx + 1}
                                                    </span>
                                                    <Heart size={14} className="text-pink-400 opacity-80 fill-pink-100" aria-hidden />
                                                    {t('league.matchOrdinal', { n: matchIdx + 1 })}
                                                    {match.round_index > 0 && (
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/90 border border-pink-100 text-pink-600 font-medium">
                                                            R{match.round_index}/T{match.table_index}
                                                        </span>
                                                    )}
                                                    {match.game_is_scored && (
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100/90 text-sky-700 border border-sky-100 font-medium">
                                                            {t('league.matchScored')}
                                                        </span>
                                                    )}
                                                </span>
                                                <LeagueMatchTimeLabel
                                                    match={match}
                                                    className="pl-10 sm:pl-0 text-pink-700/75"
                                                />
                                            </div>
                                            {match.game_id && (
                                                <Link
                                                    to={`/games/${match.game_id}`}
                                                    state={stageId ? { backTo: `/leagues/stage/${stageId}` } : undefined}
                                                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-white/90 border border-pink-100 hover:bg-pink-50 hover:border-pink-200 transition-all font-medium text-pink-700 shadow-sm"
                                                >
                                                    <Gamepad2 size={13} /> {t('league.viewGame')}
                                                </Link>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {playersOrdered.map((p) => {
                                                const isCompanion = companionSet.has(String(p.id));
                                                const row = breakdown.get(String(p.id));
                                                const scoreCell = gameScores.find(gs => gs.player_id === p.id)?.score;

                                                return (
                                                    <div
                                                        key={p.id}
                                                        className={`rounded-2xl px-3 py-3 border transition-all duration-200 ${
                                                            isCompanion
                                                                ? 'bg-slate-100/90 border-slate-200/90 opacity-[0.72] grayscale-[15%]'
                                                                : 'bg-white/85 border-pink-100/80 hover:shadow-md hover:border-pink-200/90 hover:-translate-y-0.5'
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                <span className="text-lg leading-none flex-shrink-0" title={`#${row?.rank ?? '—'}`}>
                                                                    {row ? rankEmoji(row.rank) : '·'}
                                                                </span>
                                                                <Link
                                                                    to={`/player-list/${p.id}`}
                                                                    state={stageId ? { backTo: `/leagues/stage/${stageId}` } : undefined}
                                                                    className={`truncate font-semibold text-sm rounded-lg px-1 -mx-1 transition-colors ${
                                                                        isCompanion
                                                                            ? 'text-slate-500 cursor-pointer hover:text-slate-700'
                                                                            : 'text-pink-950 hover:text-pink-600 hover:bg-pink-50/80'
                                                                    }`}
                                                                >
                                                                    {p.nickname}
                                                                </Link>
                                                                {isCompanion && (
                                                                    <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/90 text-slate-600 font-medium">
                                                                        {t('league.companion')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:text-xs mt-1">
                                                            <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50/80 border border-violet-100/80 px-2 py-1.5 text-center">
                                                                <div className="text-[10px] font-medium text-violet-400 mb-0.5">{t('league.matchTenbai')}</div>
                                                                <div className="font-mono font-bold tabular-nums text-violet-950">
                                                                    {scoreCell != null
                                                                        ? formatTenbaiPoints(scoreCell * 100)
                                                                        : '—'}
                                                                </div>
                                                            </div>

                                                            <div
                                                                className={`rounded-xl border px-2 py-1.5 text-center ${
                                                                    isCompanion
                                                                        ? 'bg-slate-50 border-slate-200'
                                                                        : !canShowPt || !row
                                                                            ? 'bg-slate-50/80 border-slate-100'
                                                                            : row.totalPt > 0
                                                                                ? 'bg-emerald-50/90 border-emerald-100'
                                                                                : row.totalPt < 0
                                                                                    ? 'bg-rose-50/90 border-rose-100'
                                                                                    : 'bg-slate-50/80 border-slate-100'
                                                                }`}
                                                            >
                                                                <div className={`text-[10px] font-medium mb-0.5 ${
                                                                    isCompanion ? 'text-slate-400' : 'text-pink-700/80'
                                                                }`}>
                                                                    {t('league.matchRoundPt')}
                                                                </div>
                                                                <div
                                                                    className={`font-mono font-bold tabular-nums ${
                                                                        isCompanion || !canShowPt || !row
                                                                            ? 'text-slate-400'
                                                                            : row.totalPt > 0
                                                                                ? 'text-emerald-600'
                                                                                : row.totalPt < 0
                                                                                    ? 'text-rose-600'
                                                                                    : 'text-slate-500'
                                                                    }`}
                                                                >
                                                                    {isCompanion
                                                                        ? t('league.matchCompanionNoPt')
                                                                        : !canShowPt || !row
                                                                            ? '—'
                                                                            : formatSignedRoundPt(row.totalPt)}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {isCompanion && (
                                                            <p className="text-[10px] text-slate-400 mt-2 text-center font-medium">
                                                                {t('league.matchCompanionNoPt')}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
