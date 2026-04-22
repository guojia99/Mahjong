import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, Users, TrendingUp, Sparkles } from 'lucide-react';
import { getRooms } from '@/api/games';
import { getRecentYakumans } from '@/api/games';
import { getPlayers } from '@/api/players';
import type { Room, HandRecord } from '@/types';
import YakumanCard from '@/components/YakumanCard';

export default function HomePage() {
  const [openRooms, setOpenRooms] = useState<Room[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [totalGames, setTotalGames] = useState(0);
  const [recentYakumans, setRecentYakumans] = useState<HandRecord[]>([]);

  const loadData = async () => {
    try {
      const [rooms, players] = await Promise.all([
        getRooms({ status: 'open' }),
        getPlayers(),
      ]);
      setOpenRooms(rooms);
      setPlayerCount(players.length);
      const allRooms = await getRooms();
      const games = allRooms.reduce((sum, r) => sum + r.game_count, 0);
      setTotalGames(games);
      const recent = await getRecentYakumans(5);
      setRecentYakumans(recent);
    } catch {
      // silently handle
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, []);

  const stats = [
    { label: '雀士数', value: playerCount, icon: Users, color: 'var(--color-primary)' },
    { label: '进行中房间', value: openRooms.length, icon: Gamepad2, color: 'var(--color-secondary)' },
    { label: '总对局数', value: totalGames, icon: TrendingUp, color: 'var(--color-accent)' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>欢迎使用嘉の雀桩</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>日本立麻雀对局记录助手</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `${stat.color}20` }}
              >
                <Icon size={22} style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {openRooms.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">进行中的房间</h3>
            <Link to="/rooms" className="text-sm font-medium" style={{ color: 'var(--color-primary-dark)' }}>
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {openRooms.slice(0, 5).map((room) => (
              <Link
                key={room.id}
                to={`/rooms/${room.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div>
                  <div className="font-medium">{room.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-light)' }}>
                    {room.location || '未设置地点'} · {room.player_count}人
                  </div>
                </div>
                <span className="badge badge-open">进行中</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentYakumans.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Sparkles size={16} style={{ color: '#e65100' }} /> 最近役满
            </h3>
            <Link to="/yakumans" className="text-sm font-medium" style={{ color: '#e65100' }}>
              查看全部
            </Link>
          </div>
          <div className="space-y-3">
            {recentYakumans.map((yr) => (
              <YakumanCard key={yr.id} record={yr} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
