import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getRooms, createRoom, closeRoom, deleteRoom } from '@/api/games';
import { isAdmin } from '@/api/auth';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import type { Room } from '@/types';
import { ROOM_TYPE_LABELS } from '@/types';
import { Plus, MapPin, Users, Gamepad2, Clock, Trash2 } from 'lucide-react';

export default function RoomsPage() {
  const { t } = useTranslation();
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
      showToast(t('rooms.loadFailed'));
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
        location: location || (roomType === 'online' ? t('gameType.online') : ''),
        room_type: roomType,
        session_time: sessionTime || null,
      });
      showToast(t('rooms.createSuccess'), 'success');
      setShowCreate(false);
      loadRooms();
    } catch {
      showToast(t('rooms.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (id: string) => {
    if (!confirm(t('rooms.closeConfirm'))) return;
    try {
      await closeRoom(id);
      showToast(t('rooms.closeSuccess'), 'success');
      loadRooms();
    } catch {
      showToast(t('rooms.closeFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('rooms.deleteConfirm'))) return;
    try {
      await deleteRoom(id);
      showToast(t('rooms.deleteSuccess'), 'success');
      loadRooms();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('rooms.deleteFailed');
      showToast(msg);
    }
  };

  return (
    <div>
      {ToastComponent}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium w-full sm:w-auto" style={{ color: 'var(--color-text-light)' }}>{t('rooms.status')}</span>
            {[
              { value: 'all', label: t('rooms.statusAll') },
              { value: 'open', label: t('roomStatus.open') },
              { value: 'closed', label: t('roomStatus.closed') },
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
              <Plus size={16} /> {t('rooms.openRoom')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium w-full sm:w-auto" style={{ color: 'var(--color-text-light)' }}>{t('rooms.type')}</span>
          {(
            [
              { value: '' as const, label: t('rooms.typeAll') },
              { value: 'offline' as const, label: t('roomType.offline') },
              { value: 'online' as const, label: t('roomType.online') },
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
          <p>{t('rooms.noRooms')}</p>
          {admin && (
            <button className="btn btn-outline btn-sm mt-3" onClick={() => setShowCreate(true)}>
              {t('rooms.openFirstRoom')}
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
                            <Clock size={12} /> {t('rooms.sessionLabel')} {room.session_time}
                          </span>
                        )}
                        {room.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {room.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {room.player_count}{t('common.unit.person')}
                        </span>
                        <span>{room.game_count}{t('common.unit.round')}</span>
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
                    {room.status === 'open' ? t('roomStatus.open') : t('roomStatus.closed')}
                  </span>
                  {admin && room.status === 'open' && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleClose(room.id)}
                      style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                    >
                      {t('rooms.closeRoom')}
                    </button>
                  )}
                  {admin && room.game_count === 0 && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleDelete(room.id)}
                      style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                    >
                      <Trash2 size={14} /> {t('common.delete')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('rooms.newRoomTitle')}>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">{t('rooms.roomTypeLabel')}</label>
            <select name="room_type" className="form-input" defaultValue="offline" required>
              <option value="offline">{t('roomType.offline')}</option>
              <option value="online">{t('rooms.onlineOptionHint')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('rooms.roomNameLabel')}</label>
            <input name="name" className="form-input" placeholder={t('rooms.roomNamePlaceholder')} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rooms.locationLabel')}</label>
            <input name="location" className="form-input" placeholder={t('rooms.locationPlaceholder')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rooms.sessionTimeLabel')}</label>
            <input name="session_time" type="datetime-local" className="form-input" />
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>{t('rooms.sessionTimeHint')}</p>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">{t('common.create')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
