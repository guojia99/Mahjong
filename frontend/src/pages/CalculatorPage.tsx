import {useState, useMemo, useCallback} from 'react';
import type {Dispatch, SetStateAction, MouseEventHandler} from 'react';
import {Calculator} from '@/mahjong-calc/calc';
import { Result, MAN_TYPE_NAMES} from '@/mahjong-calc/definition';
import {
    Pai,
    Block,
    BlockType,
    PositionType,
    TSUMO,
    RON,
    RIICHI,
    DOUBLE_RIICHI,
    IPPATSU,
    HAITEI_RAOYUE,
    HOUTEI_RAOYUI,
    RINNSHANN_KAIHOU,
    CHANKAN,
    TENHOU,
    CHIIHOU,
    State
} from '@/mahjong-calc/types';

const TILE_ROWS = [
    ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'],
    ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'],
    ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'],
    ['1z', '2z', '3z', '4z', '5z', '6z', '7z'],
];

const RED_TILES = ['0m', '0p', '0s'];

const YAKU_OPTIONS = [
    {value: 'riichi', label: '立直'}, {value: 'double-riichi', label: '双立直'},
    {value: 'ippatsu', label: '一发'}, {value: 'haite', label: '海底捞月'},
    {value: 'houte', label: '河底摸鱼'}, {value: 'rinnshann', label: '岭上开花'},
    {value: 'chankan', label: '抢杠'}, {value: 'tenhou', label: '天和'}, {value: 'chiihou', label: '地和'},
];

const FURU_TYPES = [
    {value: 'chi', label: '吃'}, {value: 'pon', label: '碰'},
    {value: 'kan', label: '杠'}, {value: 'ankan', label: '暗杠'},
];

const WIND_OPTIONS = [{value: 'east', label: '东'}, {value: 'south', label: '南'}, {
    value: 'west',
    label: '西'
}, {value: 'north', label: '北'}];

function cvtWind(x: string): PositionType {
    if (x === 'east') return PositionType.EAST;
    if (x === 'south') return PositionType.SOUTH;
    if (x === 'west') return PositionType.WEST;
    return PositionType.NORTH;
}

function cvtPai(s: string): Pai {
    if (s.startsWith('0')) return new Pai(s.slice(1) as Pai['type'], 5);
    return new Pai(s.slice(1) as Pai['type'], parseInt(s[0]));
}

function cvtFuro(s: { type: string; name: string; red?: boolean }): Block {
    let open = true, bt = BlockType.TRI;
    if (s.type === 'ankan') open = false;
    if (s.type === 'chi') bt = BlockType.SEQ;
    else if (s.type === 'kan' || s.type === 'ankan') bt = BlockType.QUAD;
    const b = new Block(bt, s.name.slice(1) as Pai['type'], parseInt(s.name[0]), open);
    if (s.red) b.redCnt = 1;
    return b;
}

function cvtYaku(x: string): number {
    const m: Record<string, number> = {
        riichi: RIICHI, 'double-riichi': DOUBLE_RIICHI, ippatsu: IPPATSU,
        haite: HAITEI_RAOYUE, houte: HOUTEI_RAOYUI, rinnshann: RINNSHANN_KAIHOU,
        chankan: CHANKAN, tenhou: TENHOU, chiihou: CHIIHOU,
    };
    return m[x] || 0;
}

function TileImg({name, onClick, disabled, highlight, small}: {
    name: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    highlight?: boolean;
    small?: boolean
}) {
    const src = `/marjongs/${name}.webp`;
    const isH = name.startsWith('H');
    return (
        <button type="button" onClick={disabled ? undefined : onClick} style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
            opacity: disabled ? 0.3 : 1,
            filter: highlight ? 'drop-shadow(0 0 4px #e65100)' : 'none',
            flexShrink: 0,
            lineHeight: 0,
        }}>
            <img src={src} alt={name} draggable={false}
                 style={{
                     height: isH ? (small ? '2rem' : '2.5rem') : (small ? '2.5rem' : '3.5rem'),
                     width: isH ? 'auto' : undefined,
                     borderRadius: '0.25rem'
                 }}/>
        </button>
    );
}

