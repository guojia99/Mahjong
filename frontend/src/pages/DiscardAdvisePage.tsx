import { useCallback, useMemo, useState, type Dispatch, type MouseEventHandler, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Loader2, Trash2 } from 'lucide-react';
import { MahjongTile } from '@/components/MahjongTile';
import { postDiscardAdvise, type DiscardAdviseMeld, type DiscardAdviseOption } from '@/api/tools';

const TILE_ROWS = [
  ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'],
  ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'],
  ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'],
  ['1z', '2z', '3z', '4z', '5z', '6z', '7z'],
];
const RED_TILES = ['0m', '0p', '0s'];
const FURU_TYPES = [
  { value: 'chi' },
  { value: 'pon' },
  { value: 'kan' },
  { value: 'ankan' },
] as const;

type PopupTarget = 'hand' | 'drawn' | 'furu' | 'dora' | null;
type FuruItem = DiscardAdviseMeld;

function normalKey(p: string): string {
  if (p.startsWith('0') && p[1] && 'mps'.includes(p[1])) return '5' + p[1];
  return p;
}

function TileBtn({
  name,
  onClick,
  disabled,
  highlight,
  small,
}: {
  name: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  highlight?: boolean;
  small?: boolean;
}) {
  const isH = name.startsWith('H');
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
        opacity: disabled ? 0.3 : 1,
        filter: highlight ? 'drop-shadow(0 0 4px #e65100)' : 'none',
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
      <MahjongTile tile={name.replace(/^H/, '')} sideways={isH} height={small ? 28 : isH ? 32 : 40} />
    </button>
  );
}

function FuruBlock({ item, onRemove }: { item: FuruItem; onRemove: MouseEventHandler<HTMLDivElement> }) {
  const tiles = useMemo(() => {
    const rt: string[] = [];
    if (item.type === 'pon') {
      rt.push('H' + item.name, item.name, item.name);
    } else if (item.type === 'kan') {
      rt.push('H' + item.name, item.name, item.name, item.name);
    } else if (item.type === 'ankan') {
      rt.push('B', item.name, item.name, 'B');
    } else {
      const n = parseInt(item.name[0]!);
      const tp = item.name[1]!;
      const seq = [item.name, n + 1 + tp, n + 2 + tp];
      if (item.red) {
        const idx = seq.indexOf('5' + tp);
        if (idx >= 0) seq[idx] = '0' + tp;
      }
      rt.push('H' + seq[0], seq[1]!, seq[2]!);
    }
    return rt;
  }, [item]);

  return (
    <div
      onClick={onRemove}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 1,
        background: 'rgba(255,243,224,0.3)',
        padding: '2px 4px',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      {tiles.map((t, i) => (
        <TileBtn key={i} name={t} small />
      ))}
    </div>
  );
}

