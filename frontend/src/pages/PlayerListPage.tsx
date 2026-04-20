import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlayers } from '@/api/players';
import SearchBar from '@/components/SearchBar';
import type { Player } from '@/types';
import { Users } from 'lucide-react';

export default function PlayerListPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getPlayers(query).then(setPlayers);
  }, [query]);

  return (
    <div>
      <div className="mb-6">
        <SearchBar query={query} onQueryChange={setQuery} placeholder="搜索雀士..." />
      </div>

      {players.length === 0 ? (
        <div className="empty-state card">
          <Users size={48} style={{ margin: '0 auto 1rem' }} />
          <p>暂无雀士</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map((player) => (
            <Link
              key={player.id}
              to={`/player-list/${player.id}`}
              className="card flex items-center gap-3 transition-all hover:shadow-md"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              {player.avatar ? (
                <img src={player.avatar} alt={player.nickname} className="avatar" />
              ) : (
                <div className="avatar-placeholder">{player.nickname.charAt(0)}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{player.nickname}</div>
                {player.real_name && (
                  <div className="text-xs truncate" style={{ color: 'var(--color-text-light)' }}>{player.real_name}</div>
                )}
                {player.majsoul_uids && player.majsoul_uids.length > 0 && (
                  <div className="text-xs" style={{ color: 'var(--color-secondary-dark)' }}>
                    UID: {player.majsoul_uids.join(', ')}
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--color-text-light)' }}>&rsaquo;</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