function FuruBlock({item, onRemove}: { item: { type: string; name: string; red?: boolean }; onRemove: MouseEventHandler<HTMLDivElement> }) {
    const tiles = useMemo(() => {
        const rt: string[] = [];
        if (item.type === 'pon') {
            rt.push('H' + item.name);
            rt.push(item.name);
            rt.push(item.name);
        } else if (item.type === 'kan') {
            rt.push('H' + item.name);
            rt.push(item.name);
            rt.push(item.name);
            rt.push(item.name);
        } else if (item.type === 'ankan') {
            rt.push('B');
            rt.push(item.name);
            rt.push(item.name);
            rt.push('B');
        } else if (item.type === 'chi') {
            const n = parseInt(item.name[0]);
            const tp = item.name[1];
            const tiles: string[] = [item.name, (n + 1) + tp, (n + 2) + tp];
            if (item.red) {
                const redIdx = tiles.indexOf('5' + tp);
                tiles[redIdx] = '0' + tp;
                if (redIdx === 0) {
                    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
                }
            }
            rt.push('H' + tiles[0]);
            rt.push(tiles[1]);
            rt.push(tiles[2]);
        }
        return rt;
    }, [item]);
    return (
        <div onClick={onRemove} style={{
            display: 'inline-flex',
            alignItems: 'flex-end',
            gap: '1px',
            background: 'rgba(255,243,224,0.3)',
            padding: '2px 4px',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'opacity 0.15s'
        }}
             onMouseEnter={e => (e.currentTarget.style.opacity = '0.6')}
             onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            {tiles.map((t, i) => <TileImg key={i} name={t} small/>)}
        </div>
    );
}

const selectStyle: React.CSSProperties = {
    padding: '0.375rem 0.75rem',
    fontSize: '0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--color-border)',
    background: 'white',
    color: 'var(--color-text)',
    outline: 'none',
    cursor: 'pointer'
};
const inputStyle: React.CSSProperties = {
    width: '4rem',
    padding: '0.375rem 0.5rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--color-border)',
    fontSize: '0.8rem',
    outline: 'none'
};

type PopupTarget = 'hand' | 'furu' | 'dora' | 'ura' | null;
type FuruItem = { type: string; name: string; red?: boolean };

type CalculatorZoneBoxProps = {
    label: string;
    target: PopupTarget;
    items: string[];
    isFuru?: boolean;
    hint?: string;
    popup: PopupTarget;
    setPopup: Dispatch<SetStateAction<PopupTarget>>;
    furo: FuruItem[];
    removeFuru: (idx: number) => void;
    removeTile: (arr: string[], idx: number, setter: (v: string[]) => void) => void;
    setHand: Dispatch<SetStateAction<string[]>>;
    setDora: Dispatch<SetStateAction<string[]>>;
    setUra: Dispatch<SetStateAction<string[]>>;
};

