import { useTranslation } from 'react-i18next';
import type { HandRecord } from '@/types';
import { HAND_RECORD_TYPE_LABELS, WIN_TYPE_LABELS, GAME_MODE_LABELS } from '@/types';

export default function YakumanCard({ record, showPlayer = true, showLink = false }: {
  record: HandRecord;
  showPlayer?: boolean;
  showLink?: boolean;
}) {
  const { t } = useTranslation();
  const bgColors: Record<string, string> = {
    yakuman: '#fffbeb',
    yakuman_confirmed: '#fff3e0',
    yakuman_chance: '#f5f5f5',
  };
  const bgColor = bgColors[record.record_type] || '#fffbf0';

  return (
    <div className="p-3 rounded-xl" style={{ border: '1px solid var(--color-border)', background: bgColor }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="badge" style={{ background: '#fff3e0', color: '#e65100', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
          {HAND_RECORD_TYPE_LABELS[record.record_type] || record.record_type}
        </span>
        {showPlayer && (
          <span className="text-sm font-bold">{record.player.nickname}</span>
        )}
        <span className="text-sm" style={{ color: '#e65100' }}>
          {(record.yakuman_names || []).join(' + ')}
        </span>
        {record.record_type === 'yakuman' && record.win_type && (
          <span className="badge" style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
            {WIN_TYPE_LABELS[record.win_type] || record.win_type}
          </span>
        )}
      </div>

      {record.hand_tiles && record.hand_tiles.length > 0 && (
        <div className="flex items-end gap-0.5 mb-2">
          <span className="text-xs" style={{ color: 'var(--color-text-light)', marginRight: '0.375rem', alignSelf: 'center' }}>{t('yakumanCard.handLabel')}</span>
          {record.hand_tiles.map((t, i) => (
            <img key={i} src={`/marjongs/${t}.webp`} alt={t} draggable={false}
              style={{ height: '2rem', width: 'auto', borderRadius: '0.15rem' }} />
          ))}
          {record.winning_tile && (
            <img src={`/marjongs/H${record.winning_tile}.webp`} alt={record.winning_tile} draggable={false}
              style={{ height: '1.5rem', width: 'auto', marginLeft: '0.25rem', borderRadius: '0.15rem' }} />
          )}
        </div>
      )}

      {record.melds && record.melds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-1">
          {record.melds.map((m, i) => (
            <div key={i} className="flex items-center gap-0.5" style={{ padding: '0.125rem', borderRadius: '0.375rem', background: '#f3e8ff' }}>
              <span className="text-xs" style={{ color: '#9c27b0', fontWeight: 600 }}>
                {m.type === 'chi' ? t('yakumanCard.meldChi') : m.type === 'pon' ? t('yakumanCard.meldPon') : t('yakumanCard.meldKan')}
              </span>
              <div className="flex items-end gap-0.5">
                {(() => {
                  const tiles = Array.isArray(m.tiles) ? m.tiles : (m.tiles as unknown[]);
                  const groups: { type: 'stack' | 'single'; tile: string; orientation: string; indices: number[] }[] = [];
                  let gi = 0;
                  while (gi < tiles.length) {
                    const raw = tiles[gi];
                    const entry = raw as { tile?: string; orientation?: string };
                    const tile = typeof raw === 'string' ? raw : entry.tile || '';
                    const orientation = typeof raw === 'string' ? 'h' : entry.orientation || 'h';
                    if (orientation === 'h') {
                      const indices = [gi];
                      while (gi + 1 < tiles.length) {
                        const next = tiles[gi + 1] as { tile?: string; orientation?: string };
                        const nt = typeof tiles[gi + 1] === 'string' ? tiles[gi + 1] as string : next.tile || '';
                        const no = typeof tiles[gi + 1] === 'string' ? 'h' : next.orientation || 'h';
                        if (nt === tile && no === 'h') { indices.push(gi + 1); gi++; } else break;
                      }
                      groups.push({ type: indices.length > 1 ? 'stack' : 'single', tile, orientation, indices });
                    } else {
                      groups.push({ type: 'single', tile, orientation, indices: [gi] });
                    }
                    gi++;
                  }
                  return (
                    <>
                      {groups.map((group, idx) => {
                        if (group.type === 'stack') {
                          return (
                            <span key={idx} style={{
                              position: 'relative',
                              display: 'inline-flex',
                              height: '3rem',
                            }}>
                              {group.indices.map((tIdx, si) => (
                                <img
                                  key={tIdx}
                                  src={`/marjongs/H${group.tile}.webp`}
                                  alt={group.tile}
                                  draggable={false}
                                  style={{
                                    height: '1.5rem',
                                    width: 'auto',
                                    position: si === 0 ? 'relative' : 'absolute',
                                    top: si === 0 ? undefined : '1.5rem',
                                    left: 0,
                                    zIndex: si + 1,
                                  }}
                                />
                              ))}
                            </span>
                          );
                        }
                        const isH = group.orientation === 'h';
                        return (
                          <img
                            key={idx}
                            src={isH ? `/marjongs/H${group.tile}.webp` : `/marjongs/${group.tile}.webp`}
                            alt={group.tile}
                            draggable={false}
                            style={{ height: isH ? '1.25rem' : '1.75rem', width: isH ? 'auto' : undefined, borderRadius: '0.15rem' }}
                          />
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-light)' }}>
        <span>{record.game_info?.start_time || record.created_at}</span>
        {record.game_info?.room_name && (
          <>
            <span>·</span>
            {showLink ? (
              <a href={`/rooms/${record.game_info.room_id}`} style={{ color: 'var(--color-secondary-dark)', textDecoration: 'none' }}>
                {record.game_info.room_name}
              </a>
            ) : (
              <span>{record.game_info.room_name}</span>
            )}
          </>
        )}
        {record.game_info?.game_mode && (
          <>
            <span>·</span>
            <span>{GAME_MODE_LABELS[record.game_info.game_mode]}</span>
          </>
        )}
      </div>
    </div>
  );
}