function ZoneBox({
  label,
  target,
  items,
  isFuru,
  popup,
  setPopup,
  furo,
  removeFuru,
  removeTile,
  setHand,
  setDrawn,
  setDora,
}: {
  label: string;
  target: PopupTarget;
  items: string[];
  isFuru?: boolean;
  popup: PopupTarget;
  setPopup: Dispatch<SetStateAction<PopupTarget>>;
  furo: FuruItem[];
  removeFuru: (idx: number) => void;
  removeTile: (arr: string[], idx: number, setter: (v: string[]) => void) => void;
  setHand: Dispatch<SetStateAction<string[]>>;
  setDrawn: Dispatch<SetStateAction<string | null>>;
  setDora: Dispatch<SetStateAction<string[]>>;
}) {
  const { t } = useTranslation();
  const isEmpty = isFuru ? furo.length === 0 : items.length === 0;

  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginBottom: 4 }}>{label}</div>
      <div
        onClick={() => setPopup(popup === target ? null : target)}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: isEmpty ? 'center' : 'flex-end',
          justifyContent: isEmpty ? 'center' : 'flex-start',
          minHeight: '3.5rem',
          padding: '0.5rem',
          borderRadius: '0.75rem',
          border: popup === target ? '2px solid var(--color-primary)' : '1px dashed var(--color-border)',
          background: popup === target ? 'rgba(255,243,224,0.3)' : isEmpty ? 'rgba(0,0,0,0.02)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        {isEmpty ? (
          <span style={{ fontSize: '0.8rem', color: '#bbb' }}>{t('calculator.clickToAdd')}</span>
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
            <TileBtn
              key={i}
              name={p}
              onClick={(e) => {
                e.stopPropagation();
                if (target === 'hand') removeTile(items, i, setHand);
                else if (target === 'drawn') setDrawn(null);
                else if (target === 'dora') removeTile(items, i, setDora);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function OptionsTable({ options, t }: { options: DiscardAdviseOption[]; t: (k: string) => string }) {
  const sorted = [...options].sort((a, b) => b.score - a.score || b.pi - a.pi);
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: 'rgba(99,102,241,0.08)' }}>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('discardAdvise.option')}</th>
            <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('discardAdvise.pi')}</th>
            <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('discardAdvise.score')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr
              key={`${o.type}-${o.pai}-${o.action_id}`}
              style={{
                background: o.best ? 'rgba(245,158,11,0.12)' : undefined,
                fontWeight: o.best ? 600 : 400,
              }}
            >
              <td style={{ padding: '0.45rem 0.5rem' }}>
                {o.type === 'dahai' && o.pai ? (
                  <MahjongTile tile={o.label} height={32} highlight={o.best} />
                ) : (
                  <span>{o.type === 'reach' ? t('discardAdvise.riichi') : o.label}</span>
                )}
              </td>
              <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{(o.pi * 100).toFixed(1)}%</td>
              <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{o.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DiscardAdvisePage() {
  const { t } = useTranslation();
  const [hand, setHand] = useState<string[]>([]);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [furo, setFuro] = useState<FuruItem[]>([]);
  const [dora, setDora] = useState<string[]>([]);
  const [popup, setPopup] = useState<PopupTarget>(null);
  const [furuMode, setFuruMode] = useState<(typeof FURU_TYPES)[number]['value']>('chi');
  const [chiRedPick, setChiRedPick] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof postDiscardAdvise>> | null>(null);

  const paiLeft = useMemo(() => {
    const pl: Record<string, number> = {};
    for (const row of TILE_ROWS) for (const p of row) pl[p] = 4;
    for (const p of [...hand, ...(drawn ? [drawn] : []), ...dora]) {
      pl[normalKey(p)] = (pl[normalKey(p)] || 0) - 1;
    }
    for (const f of furo) {
      const n = parseInt(f.name[0]!);
      const tp = f.name[1]!;
      if (f.type === 'pon') pl[f.name] = (pl[f.name] || 0) - 2;
      else if (f.type === 'chi') {
        for (const tn of [n, n + 1]) pl[tn + tp] = (pl[tn + tp] || 0) - 1;
        if (f.red) pl['5' + tp] = (pl['5' + tp] || 0) - 1;
        else pl[(n + 2) + tp] = (pl[(n + 2) + tp] || 0) - 1;
      } else pl[f.name] = (pl[f.name] || 0) - 4;
    }
    return pl;
  }, [hand, drawn, dora, furo]);

  const hasRed = useMemo(() => {
    const hr: Record<string, number> = { m: 0, p: 0, s: 0 };
    for (const p of [...hand, ...(drawn ? [drawn] : [])]) {
      if (p.startsWith('0') && p[1]) hr[p[1]] = (hr[p[1]] || 0) + 1;
    }
    for (const f of furo) if (f.red && f.name[1]) hr[f.name[1]] = (hr[f.name[1]] || 0) + 1;
    return hr;
  }, [hand, drawn, furo]);

  const getAvail = useCallback(
    (key: string) => {
      let avail = paiLeft[key] || 0;
      if (key[1] && 'mps'.includes(key[1]) && parseInt(key[0]) === 5) avail += hasRed[key[1]] || 0;
      return avail;
    },
    [paiLeft, hasRed],
  );

  const tileDisable = useMemo(() => {
    const allTiles = [...TILE_ROWS.flat(), ...RED_TILES];
    const rt: Record<string, boolean> = {};
    for (const p of allTiles) rt[p] = true;
    if (!popup) return rt;

    if (popup === 'hand') {
      const maxHand = 13 - furo.length * 3;
      if (hand.length >= maxHand) return rt;
      for (const p of TILE_ROWS.flat()) if ((paiLeft[p] || 0) > 0) rt[p] = false;
      for (const p of RED_TILES) {
        const k = '5' + p[1];
        if (getAvail(k) > 0 && (hasRed[p[1]!] || 0) < 1) rt[p] = false;
      }
    } else if (popup === 'drawn') {
      if (drawn) return rt;
      for (const p of TILE_ROWS.flat()) if ((paiLeft[p] || 0) > 0) rt[p] = false;
      for (const p of RED_TILES) {
        const k = '5' + p[1];
        if (getAvail(k) > 0 && (hasRed[p[1]!] || 0) < 1) rt[p] = false;
      }
    } else if (popup === 'dora') {
      if (dora.length >= 5) return rt;
      for (const p of TILE_ROWS.flat()) if ((paiLeft[p] || 0) > 0) rt[p] = false;
    } else if (popup === 'furu') {
      const maxF = Math.floor((14 - hand.length - (drawn ? 1 : 0)) / 3);
      if (furo.length >= maxF) return rt;
      if (furuMode === 'chi') {
        for (const row of TILE_ROWS)
          for (const p of row) {
            if (parseInt(p[0]) > 7 || p[1] === 'z') continue;
            const n = parseInt(p[0]);
            const tp = p[1];
            if (getAvail(p) > 0 && getAvail(n + 1 + tp) > 0 && getAvail(n + 2 + tp) > 0) rt[p] = false;
          }
        for (const p of RED_TILES) {
          const tp = p[1]!;
          if (getAvail('3' + tp) > 0 && getAvail('4' + tp) > 0 && (hasRed[tp] || 0) < 1) rt[p] = false;
        }
      } else if (furuMode === 'pon') {
        for (const p of TILE_ROWS.flat()) if (getAvail(p) >= 3) rt[p] = false;
      } else {
        for (const p of TILE_ROWS.flat()) if (getAvail(p) >= 4) rt[p] = false;
      }
    }
    return rt;
  }, [hand, drawn, dora, furo, popup, furuMode, paiLeft, hasRed, getAvail]);

  const canAnalyze = hand.length + furo.length * 3 + (drawn ? 1 : 0) === 14 && dora.length > 0;

  const addTile = useCallback(
    (target: PopupTarget, name: string) => {
      if (tileDisable[name]) return;
      if (target === 'hand') setHand((p) => [...p, name]);
      else if (target === 'drawn') setDrawn(name);
      else if (target === 'dora') setDora((p) => [...p, name]);
      else if (target === 'furu' && !name.startsWith('0')) setFuro((p) => [...p, { type: furuMode, name }]);
    },
    [tileDisable, furuMode],
  );

  const addChiRed = useCallback(
    (redTile: string, startNum: number) => {
      const tp = redTile[1]!;
      const name = startNum + tp;
      if ((paiLeft[name] || 0) <= 0) return;
      setFuro((p) => [...p, { type: 'chi', name, red: true }]);
      setChiRedPick(null);
    },
    [paiLeft],
  );

  const removeTile = useCallback((arr: string[], idx: number, setter: (v: string[]) => void) => {
    setter(arr.filter((_, i) => i !== idx));
  }, []);

  const clearAll = () => {
    setHand([]);
    setDrawn(null);
    setFuro([]);
    setDora([]);
    setPopup(null);
    setResult(null);
    setError(null);
  };

  const analyze = async () => {
    if (!canAnalyze || !drawn) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await postDiscardAdvise({
        hand,
        melds: furo,
        drawn,
        dora,
      });
      setResult(res);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string; error?: string } } }).response?.data?.detail ||
            (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setError(msg || t('discardAdvise.failed'));
    } finally {
      setLoading(false);
    }
  };

  const previewTiles =
    popup === 'hand' ? hand : popup === 'dora' ? dora : popup === 'drawn' && drawn ? [drawn] : [];

  return (
    <div className="flex flex-col items-center gap-5 pb-8">
      <div style={{ textAlign: 'center', maxWidth: '40rem' }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Brain size={22} style={{ color: 'var(--color-primary)' }} />
          {t('discardAdvise.title')}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', margin: 0 }}>{t('discardAdvise.intro')}</p>
      </div>

      {popup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => {
            setPopup(null);
            setChiRedPick(null);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1rem',
              maxWidth: '36rem',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {popup === 'furu' && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {FURU_TYPES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={furuMode === o.value ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline'}
                    onClick={() => setFuruMode(o.value)}
                  >
                    {t('calculator.furu.' + o.value)}
                  </button>
                ))}
              </div>
            )}
            {chiRedPick && (
              <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                {t('calculator.selectChiSequence')}
                {[3, 4].map((n) => (
                  <button key={n} type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 8 }} onClick={() => addChiRed(chiRedPick, n)}>
                    {n}
                    {chiRedPick[1]}
                  </button>
                ))}
              </div>
            )}
            {previewTiles.length > 0 && (
              <div style={{ display: 'flex', gap: 2, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {previewTiles.map((p, i) => (
                  <TileBtn key={i} name={p} />
                ))}
              </div>
            )}
            {TILE_ROWS.map((row) => (
              <div key={row[0]} style={{ display: 'flex', gap: 2, marginBottom: 4, justifyContent: 'center' }}>
                {row.map((p) => (
                  <TileBtn key={p} name={p} disabled={tileDisable[p]} onClick={() => addTile(popup, p)} />
                ))}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
              {RED_TILES.map((p) => (
                <TileBtn
                  key={p}
                  name={p}
                  disabled={tileDisable[p]}
                  onClick={() => {
                    if (popup === 'furu' && furuMode === 'chi') setChiRedPick(p);
                    else addTile(popup, p);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '40rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <ZoneBox
          label={`${t('discardAdvise.handLabel')} (${hand.length}/${13 - furo.length * 3})`}
          target="hand"
          items={hand}
          popup={popup}
          setPopup={setPopup}
          furo={furo}
          removeFuru={(i) => setFuro((p) => p.filter((_, j) => j !== i))}
          removeTile={removeTile}
          setHand={setHand}
          setDrawn={setDrawn}
          setDora={setDora}
        />
        <ZoneBox
          label={t('discardAdvise.drawnLabel')}
          target="drawn"
          items={drawn ? [drawn] : []}
          popup={popup}
          setPopup={setPopup}
          furo={furo}
          removeFuru={() => {}}
          removeTile={removeTile}
          setHand={setHand}
          setDrawn={setDrawn}
          setDora={setDora}
        />
        <ZoneBox
          label={t('calculator.furuLabel')}
          target="furu"
          items={[]}
          isFuru
          popup={popup}
          setPopup={setPopup}
          furo={furo}
          removeFuru={(i) => setFuro((p) => p.filter((_, j) => j !== i))}
          removeTile={removeTile}
          setHand={setHand}
          setDrawn={setDrawn}
          setDora={setDora}
        />
        <ZoneBox
          label={t('calculator.doraLabel')}
          target="dora"
          items={dora}
          popup={popup}
          setPopup={setPopup}
          furo={furo}
          removeFuru={() => {}}
          removeTile={removeTile}
          setHand={setHand}
          setDrawn={setDrawn}
          setDora={setDora}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary" disabled={!canAnalyze || loading} onClick={analyze}>
          {loading ? <Loader2 size={16} className="spin" style={{ marginRight: 6 }} /> : null}
          {t('discardAdvise.analyze')}
        </button>
        <button type="button" className="btn btn-outline" onClick={clearAll}>
          <Trash2 size={14} style={{ marginRight: 4 }} />
          {t('calculator.clearAll')}
        </button>
      </div>

      {error && (
        <div style={{ color: '#c62828', fontSize: '0.875rem', maxWidth: '40rem', textAlign: 'center' }}>{error}</div>
      )}

      {result && (
        <div
          style={{
            width: '100%',
            maxWidth: '40rem',
            background: 'white',
            borderRadius: '1rem',
            border: '1px solid rgba(99,102,241,0.35)',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.75rem' }}>
            {t('discardAdvise.model')}: {result.model_name}
            {result.model_tag ? ` (${result.model_tag})` : ''}
            {result.shanten != null && (
              <span style={{ marginLeft: 12 }}>
                {t('discardAdvise.shanten')}: {result.shanten}
              </span>
            )}
          </div>
          <OptionsTable options={result.options} t={t} />
        </div>
      )}
    </div>
  );
}
