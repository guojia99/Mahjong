import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getRooms, createRoom, closeRoom } from '@/api/games';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import type { Room } from '@/types';
import { Plus, MapPin, Users, Gamepad2, Clock } from 'lucide-react';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();
  const admin = isAdmin();

  const loadRooms = useCallback(async () => {
    try {
      const params = filter !== 'all' ? filter : undefined;
      const data = await getRooms(params);
      setRooms(data);
    } catch {
      showToast('加载房间失败');
    }
  }, [filter, showToast]);

  useEffect(() => {
    void Promise.resolve().then(() => loadRooms());
  }, [loadRooms]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createRoom({ name, location });
      showToast('房间创建成功', 'success');
      setShowCreate(false);
      loadRooms();
    } catch {
      showToast('创建失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (id: string) => {
    if (!confirm('确定关闭该房间吗？关闭后将无法再录入对局。')) return;
    try {
      await closeRoom(id);
      showToast('房间已关闭', 'success');
      loadRooms();
    } catch {
      showToast('操作失败');
    }
  };

  const filteredRooms = filter === 'all' ? rooms : rooms.filter((r) => r.status === filter);

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          {[
            { value: 'all', label: '全部' },
            { value: 'open', label: '进行中' },
            { value: 'closed', label: '已关闭' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="btn btn-sm"
              style={{
                background: filter === f.value ? 'var(--color-primary-light)' : 'transparent',
                color: filter === f.value ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                border: filter === f.value ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {admin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> 开启房间
          </button>
        )}
      </div>

      {filteredRooms.length === 0 ? (
        <div className="empty-state card">
          <Gamepad2 size={48} style={{ color: 'var(--color-text-light)', opacity: 0.3, margin: '0 auto 1rem' }} />
          <p>暂无房间</p>
          {admin && (
            <button className="btn btn-outline btn-sm mt-3" onClick={() => setShowCreate(true)}>
              开启第一个房间
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRooms.map((room) => (
            <div key={room.id} className="card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Link
                  to={`/rooms/${room.id}`}
                  className="flex-1"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: room.status === 'open' ? '#e8f8f0' : '#f5f5f5' }}
                    >
                      <Gamepad2
                        size={18}
                        style={{ color: room.status === 'open' ? '#2d9d78' : '#999' }}
                      />
                    </div>
                    <div>
                      <div className="font-semibold">{room.name}</div>
                      <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--color-text-light)' }}>
                        {room.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {room.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {room.player_count}人
                        </span>
                        <span>{room.game_count}局</span>
                        {room.earliest_game_time && room.latest_game_time && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} /> {room.earliest_game_time} ~ {room.latest_game_time}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <span className={`badge ${room.status === 'open' ? 'badge-open' : 'badge-closed'}`}>
                    {room.status === 'open' ? '进行中' : '已关闭'}
                  </span>
                  {admin && room.status === 'open' && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleClose(room.id)}
                      style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                    >
                      关闭房间
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="开启新房间">
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">房间名称 *</label>
            <input name="name" className="form-input" placeholder="如：周五雀庄聚会" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">地点/雀庄</label>
            <input name="location" className="form-input" placeholder="选填" />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCreate(false)}>取消</button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">创建</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