function CalculatorZoneBox({
    label,
    target,
    items,
    isFuru,
    hint,
    popup,
    setPopup,
    furo,
    removeFuru,
    removeTile,
    setHand,
    setDora,
    setUra,
}: CalculatorZoneBoxProps) {
    const isEmpty = isFuru ? furo.length === 0 : items.length === 0;

    return (
        <div>
            <div style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-light)',
                marginBottom: '0.25rem'
            }}>{label}</div>
            <div
                onClick={() => setPopup(popup === target ? null : target)}
                style={{
                    display: 'flex', flexWrap: 'wrap', gap: '2px', alignItems: isEmpty ? 'center' : 'flex-end',
                    justifyContent: isEmpty ? 'center' : 'flex-start',
                    minHeight: '3.5rem', padding: '0.5rem', borderRadius: '0.75rem',
                    border: popup === target ? '2px solid var(--color-primary)' : '1px dashed var(--color-border)',
                    background: popup === target ? 'rgba(255,243,224,0.3)' : isEmpty ? 'rgba(0,0,0,0.02)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                }}
            >
                {isEmpty ? (
                    <span style={{fontSize: '0.8rem', color: '#bbb', userSelect: 'none'}}>+ 点击添加{hint}</span>
                ) : isFuru ? (
                    furo.map((f, i) => (
                        <FuruBlock
                            key={i}
                            item={f}
                            onRemove={(e) => {
                                e.stopPropagation();
                                removeFuru(i);
                            }}
                        />
                    ))
                ) : (
                    items.map((p, i) => (
                        <TileImg
                            key={i}
                            name={p}
                            onClick={(e) => {
                                e.stopPropagation();
                                removeTile(items, i, target === 'dora' ? setDora : target === 'ura' ? setUra : setHand);
                            }}
                            highlight={i === items.length - 1 && target === 'hand'}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

type CalculatorTilePopupProps = {
    popup: NonNullable<PopupTarget>;
    setPopup: Dispatch<SetStateAction<PopupTarget>>;
    furuMode: string;
    setFuroMode: Dispatch<SetStateAction<string>>;
    chiRedPick: string | null;
    setChiRedPick: Dispatch<SetStateAction<string | null>>;
    tileDisable: Record<string, boolean>;
    paiLeft: Record<string, number>;
    hasRed: Record<string, number>;
    previewTiles: string[];
    addTile: (target: PopupTarget, name: string) => void;
    addChiRed: (redTile: string, startNum: number) => void;
};

function CalculatorTilePopup({
    popup,
    setPopup,
    furuMode,
    setFuroMode,
    chiRedPick,
    setChiRedPick,
    tileDisable,
    paiLeft,
    hasRed,
    previewTiles,
    addTile,
    addChiRed,
}: CalculatorTilePopupProps) {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}
             onClick={() => {
                 setPopup(null);
                 setChiRedPick(null);
             }}>
            <div style={{
                background: 'white',
                borderRadius: '1.25rem',
                padding: '1rem 1.25rem',
                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                maxWidth: '95vw',
                minWidth: '20rem'
            }}
                 onClick={e => e.stopPropagation()}>

                {chiRedPick && (
                    <div style={{marginBottom: '0.75rem'}}>
                        <div style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--color-text)',
                            marginBottom: '0.5rem'
                        }}>选择吃的顺子：
                        </div>
                        <div style={{display: 'flex', gap: '0.5rem'}}>
                            {[3, 4, 5].map(n => {
                                const tp = chiRedPick[1];
                                const tileNums = [n, n + 1, n + 2];
                                const avail = tileNums.every((t) =>
                                    t === 5 ? (paiLeft['5' + tp] || 0) > 0 || (hasRed[tp] || 0) < 1 : (paiLeft[t + tp] || 0) > 0
                                ) && (tileNums.includes(5) ? (hasRed[tp] || 0) < 1 : true);
                                const displayTiles: number[] = [...tileNums];
                                if (n === 5) {
                                    [displayTiles[0], displayTiles[1]] = [displayTiles[1], displayTiles[0]];
                                }
                                return (
                                    <button key={n} disabled={!avail} onClick={() => addChiRed(chiRedPick, n)}
                                            style={{
                                                padding: '0.3rem 0.5rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid var(--color-border)',
                                                background: avail ? 'var(--color-primary-light)' : '#f5f5f5',
                                                cursor: avail ? 'pointer' : 'not-allowed',
                                                opacity: avail ? 1 : 0.4,
                                                display: 'flex',
                                                gap: '1px',
                                                alignItems: 'center',
                                                transition: 'all 0.15s',
                                            }}>
                                        {displayTiles.map(t => (
                                            <TileImg key={t} name={t === 5 ? '0' + tp : t + tp} small/>
                                        ))}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {popup === 'furu' && !chiRedPick && (
                    <div style={{display: 'flex', gap: '0.5rem', marginBottom: '0.75rem'}}>
                        {FURU_TYPES.map(o => (
                            <button key={o.value} onClick={e => {
                                e.stopPropagation();
                                setFuroMode(o.value);
                            }}
                                    style={{
                                        padding: '0.3rem 0.75rem',
                                        borderRadius: '0.5rem',
                                        border: furuMode === o.value ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                                        background: furuMode === o.value ? 'var(--color-primary-light)' : 'transparent',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        color: furuMode === o.value ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                                        transition: 'all 0.15s',
                                    }}>{o.label}</button>
                        ))}
                    </div>
                )}

                {previewTiles.length > 0 && !chiRedPick && (
                    <div style={{
                        marginBottom: '0.5rem',
                        paddingBottom: '0.5rem',
                        borderBottom: '1px dashed var(--color-border)'
                    }}>
                        <div style={{
                            fontSize: '0.7rem',
                            color: 'var(--color-text-light)',
                            marginBottom: '0.25rem'
                        }}>当前选择 ({previewTiles.length})
                        </div>
                        <div style={{display: 'flex', gap: '2px', flexWrap: 'wrap'}}>
                            {previewTiles.map((p, i) => <TileImg key={i} name={p} small/>)}
                        </div>
                    </div>
                )}

                {!chiRedPick && (
                    <div>
                        {TILE_ROWS.map((row, ri) => (
                            <div key={ri} style={{
                                display: 'flex',
                                gap: '2px',
                                marginBottom: '2px',
                                justifyContent: 'center'
                            }}>
                                {row.map(p => <TileImg key={p} name={p} onClick={() => addTile(popup, p)}
                                                       disabled={tileDisable[p]}/>)}
                            </div>
                        ))}
                        {popup === 'hand' && (
                            <div style={{
                                display: 'flex',
                                gap: '2px',
                                marginBottom: '2px',
                                justifyContent: 'center'
                            }}>
                                {RED_TILES.map(p => <TileImg key={p} name={p} onClick={() => addTile(popup, p)}
                                                             disabled={tileDisable[p]}/>)}
                            </div>
                        )}
                        {popup === 'furu' && furuMode === 'chi' && (
                            <div style={{
                                display: 'flex',
                                gap: '2px',
                                marginBottom: '2px',
                                justifyContent: 'center'
                            }}>
                                {RED_TILES.map(p => <TileImg key={p} name={p} onClick={() => setChiRedPick(p)}
                                                             disabled={tileDisable[p]}/>)}
                            </div>
                        )}
                    </div>
                )}

                <div style={{textAlign: 'center', marginTop: '0.5rem'}}>
                    <button onClick={() => {
                        setPopup(null);
                        setChiRedPick(null);
                    }}
                            style={{
                                padding: '0.25rem 1rem',
                                borderRadius: '0.5rem',
                                border: '1px solid var(--color-border)',
                                background: 'transparent',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                color: 'var(--color-text-light)'
                            }}>
                        {chiRedPick ? '返回' : '关闭'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function normalKey(s: string) {
    return s.startsWith('0') ? '5' + s[1] : s;
}

export default function CalculatorPage() {
    const [hand, setHand] = useState<string[]>([]);
    const [furo, setFuro] = useState<FuruItem[]>([]);
    const [dora, setDora] = useState<string[]>([]);
    const [ura, setUra] = useState<string[]>([]);
    const [yakus, setYakus] = useState<string[]>([]);
    const [agariWay, setAgariWay] = useState('tsumo');
    const [field, setField] = useState('east');
    const [seat, setSeat] = useState('east');
    const [ponba, setPonba] = useState(0);
    const [popup, setPopup] = useState<PopupTarget>(null);
    const [furuMode, setFuroMode] = useState('chi');
    const [chiRedPick, setChiRedPick] = useState<string | null>(null);

    const paiLeft = useMemo(() => {
        const allTiles = TILE_ROWS.flat();
        const pl: Record<string, number> = {};
        for (const p of allTiles) pl[p] = 4;
        for (const p of hand) {
            const k = normalKey(p);
            pl[k] = (pl[k] || 0) - 1;
        }
        for (const p of dora) pl[p] = (pl[p] || 0) - 1;
        for (const p of ura) pl[p] = (pl[p] || 0) - 1;
        for (const f of furo) {
            const n = parseInt(f.name[0]), tp = f.name[1];
            if (f.type === 'pon') pl[f.name] = (pl[f.name] || 0) - 3;
            else if (f.type === 'chi') {
                const tileNums = [n, n + 1, n + 2];
                for (const tn of tileNums) {
                    if (f.red && tn === 5) continue;
                    pl[tn + tp] = (pl[tn + tp] || 0) - 1;
                }
            } else pl[f.name] = (pl[f.name] || 0) - 4;
        }
        return pl;
    }, [hand, dora, ura, furo]);

    const hasRed = useMemo(() => {
        const cnt: Record<string, number> = {};
        for (const p of hand) {
            if (p.startsWith('0')) {
                cnt[p[1]] = (cnt[p[1]] || 0) + 1;
            }
        }
        for (const f of furo) {
            if (f.red) cnt[f.name[1]] = (cnt[f.name[1]] || 0) + 1;
        }
        return cnt;
    }, [hand, furo]);

    const getAvail = useCallback((key: string) => {
        let avail = paiLeft[key] || 0;
        if (key[1] && 'mps'.includes(key[1]) && parseInt(key[0]) === 5) avail += (hasRed[key[1]] || 0);
        return avail;
    }, [paiLeft, hasRed]);

    const tileDisable = useMemo(() => {
        const allTiles = [...TILE_ROWS.flat(), ...RED_TILES];
        const rt: Record<string, boolean> = {};
        for (const p of allTiles) rt[p] = true;

        if (!popup) return rt;

        if (popup === 'hand') {
            const maxHand = 14 - furo.length * 3;
            if (hand.length >= maxHand) return rt;
            for (const p of TILE_ROWS.flat()) {
                if ((paiLeft[p] || 0) > 0) rt[p] = false;
            }
            for (const p of RED_TILES) {
                const k = '5' + p[1];
                if (getAvail(k) > 0 && (hasRed[p[1]] || 0) < 1) rt[p] = false;
            }
        } else if (popup === 'dora') {
            if (dora.length >= 5) return rt;
            for (const p of TILE_ROWS.flat()) {
                if ((paiLeft[p] || 0) > 0) rt[p] = false;
            }
        } else if (popup === 'ura') {
            if (ura.length >= 5) return rt;
            for (const p of TILE_ROWS.flat()) {
                if ((paiLeft[p] || 0) > 0) rt[p] = false;
            }
        } else if (popup === 'furu') {
            const maxF = Math.floor((14 - hand.length) / 3);
            if (furo.length >= maxF) return rt;
            if (furuMode === 'chi') {
                for (const row of TILE_ROWS) for (const p of row) {
                    if (parseInt(p[0]) > 7 || p[1] === 'z') continue;
                    const n = parseInt(p[0]), tp = p[1];
                    if (getAvail(p) > 0 && getAvail((n + 1) + tp) > 0 && getAvail((n + 2) + tp) > 0) rt[p] = false;
                }
                for (const p of RED_TILES) {
                    const tp = p[1];
                    if (getAvail('3' + tp) > 0 && getAvail('4' + tp) > 0 && (hasRed[tp] || 0) < 1) rt[p] = false;
                }
            } else if (furuMode === 'pon') {
                for (const p of TILE_ROWS.flat()) {
                    if (getAvail(p) >= 3) rt[p] = false;
                }
            } else {
                for (const p of TILE_ROWS.flat()) {
                    if (getAvail(p) >= 4) rt[p] = false;
                }
            }
        }
        return rt;
    }, [hand, dora, ura, furo, popup, furuMode, paiLeft, hasRed, getAvail]);

    const yakuDisable = useMemo(() => {
        const s: Record<string, boolean> = {};
        for (const o of YAKU_OPTIONS) s[o.value] = false;
        let isMenzen = true, haveKan = false;
        for (const b of furo) {
            if (b.type !== 'ankan') isMenzen = false;
            if (b.type === 'kan' || b.type === 'ankan') haveKan = true;
        }
        if (agariWay === 'tsumo') {
            s.chankan = true;
            s.houte = true;
        }
        if (agariWay === 'ron') {
            s.rinnshann = true;
            s.haite = true;
            s.tenhou = true;
            s.chiihou = true;
        }
        if (!isMenzen) {
            s.riichi = true;
            s['double-riichi'] = true;
            s.ippatsu = true;
        }
        if (!haveKan) s.rinnshann = true;
        if (yakus.includes('riichi')) s['double-riichi'] = true;
        else if (yakus.includes('double-riichi')) s.riichi = true;
        else s.ippatsu = true;
        if (seat === 'east') s.chiihou = true; else s.tenhou = true;
        return s;
    }, [furo, agariWay, seat, yakus]);

    const canCalc = hand.length + furo.length * 3 === 14;

    const result = useMemo((): Result | null => {
        if (!canCalc) return null;
        let totalRed = 0;
        for (const p of hand) if (p.startsWith('0')) totalRed++;
        for (const f of furo) if (f.red) totalRed++;
        const tPai = hand.map(cvtPai);
        const tAgariPai = tPai[tPai.length - 1];
        tPai.pop();
        const s = new State(cvtWind(field), cvtWind(seat), yakus.map(cvtYaku), agariWay === 'tsumo' ? TSUMO : RON, tPai, furo.map(cvtFuro), dora.map(cvtPai), ura.map(cvtPai), tAgariPai, totalRed);
        const c = new Calculator();
        const r = c.calculate(s);
        if (agariWay === 'tsumo') {
            r.point1 += 100 * ponba;
            r.point2 += 100 * ponba;
        } else r.point1 += 300 * ponba;
        return r;
    }, [canCalc, hand, furo, dora, ura, yakus, agariWay, field, seat, ponba]);

    const addTile = useCallback((target: PopupTarget, name: string) => {
        if (tileDisable[name]) return;
        if (target === 'hand') setHand(p => [...p, name]);
        else if (target === 'dora') setDora(p => [...p, name]);
        else if (target === 'ura') setUra(p => [...p, name]);
        else if (target === 'furu' && !name.startsWith('0')) setFuro(p => [...p, {type: furuMode, name}]);
    }, [tileDisable, furuMode]);

    const addChiRed = useCallback((redTile: string, startNum: number) => {
        const tp = redTile[1];
        const name = startNum + tp;
        if ((paiLeft[name] || 0) <= 0) return;
        setFuro(p => [...p, {type: 'chi', name, red: true}]);
        setChiRedPick(null);
    }, [paiLeft]);

    const removeTile = useCallback((arr: string[], idx: number, setter: (v: string[]) => void) => {
        setter(arr.filter((_, i) => i !== idx));
    }, []);
    const removeFuru = useCallback((idx: number) => {
        setFuro(p => p.filter((_, i) => i !== idx));
    }, []);
    const clearAll = () => {
        setHand([]);
        setFuro([]);
        setDora([]);
        setUra([]);
        setYakus([]);
        setAgariWay('tsumo');
        setField('east');
        setSeat('east');
        setPonba(0);
        setPopup(null);
        setChiRedPick(null);
    };

    const toggleYaku = (v: string) => {
        if (yakuDisable[v]) return;
        setYakus(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
    };

    const isTrueAgari = result && result.han > 0 && result.yaku.some(n => !n.startsWith('宝牌') && !n.startsWith('里宝牌') && !n.startsWith('赤宝牌'));
    const needFu = result && (result.manType === 0 || (result.manType === 1 && result.han !== 5));
    const manName = result ? MAN_TYPE_NAMES[result.manType] : '';

    // const popupLabel: Record<string, string> = {hand: '手牌', furu: '副露', dora: '宝牌指示牌', ura: '里宝牌指示牌'};

    const previewTiles = useMemo(() => {
        if (!popup) return [];
        if (popup === 'hand') return hand;
        if (popup === 'dora') return dora;
        if (popup === 'ura') return ura;
        return [];
    }, [popup, hand, dora, ura]);

    return (
        <div className="flex flex-col items-center gap-5">
            {popup && (
                <CalculatorTilePopup
                    popup={popup}
                    setPopup={setPopup}
                    furuMode={furuMode}
                    setFuroMode={setFuroMode}
                    chiRedPick={chiRedPick}
                    setChiRedPick={setChiRedPick}
                    tileDisable={tileDisable}
                    paiLeft={paiLeft}
                    hasRed={hasRed}
                    previewTiles={previewTiles}
                    addTile={addTile}
                    addChiRed={addChiRed}
                />
            )}

            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                justifyContent: 'center',
                alignItems: 'flex-start',
                width: '100%',
                maxWidth: '48rem'
            }}>
                <div style={{display: 'flex', gap: '1rem', width: '100%'}}>
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        background: 'white',
                        borderRadius: '1rem',
                        padding: '0.875rem 1rem',
                        border: '1px solid var(--color-border)'
                    }}>
                        <div style={{display: 'flex', gap: '0.5rem'}}>
                            {[
                                {label: '场风', value: field, onChange: setField},
                                {label: '自风', value: seat, onChange: setSeat},
                            ].map(({label, value, onChange}) => (
                                <div key={label} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    fontSize: '0.8rem'
                                }}>
                                    <span
                                        style={{color: 'var(--color-text-light)', whiteSpace: 'nowrap'}}>{label}</span>
                                    <select value={value} onChange={e => onChange(e.target.value)}
                                            style={{...selectStyle, flex: 1}}>
                                        {WIND_OPTIONS.map(o => <option key={o.value}
                                                                       value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem'}}>
                            <span style={{color: 'var(--color-text-light)'}}>和了方式</span>
                            <select value={agariWay} onChange={e => setAgariWay(e.target.value)} style={selectStyle}>
                                <option value="tsumo">自摸</option>
                                <option value="ron">荣和</option>
                            </select>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem'}}>
                            <span style={{color: 'var(--color-text-light)'}}>本场</span>
                            <input type="number" value={ponba}
                                   onChange={e => setPonba(Math.max(0, parseInt(e.target.value) || 0))} min={0}
                                   style={inputStyle}/>
                        </div>
                    </div>
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.375rem',
                        background: 'white',
                        borderRadius: '1rem',
                        padding: '0.875rem 1rem',
                        border: '1px solid var(--color-border)'
                    }}>
                        {YAKU_OPTIONS.map(o => (
                            <label key={o.value} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                fontSize: '0.8rem',
                                cursor: yakuDisable[o.value] ? 'not-allowed' : 'pointer',
                                opacity: yakuDisable[o.value] ? 0.4 : 1,
                                userSelect: 'none'
                            }}>
                                <input type="checkbox" checked={yakus.includes(o.value)} disabled={yakuDisable[o.value]}
                                       onChange={() => toggleYaku(o.value)}/>
                                {o.label}
                            </label>
                        ))}
                    </div>
                </div>
                <button onClick={clearAll} className="btn btn-sm btn-outline">清空</button>

                {result && (
                    <div style={{
                        background: 'white',
                        border: '2px solid var(--color-border)',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        minWidth: '13rem'
                    }}>
                        {isTrueAgari ? (
                            <>
                                <div style={{
                                    fontSize: '2.5rem',
                                    fontWeight: 800,
                                    color: 'var(--color-primary-dark)',
                                    lineHeight: 1.1
                                }}>
                                    {result.pointType === 2 ? `${result.point1} / ${result.point2}` : result.pointType === 0 ? `${result.point1} ALL` : result.point1}
                                </div>
                                <div style={{
                                    fontSize: '1rem',
                                    color: 'var(--color-text)',
                                    marginTop: '0.25rem',
                                    fontWeight: 600
                                }}>
                                    {result.isYakuman ? `${result.han}倍役满` : `${result.han}翻${needFu ? ` ${result.fu}符` : ''} ${manName}`}
                                </div>
                                <ul style={{
                                    margin: '0.5rem 0 0',
                                    paddingLeft: '1.25rem',
                                    fontSize: '0.8rem',
                                    color: 'var(--color-text)'
                                }}>
                                    {result.yaku.map((n, i) => <li key={i}>{n}</li>)}
                                </ul>
                                {needFu && result.fuMessages.length > 0 && (
                                    <div style={{
                                        borderTop: '1px dashed var(--color-border)',
                                        paddingTop: '0.5rem',
                                        marginTop: '0.5rem'
                                    }}>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            color: 'var(--color-text-light)',
                                            marginBottom: '0.25rem'
                                        }}>符计算过程
                                        </div>
                                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.375rem'}}>
                                            {result.fuMessages.map((m, i) => (
                                                <span key={i} style={{
                                                    background: '#f0f7ff',
                                                    color: '#1565c0',
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '0.5rem',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 500
                                                }}>{m}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{fontSize: '1.5rem', fontWeight: 700, color: '#999'}}>无役/无和牌型</div>
                        )}
                    </div>
                )}
            </div>

            <div style={{width: '100%', maxWidth: '40rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                <CalculatorZoneBox label={`手牌 (${hand.length}/${14 - furo.length * 3})`} target="hand" items={hand}
                    hint="手牌" popup={popup} setPopup={setPopup} furo={furo} removeFuru={removeFuru}
                    removeTile={removeTile} setHand={setHand} setDora={setDora} setUra={setUra}/>
                <CalculatorZoneBox label="副露" target="furu" items={[]} isFuru hint="副露" popup={popup}
                    setPopup={setPopup} furo={furo} removeFuru={removeFuru} removeTile={removeTile} setHand={setHand}
                    setDora={setDora} setUra={setUra}/>
                <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
                    <div style={{flex: 1}}>
                        <CalculatorZoneBox label="宝牌指示牌" target="dora" items={dora} hint="宝牌" popup={popup}
                            setPopup={setPopup} furo={furo} removeFuru={removeFuru} removeTile={removeTile}
                            setHand={setHand} setDora={setDora} setUra={setUra}/>
                    </div>
                    <div style={{flex: 1}}>
                        <CalculatorZoneBox label="里宝牌指示牌" target="ura" items={ura} hint="里宝牌" popup={popup}
                            setPopup={setPopup} furo={furo} removeFuru={removeFuru} removeTile={removeTile}
                            setHand={setHand} setDora={setDora} setUra={setUra}/>
                    </div>
                </div>
            </div>
        </div>
    );
}
