import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getRooms, createRoom, closeRoom, deleteRoom } from '@/api/games';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import type { Room } from '@/types';
import { ROOM_TYPE_LABELS } from '@/types';
import { Plus, MapPin, Users, Gamepad2, Clock, Trash2 } from 'lucide-react';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'' | 'offline' | 'online'>('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();
  const admin = isAdmin();

  const loadRooms = useCallback(async () => {
    try {
      const params: { status?: string; room_type?: 'offline' | 'online' } = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter) params.room_type = typeFilter;
      const data = await getRooms(Object.keys(params).length ? params : undefined);
      setRooms(data);
    } catch {
      showToast('加载房间失败');
    }
  }, [statusFilter, typeFilter, showToast]);

  useEffect(() => {
    void Promise.resolve().then(() => loadRooms());
  }, [loadRooms]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const location = (form.elements.namedItem('location') as HTMLInputElement).value;
    const roomType = (form.elements.namedItem('room_type') as HTMLInputElement).value as 'offline' | 'online';
    const sessionTime = (form.elements.namedItem('session_time') as HTMLInputElement).value;
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createRoom({
        name,
        location: location || (roomType === 'online' ? '线上' : ''),
        room_type: roomType,
        session_time: sessionTime || null,
      });
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

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该房间吗？此操作不可恢复。')) return;
    try {
      await deleteRoom(id);
      showToast('房间已删除', 'success');
      loadRooms();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '删除失败';
      showToast(msg);
    }
  };

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium w-full sm:w-auto" style={{ color: 'var(--color-text-light)' }}>状态</span>
            {[
              { value: 'all', label: '全部' },
              { value: 'open', label: '进行中' },
              { value: 'closed', label: '已关闭' },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className="btn btn-sm"
                style={{
                  background: statusFilter === f.value ? 'var(--color-primary-light)' : 'transparent',
                  color: statusFilter === f.value ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                  border: statusFilter === f.value ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {admin && (
            <button className="btn btn-primary sm:ml-auto" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> 开启房间
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium w-full sm:w-auto" style={{ color: 'var(--color-text-light)' }}>类型</span>
          {(
            [
              { value: '' as const, label: '全部' },
              { value: 'offline' as const, label: '线下场' },
              { value: 'online' as const, label: '线上场' },
            ] as const
          ).map((f) => (
            <button
              key={f.value || 'all-type'}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className="btn btn-sm"
              style={{
                background: typeFilter === f.value ? 'var(--color-primary-light)' : 'transparent',
                color: typeFilter === f.value ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                border: typeFilter === f.value ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rooms.length === 0 ? (
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
          {rooms.map((room) => (
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
                      <div className="font-semibold flex items-center gap-2">
                        {room.name}
                        <span className="text-xs font-normal px-1.5 py-0.5 rounded" style={{
                          background: room.room_type === 'online' ? '#e3f2fd' : 'var(--color-primary-light)',
                          color: 'var(--color-text-light)',
                        }}>
                          {ROOM_TYPE_LABELS[room.room_type] ?? room.room_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--color-text-light)' }}>
                        {room.session_time && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} /> 场次 {room.session_time}
                          </span>
                        )}
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
                  {admin && room.game_count === 0 && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleDelete(room.id)}
                      style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                    >
                      <Trash2 size={14} /> 删除
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
            <label className="form-label">房间类型 *</label>
            <select name="room_type" className="form-input" defaultValue="offline" required>
              <option value="offline">线下场</option>
              <option value="online">线上场（先建场，再在「线上对局导入」中往该房间录入牌谱）</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">房间名称 *</label>
            <input name="name" className="form-input" placeholder="如：周五雀庄聚会" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">地点/雀庄</label>
            <input name="location" className="form-input" placeholder="选填，线上场可不填（默认 线上）" />
          </div>
          <div className="form-group">
            <label className="form-label">场次时间</label>
            <input name="session_time" type="datetime-local" className="form-input" />
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>与线下面杀一致，用于标识本场；导入的线上对局默认用该时间作为对局时间（可在线上导入页单独覆盖）</p>
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
