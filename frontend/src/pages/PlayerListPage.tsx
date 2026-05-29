import { useState, useMemo } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getPlayers } from '@/api/players';
import SearchBar from '@/components/SearchBar';
import RankTierBadge from '@/components/RankTierBadge';
import type { Player, RankTier } from '@/types';
import { Users } from 'lucide-react';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

type PlayerListItem = Player & {
  ranking_tier?: RankTier | null;
  ranking_score?: number | null;
  total_game_count?: number;
  last_game_time?: string | null;
};

type SortKey = 'default' | 'ranking_score' | 'total_game_count' | 'last_game_time';

export default function PlayerListPage() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');

  useAbortableEffect((signal) => {
    getPlayers(query, { signal })
      .then((data) => setPlayers(data as PlayerListItem[]))
      .catch((e) => {
        if (!isAbortError(e)) throw e;
      });
  }, [query]);

  const sorted = useMemo(() => {
    if (sortKey === 'default') return players;
    const arr = [...players];
    arr.sort((a, b) => {
      if (sortKey === 'ranking_score') return (b.ranking_score ?? -Infinity) - (a.ranking_score ?? -Infinity);
      if (sortKey === 'total_game_count') return (b.total_game_count ?? 0) - (a.total_game_count ?? 0);
      if (sortKey === 'last_game_time') {
        const ta = a.last_game_time ?? '';
        const tb = b.last_game_time ?? '';
        return tb.localeCompare(ta);
      }
      return 0;
    });
    return arr;
  }, [players, sortKey]);

  const playerIds = useMemo(() => {
    return [...new Set(sorted.map((p) => p.id))];
  }, [sorted]);

  useAbortableEffect((signal) => {
    if (playerIds.length === 0) return;
    loadPlayerAvatarsForList(playerIds, signal).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [playerIds]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'default', label: t('playerList.sortDefault') },
    { key: 'ranking_score', label: t('playerList.sortRankingScore') },
    { key: 'total_game_count', label: t('playerList.sortTotalGames') },
    { key: 'last_game_time', label: t('playerList.sortLastGame') },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar query={query} onQueryChange={setQuery} placeholder={t('playerList.searchPlaceholder')} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="btn btn-sm"
              style={{
                background: sortKey === opt.key ? 'var(--color-primary-light)' : 'transparent',
                color: sortKey === opt.key ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                border: sortKey === opt.key ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
              onClick={() => setSortKey(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state card">
          <Users size={48} style={{ margin: '0 auto 1rem' }} />
          <p>{t('playerList.noPlayers')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sorted.map((player) => {
            const tier = player.ranking_tier ?? null;
            const score = player.ranking_score ?? null;
            const scoreVal = Math.round((score ?? 0) * 100) / 100;
            return (
              <Link
                key={player.id}
                to={`/player-list/${player.id}`}
                className="card transition-all hover:shadow-md"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="flex items-start gap-3">
                  {(playerAvatars[player.id] || player.avatar) ? (
                    <img src={playerAvatars[player.id] || player.avatar} alt={player.nickname} className="avatar" style={{ width: '2.75rem', height: '2.75rem', minWidth: '2.75rem' }} />
                  ) : (
                    <div className="avatar-placeholder" style={{ width: '2.75rem', height: '2.75rem', minWidth: '2.75rem', fontSize: '1rem' }}>
                      {player.nickname.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-sm">{player.nickname}</div>
                    {tier && (
                      <div className="mt-1">
                        <RankTierBadge tier={tier} score={score ?? undefined} size="sm" />
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {score !== null && (
                      <div
                        className="text-lg font-bold"
                        style={{ color: scoreVal >= 0 ? '#2d9d78' : '#e74c3c' }}
                      >
                        {scoreVal}
                      </div>
                    )}
                    <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{t('playerList.rankingScore')}</div>
                  </div>
                </div>

                <div
                  className="mt-3 pt-3 grid grid-cols-2 gap-x-4 gap-y-1"
                  style={{ borderTop: '1px solid var(--color-border)' }}
                >
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--color-text-light)' }}>{t('playerList.totalGames')}</span>
                    <span className="font-medium">{player.total_game_count ?? 0} {t('common.unit.round')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--color-text-light)' }}>{t('playerList.lastGame')}</span>
                    <span className="font-medium">{player.last_game_time ?? '-'}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
