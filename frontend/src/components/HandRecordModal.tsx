import { useState, useEffect } from 'react';
import type { GamePlayerInfo, MeldInfo } from '@/types';
import { YAKUMAN_LIST, TILE_ORDER, HAND_RECORD_TYPE_LABELS } from '@/types';

const RED_TILES = ['0m', '0p', '0s'];
const RED_NORMAL_PAIRS: Record<string, string> = { '5m': '0m', '0m': '5m', '5p': '0p', '0p': '5p', '5s': '0s', '0s': '5s' };

/** 赤5 与 普通5 视为同一枚牌（用于判断刻/杠张数） */
function tileIdentity(tile: string): string {
  const p = RED_NORMAL_PAIRS[tile];
  if (p && tile.startsWith('0')) return p;
  return tile;
}

/** 根据已选牌自动推断吃/碰/杠：默认碰；含暗杠盖牌 B 或四张同牌为杠；三张牌面互不相同为吃 */
function inferMeldType(tiles: { tile: string; orientation: 'h' | 'v' }[]): MeldInfo['type'] {
  if (tiles.some((t) => t.tile === 'B')) return 'kan';
  const nonB = tiles.filter((t) => t.tile !== 'B');
  const counts: Record<string, number> = {};
  for (const t of nonB) {
    const id = tileIdentity(t.tile);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  const maxC = nonB.length ? Math.max(...Object.values(counts)) : 0;
  if (maxC >= 4) return 'kan';
  if (nonB.length === 3) {
    const rawSet = new Set(nonB.map((t) => t.tile));
    if (rawSet.size === 3) return 'chi';
    return 'pon';
  }
  return 'pon';
}

function combinedCount(tiles: string[], tile: string): number {
  const partner = RED_NORMAL_PAIRS[tile];
  return tiles.filter(t => t === tile || (partner && t === partner)).length;
}

function tileImgSrc(tile: string) {
  return `/marjongs/${tile}.webp`;
}

function hTileImgSrc(tile: string) {
  return `/marjongs/H${tile}.webp`;
}

function TileImg({ tile, selected, onClick, count, style }: {
  tile: string;
  selected?: boolean;
  onClick?: () => void;
  count?: number;
  style?: React.CSSProperties;
}) {
  const isRed = tile.startsWith('0');
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        width: '2.25rem',
        height: '3rem',
        borderRadius: '0.25rem',
        border: selected ? '2px solid var(--color-primary)' : '2px solid transparent',
        background: 'transparent',
        padding: 0,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: selected ? '0 0 0 2px var(--color-primary-light)' : 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      <img src={tileImgSrc(tile)} alt={tile} draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '0.2rem' }} />
      {count !== undefined && count > 0 && (
        <span style={{
          position: 'absolute', top: '-6px', right: '-6px',
          minWidth: '1rem', height: '1rem', borderRadius: '50%',
          background: isRed ? '#e74c3c' : 'var(--color-primary)',
          color: 'white',
          fontSize: '0.625rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, padding: '0 2px',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

interface MeldInputProps {
  melds: MeldInfo[];
  onChange: (melds: MeldInfo[]) => void;
  handTiles: string[];
}

function MeldInput({ melds, onChange, handTiles }: MeldInputProps) {
  const [activeMeld, setActiveMeld] = useState(-1);
  const newMeld = () => {
    if (melds.length >= 4) return;
    const nextCost = handTiles.length + 3;
    if (nextCost > 13) return;
    const m = [...melds, { tiles: [], type: 'pon' as const }];
    onChange(m);
    setActiveMeld(m.length - 1);
  };
  const removeMeld = (idx: number) => {
    const m = melds.filter((_, i) => i !== idx);
    onChange(m);
    if (activeMeld === idx) setActiveMeld(-1);
    else if (activeMeld > idx) setActiveMeld(activeMeld - 1);
  };
  const addTileToMeld = (tile: string, orientation: 'h' | 'v') => {
    if (activeMeld < 0 || activeMeld >= melds.length) return;
    const current = melds[activeMeld].tiles;
    const handUsed = combinedCount(handTiles, tile);
    const meldUsed = current.filter(t => t.tile === tile && t.orientation === orientation).length;
    const maxPerOri = orientation === 'v' && tile === 'B' ? 99 : orientation === 'v' ? 3 : 2;
    if (meldUsed + handUsed >= maxPerOri) return;
    const nextTiles = [...current, { tile, orientation }];
    const m = [...melds];
    m[activeMeld] = { ...m[activeMeld], tiles: nextTiles, type: inferMeldType(nextTiles) };
    onChange(m);
  };
  const removeTileFromMeld = (mIdx: number, tIdx: number) => {
    const m = [...melds];
    const nextTiles = m[mIdx].tiles.filter((_, i) => i !== tIdx);
    m[mIdx] = { ...m[mIdx], tiles: nextTiles, type: inferMeldType(nextTiles) };
    onChange(m);
  };

  const activeMeldTiles = activeMeld >= 0 && activeMeld < melds.length ? melds[activeMeld].tiles : [];

  const meldAvailable = (tile: string, orientation: 'h' | 'v') => {
    const handUsed = combinedCount(handTiles, tile);
    const meldUsed = activeMeldTiles.filter(t => t.tile === tile && t.orientation === orientation).length;
    const maxPerOri = orientation === 'v' && tile === 'B' ? 99 : orientation === 'v' ? 3 : 2;
    return Math.max(0, maxPerOri - handUsed - meldUsed);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">吃碰杠（最多4组）</span>
        <button type="button" onClick={newMeld} className="btn btn-sm btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.625rem' }} disabled={melds.length >= 4}>+ 添加</button>
      </div>
      {melds.map((meld, mIdx) => (
        <div key={mIdx} style={{
          padding: '0.5rem', borderRadius: '0.5rem', border: activeMeld === mIdx ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
          background: activeMeld === mIdx ? '#fff5f9' : 'white',
        }}>
          <div className="flex items-center gap-2 mb-1">
            <select
              value={meld.type}
              onChange={(e) => {
                const m = [...melds];
                m[mIdx] = { ...m[mIdx], type: e.target.value as MeldInfo['type'] };
                onChange(m);
              }}
              style={{ padding: '0.125rem 0.375rem', fontSize: '0.625rem', borderRadius: '0.25rem', border: '1px solid var(--color-border)' }}
            >
              <option value="chi">吃</option>
              <option value="pon">碰</option>
              <option value="kan">杠</option>
            </select>
            <button type="button" onClick={() => setActiveMeld(mIdx)} className="text-xs" style={{ color: 'var(--color-primary-dark)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {activeMeld === mIdx ? '编辑中' : '编辑'}
            </button>
            <button type="button" onClick={() => removeMeld(mIdx)} className="text-xs" style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer' }}>删除</button>
          </div>
          {meld.tiles.length > 0 && (() => {
            const groups: { type: 'stack' | 'single'; tile: string; orientation: 'h' | 'v'; indices: number[] }[] = [];
            let i = 0;
            while (i < meld.tiles.length) {
              const cur = meld.tiles[i];
              if (cur.orientation === 'h') {
                const indices = [i];
                while (i + 1 < meld.tiles.length && meld.tiles[i + 1].tile === cur.tile && meld.tiles[i + 1].orientation === 'h') {
                  indices.push(i + 1);
                  i++;
                }
                groups.push({ type: indices.length > 1 ? 'stack' : 'single', tile: cur.tile, orientation: 'h', indices });
              } else {
                groups.push({ type: 'single', tile: cur.tile, orientation: 'v', indices: [i] });
              }
              i++;
            }
            return (
              <div className="flex items-end gap-0.5">
                {groups.map((group, gi) => {
                  if (group.type === 'stack') {
                    return (
                      <span
                        key={`g${gi}`}
                        onClick={() => removeTileFromMeld(mIdx, group.indices[group.indices.length - 1])}
                        style={{
                          position: 'relative',
                          display: 'inline-flex',
                          cursor: 'pointer',
                          height: '3.5rem',
                        }}
                      >
                        {group.indices.map((tIdx, si) => (
                            <img
                              key={tIdx}
                              src={hTileImgSrc(group.tile)}
                              alt={group.tile}
                              draggable={false}
                              style={{
                                height: '1.75rem',
                                width: 'auto',
                                position: si === 0 ? 'relative' : 'absolute',
                                top: si === 0 ? undefined : '1.75rem',
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
                    <span
                      key={`g${gi}`}
                      onClick={() => removeTileFromMeld(mIdx, group.indices[0])}
                      style={{ cursor: 'pointer', display: 'inline-flex' }}
                    >
                      <img
                        src={isH ? hTileImgSrc(group.tile) : tileImgSrc(group.tile)}
                        alt={group.tile}
                        draggable={false}
                        style={{
                          height: isH ? '1.875rem' : '2.25rem',
                          width: isH ? 'auto' : undefined,
                          borderRadius: '0.15rem',
                        }}
                      />
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ))}
      {activeMeld >= 0 && (
        <div className="p-2 rounded-xl" style={{ border: '1px solid var(--color-primary)', background: '#fff5f9' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-primary-dark)' }}>
            横摆牌
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {TILE_ORDER.map((tile) => {
              const avail = meldAvailable(tile, 'h');
              const isDisabled = avail <= 0;
              const count = activeMeldTiles.filter(t => t.tile === tile && t.orientation === 'h').length;
              return (
                <button
                  key={tile}
                  type="button"
                  onClick={() => { if (!isDisabled) addTileToMeld(tile, 'h'); }}
                  disabled={isDisabled}
                  style={{
                    position: 'relative',
                    width: '2.25rem',
                    height: '1.875rem',
                    borderRadius: '0.25rem',
                    border: count > 0 ? '2px solid var(--color-primary)' : '2px solid transparent',
                    background: isDisabled ? 'rgba(0,0,0,0.05)' : 'transparent',
                    padding: 0,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isDisabled ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  <img src={hTileImgSrc(tile)} alt={tile} draggable={false}
                    style={{ height: '100%', width: 'auto', borderRadius: '0.2rem' }} />
                  {count > 0 && (
                    <span style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      minWidth: '1rem', height: '1rem', borderRadius: '50%',
                      background: avail <= 0 ? '#e74c3c' : 'var(--color-primary)',
                      color: 'white',
                      fontSize: '0.625rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1, padding: '0 2px',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-primary-dark)' }}>
            竖牌
          </div>
          <div className="flex flex-wrap gap-1">
            {[...TILE_ORDER, 'B' as const].map((tile) => {
              const isBack = tile === 'B';
              const avail = meldAvailable(tile, 'v');
              const isDisabled = avail <= 0;
              const count = activeMeldTiles.filter(t => t.tile === tile && t.orientation === 'v').length;
              return (
                <button
                  key={tile}
                  type="button"
                  onClick={() => { if (!isDisabled) addTileToMeld(tile, 'v'); }}
                  disabled={isDisabled}
                  style={{
                    position: 'relative',
                    width: '2.25rem',
                    height: '3rem',
                    borderRadius: '0.25rem',
                    border: count > 0 ? '2px solid var(--color-primary)' : '2px solid transparent',
                    background: isDisabled ? 'rgba(0,0,0,0.05)' : 'transparent',
                    padding: 0,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isDisabled ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  <img src={tileImgSrc(tile)} alt={isBack ? '暗杠盖牌' : tile} draggable={false}
                    style={{ height: '100%', width: 'auto', borderRadius: '0.2rem' }} />
                  {count > 0 && (
                    <span style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      minWidth: '1rem', height: '1rem', borderRadius: '50%',
                      background: avail <= 0 ? '#e74c3c' : 'var(--color-primary)',
                      color: 'white',
                      fontSize: '0.625rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1, padding: '0 2px',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  players: GamePlayerInfo[];
  onSubmit: (data: {
    player: string;
    record_type: string;
    yakuman_names: string[];
    hand_tiles: string[];
    melds: MeldInfo[];
    winning_tile: string;
    win_type: string;
  }) => void;
  onClose: () => void;
}

export default function HandRecordModal({ players, onSubmit, onClose }: Props) {
  const [playerId, setPlayerId] = useState('');
  const [recordType, setRecordType] = useState<string>('yakuman');
  const [selectedYakumans, setSelectedYakumans] = useState<string[]>([]);
  const [handTiles, setHandTiles] = useState<string[]>([]);
  const [melds, setMelds] = useState<MeldInfo[]>([]);
  const [winningTile, setWinningTile] = useState('');
  const [winType, setWinType] = useState<string>('tsumo');
  const [selectingFor, setSelectingFor] = useState<'hand' | 'winning' | 'meld' | null>(null);

  const meldCost = (_type: 'chi' | 'pon' | 'kan') => 3;
  const totalMeldCost = melds.reduce((sum, m) => sum + meldCost(m.type), 0);
  const maxHandTiles = Math.max(1, 13 - totalMeldCost);

  const toggleTile = (tile: string) => {
    if (selectingFor === 'hand') {
      if (RED_TILES.includes(tile)) {
        if (handTiles.includes(tile)) {
          setHandTiles((prev) => prev.filter(t => t !== tile));
        } else {
          if (combinedCount(handTiles, tile) >= 4) return;
          setHandTiles((prev) => [...prev, tile]);
        }
      } else {
        if (combinedCount(handTiles, tile) >= 4) return;
        setHandTiles((prev) => [...prev, tile]);
      }
    } else if (selectingFor === 'winning') {
      setWinningTile(tile);
      setSelectingFor(null);
    }
  };

  const removeHandTile = (index: number) => {
    setHandTiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!playerId || selectedYakumans.length === 0) return;
    onSubmit({
      player: playerId,
      record_type: recordType,
      yakuman_names: selectedYakumans,
      hand_tiles: handTiles,
      melds,
      winning_tile: winningTile,
      win_type: winType,
    });
  };

  const canSubmit = playerId && selectedYakumans.length > 0;

  const toggleYakuman = (y: string) => {
    setSelectedYakumans((prev) =>
      prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]
    );
  };

  const sortedHand = handTiles;

  useEffect(() => {
    if (selectingFor === 'winning') {
      setMeldExpand(false);
    }
  }, [selectingFor]);

  const [meldExpand, setMeldExpand] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '42rem' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">添加役满牌谱</h3>

        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label">雀士</label>
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="form-input">
              <option value="">选择雀士</option>
              {players.map((gp) => (
                <option key={gp.player.id} value={gp.player.id}>{gp.player.nickname}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">类型</label>
            <select
              value={recordType}
              onChange={(e) => {
                const v = e.target.value;
                setRecordType(v);
                if (v !== 'yakuman' && selectingFor === 'winning') setSelectingFor(null);
              }}
              className="form-input"
            >
              {Object.entries(HAND_RECORD_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">役种（可多选，至少一个）</label>
            <div className="flex flex-wrap gap-1.5">
              {YAKUMAN_LIST.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => toggleYakuman(y)}
                  className="btn btn-sm"
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    background: selectedYakumans.includes(y) ? '#fff3e0' : 'transparent',
                    color: selectedYakumans.includes(y) ? '#e65100' : 'var(--color-text-light)',
                    border: selectedYakumans.includes(y) ? '1.5px solid #e65100' : '1px solid var(--color-border)',
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">胡牌方式</label>
            <div className="flex gap-2">
              {(['tsumo', 'ron'] as const).map((wt) => (
                <button
                  key={wt}
                  type="button"
                  onClick={() => setWinType(wt)}
                  className="btn btn-sm"
                  style={{
                    padding: '0.375rem 1rem',
                    fontSize: '0.75rem',
                    background: winType === wt ? 'var(--color-primary-light)' : 'transparent',
                    color: winType === wt ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                    border: winType === wt ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  }}
                >
                  {wt === 'tsumo' ? '自摸' : '荣胡'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="form-label" style={{ marginBottom: 0, minWidth: '2.5rem' }}>手牌</label>
              <button type="button" onClick={() => setSelectingFor(selectingFor === 'hand' ? null : 'hand')}
                className="btn btn-sm" style={{
                  padding: '0.125rem 0.5rem', fontSize: '0.625rem',
                  background: selectingFor === 'hand' ? 'var(--color-primary-light)' : 'transparent',
                  color: selectingFor === 'hand' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                  border: selectingFor === 'hand' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                }}>
                {selectingFor === 'hand' ? '选择中...' : '选牌'}
              </button>
              {handTiles.length > 0 && (
                <button type="button" onClick={() => setHandTiles([])}
                  className="text-xs" style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>清空</button>
              )}
            </div>
          </div>

          {recordType === 'yakuman' && (
            <div className="form-group">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="form-label" style={{ marginBottom: 0, minWidth: '2.5rem' }}>和牌</label>
                <button
                  type="button"
                  onClick={() => setSelectingFor(selectingFor === 'winning' ? null : 'winning')}
                  className="btn btn-sm"
                  style={{
                    padding: '0.125rem 0.5rem', fontSize: '0.625rem',
                    background: selectingFor === 'winning' ? 'var(--color-primary-light)' : 'transparent',
                    color: selectingFor === 'winning' ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                    border: selectingFor === 'winning' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  }}
                >
                  {selectingFor === 'winning' ? '选择中...' : '选和牌'}
                </button>
                {winningTile && (
                  <button
                    type="button"
                    onClick={() => { setWinningTile(''); setSelectingFor(null); }}
                    className="text-xs"
                    style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          )}

          {selectingFor && (
            <div className="p-3 rounded-xl" style={{ border: '1px solid var(--color-primary)', background: '#fff5f9' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--color-primary-dark)' }}>
                {selectingFor === 'hand' ? '点击选择手牌' : selectingFor === 'winning' ? '点击选择和牌（胡牌张）' : ''}
              </div>
              <div className="flex flex-wrap gap-1">
                {TILE_ORDER.map((tile) => {
                  const count = handTiles.filter(t => t === tile).length;
                  const combined = combinedCount(handTiles, tile);
                  const isRed = RED_TILES.includes(tile);
                  const isFull = selectingFor === 'hand' && handTiles.length >= maxHandTiles;
                  const noMore = combined >= 4 || (isRed && count >= 1);
                  const isDisabled = isFull || noMore;
                  const isSelected = selectingFor === 'hand' ? count > 0 : winningTile === tile;
                  return (
                    <TileImg
                      key={tile}
                      tile={tile}
                      selected={isSelected}
                      onClick={isDisabled ? undefined : () => toggleTile(tile)}
                      count={selectingFor === 'hand' ? count : undefined}
                      style={isDisabled ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-2 rounded-xl" style={{ border: '1px solid var(--color-border)', background: '#fafafa' }}>
            <div className="flex items-end gap-0.5 flex-wrap">
              {sortedHand.length === 0 ? (
                <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>最多{maxHandTiles}张，红5与正常5共享数量</span>
              ) : (
                sortedHand.map((tile, index) => {
                  return (
                    <TileImg key={index} tile={tile} onClick={() => removeHandTile(index)} />
                  );
                })
              )}
              {winningTile && (
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-end', marginLeft: '0.375rem' }}>
                  <img src={hTileImgSrc(winningTile)} alt={winningTile} draggable={false}
                    style={{ height: '1.875rem', width: 'auto', borderRadius: '0.15rem' }} />
                </span>
              )}
              {melds.map((meld, mIdx) => (
                <span key={mIdx} style={{ marginLeft: '0.25rem', display: 'inline-flex' }}>
                  {(() => {
                    const groups: { type: 'stack' | 'single'; tile: string; orientation: 'h' | 'v'; indices: number[] }[] = [];
                    let gi = 0;
                    while (gi < meld.tiles.length) {
                      const cur = meld.tiles[gi];
                      if (cur.orientation === 'h') {
                        const indices = [gi];
                        while (gi + 1 < meld.tiles.length && meld.tiles[gi + 1].tile === cur.tile && meld.tiles[gi + 1].orientation === 'h') {
                          indices.push(gi + 1); gi++;
                        }
                        groups.push({ type: indices.length > 1 ? 'stack' : 'single', tile: cur.tile, orientation: 'h', indices });
                      } else {
                        groups.push({ type: 'single', tile: cur.tile, orientation: 'v', indices: [gi] });
                      }
                      gi++;
                    }
                    return (
                      <>
                        {groups.map((group, idx) => {
                          if (group.type === 'stack') {
                            return (
                              <span key={idx} style={{ position: 'relative', display: 'inline-flex', height: '3.5rem', cursor: 'pointer' }}
                                onClick={() => { if (group.indices.length === 1) { const m = [...melds]; m[mIdx] = { ...m[mIdx], tiles: [] }; setMelds(m); } }}>
                                {group.indices.map((tIdx, si) => (
                                  <img key={tIdx} src={hTileImgSrc(group.tile)} alt={group.tile} draggable={false}
                                    style={{ height: '1.75rem', width: 'auto', position: si === 0 ? 'relative' : 'absolute', top: si === 0 ? undefined : '1.75rem', left: 0, zIndex: si + 1 }} />
                                ))}
                              </span>
                            );
                          }
                          const isH = group.orientation === 'h';
                          return (
                            <span key={idx} style={{ display: 'inline-flex', cursor: 'pointer' }}
                              onClick={() => { const m = [...melds]; m[mIdx] = { ...m[mIdx], tiles: m[mIdx].tiles.filter((_, i) => i !== group.indices[0]) }; setMelds(m); }}>
                              <img src={isH ? hTileImgSrc(group.tile) : tileImgSrc(group.tile)} alt={group.tile} draggable={false}
                                style={{ height: isH ? '1.875rem' : '2.25rem', width: 'auto', borderRadius: '0.15rem' }} />
                            </span>
                          );
                        })}
                      </>
                    );
                  })()}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMeldExpand(!meldExpand)}
              className="btn btn-sm btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
              {meldExpand ? '收起' : '添加'}吃碰杠
            </button>
            {melds.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>（点击牌可移除）</span>
            )}
          </div>
          {meldExpand && <MeldInput melds={melds} onChange={setMelds} handTiles={handTiles} />}

          <div className="flex gap-2 mt-4">
            <button className="btn btn-primary flex-1" onClick={handleSubmit} disabled={!canSubmit}>
              添加
            </button>
            <button className="btn btn-outline" onClick={onClose}>取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}
