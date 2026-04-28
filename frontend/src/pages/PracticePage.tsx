import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PointsQuickReference from '@/components/PointsQuickReference';
import { ProblemGenerator } from '@/mahjong-calc/problem';
import type { Problem } from '@/mahjong-calc/problem';
import { formatKifuTextFromProblem, parseKifuText, problemFromKifuSnapshot } from '@/mahjong-calc/kifuText';
import { Copy, ClipboardPaste } from 'lucide-react';
import { Rule, MAN_TYPE_NAMES } from '@/mahjong-calc/definition';
import { Pai, Block, BlockType, test, TSUMO, RON, FIELD_EAST, FIELD_SOUTH, FIELD_WEST, FIELD_NORTH, SEAT_EAST, SEAT_SOUTH, SEAT_WEST, SEAT_NORTH, RIICHI, DOUBLE_RIICHI, IPPATSU, HAITEI_RAOYUE, HOUTEI_RAOYUI, RINNSHANN_KAIHOU, CHANKAN, TENHOU, CHIIHOU } from '@/mahjong-calc/types';

const STORAGE_KEY = 'mahjong-practice-records';

interface PracticeRecord {
  correct: boolean;
  timeMs: number;
  timestamp: number;
  han: number;
  fu: number;
  isYakuman: boolean;
  point1: number;
  point2: number;
}

function loadRecords(): PracticeRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveRecords(r: PracticeRecord[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); }

function cvtPai(pai: Pai): string { return pai.redCnt ? '0' + pai.type : pai.num + pai.type; }

function cvtFuro(b: Block): { type: string; name: string; cnt: number } {
  let tp = 'pon';
  if (b.bType === BlockType.SEQ) tp = 'chi';
  else if (b.bType === BlockType.QUAD) tp = b.isOpen ? 'kan' : 'ankan';
  return { type: tp, name: b.num + b.pType, cnt: b.redCnt };
}

function getBlockTiles(item: { type: string; name: string; cnt: number }): string[] {
  const rt: string[] = [];
  let rl = item.cnt;
  const gp = (n: string) => { if (parseInt(n[0]) === 5 && rl > 0) { rl--; return '0' + n[1]; } return n; };
  if (item.type === 'pon') { rt.push('H' + gp(item.name)); rt.push(gp(item.name)); rt.push(gp(item.name)); }
  else if (item.type === 'kan') { rt.push('H' + gp(item.name)); rt.push(gp(item.name)); rt.push(gp(item.name)); rt.push(gp(item.name)); }
  else if (item.type === 'ankan') { rt.push('B'); rt.push(gp(item.name)); rt.push(gp(item.name)); rt.push('B'); }
  else if (item.type === 'chi') {
    rt.push('H' + gp(item.name));
    const n = parseInt(item.name[0]);
    rt.push(gp((n + 1) + item.name[1]));
    rt.push(gp((n + 2) + item.name[1]));
  }
  return rt;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

function getRiichiLabel(flag: number, t: (key: string) => string): string {
  if (test(flag, DOUBLE_RIICHI)) return t('practice.doubleRiichi');
  if (test(flag, RIICHI)) return t('practice.riichi');
  return t('practice.noRiichi');
}

function getFlagInfo(flag: number, t: (key: string) => string): string {
  let info = '';
  const checks: [number, string][] = [
    [FIELD_EAST, t('practice.east1')], [FIELD_SOUTH, t('practice.south1')], [FIELD_WEST, t('practice.west1')], [FIELD_NORTH, t('practice.north1')],
    [SEAT_EAST, t('practice.eastSeat')], [SEAT_SOUTH, t('practice.southSeat')], [SEAT_WEST, t('practice.westSeat')], [SEAT_NORTH, t('practice.northSeat')],
    [TSUMO, t('practice.tsumo')], [RON, t('practice.ron')],
    [IPPATSU, t('practice.ippatsu')], [HAITEI_RAOYUE, t('practice.haitei')], [HOUTEI_RAOYUI, t('practice.houte')],
    [RINNSHANN_KAIHOU, t('practice.rinnshann')], [CHANKAN, t('practice.chankan')], [TENHOU, t('practice.tenhou')], [CHIIHOU, t('practice.chiihou')],
  ];
  for (const [f, name] of checks) if (test(flag, f)) info += name + ' ';
  return info;
}

function TileImg({ name }: { name: string }) {
    const src = `/marjongs/${name}.webp`;
  const isH = name.startsWith('H');
  return <img src={src} alt={name} draggable={false} style={{ height: isH ? '2.5rem' : '3.5rem', width: isH ? 'auto' : undefined, borderRadius: '0.2rem' }} />;
}

export default function PracticePage() {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [phase, setPhase] = useState<'input' | 'show'>('input');
  const [ans, setAns] = useState('');
  const [ansKo, setAnsKo] = useState('');
  const [timer, setTimer] = useState(0);
  const [records, setRecords] = useState<PracticeRecord[]>(loadRecords);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  /** 点击确认时的用时（ms），供记录与展示一致 */
  const solveElapsedRef = useRef<number>(0);
  const [kifuPasteOpen, setKifuPasteOpen] = useState(false);
  const [kifuPasteText, setKifuPasteText] = useState('');
  const [kifuErr, setKifuErr] = useState<string | null>(null);

  const newProblem = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = 0;
    const g = new ProblemGenerator(new Rule());
    const p = g.generate();
    setProblem(p);
    setPhase('input');
    setAns('');
    setAnsKo('');
    setTimer(0);
    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => setTimer(Date.now() - startTimeRef.current), 50);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => newProblem());
    return () => clearInterval(timerRef.current);
  }, [newProblem]);

  useEffect(() => {
    if (phase === 'input') { inputRef.current?.focus(); }
  }, [phase, problem]);

  const handleCheck = () => {
    const elapsed = Date.now() - startTimeRef.current;
    clearInterval(timerRef.current);
    timerRef.current = 0;
    solveElapsedRef.current = elapsed;
    setTimer(elapsed);
    setPhase('show');
  };

  const applyKifuFromText = (raw: string) => {
    setKifuErr(null);
    try {
      const snap = parseKifuText(raw);
      const p = problemFromKifuSnapshot(snap);
      clearInterval(timerRef.current);
      timerRef.current = 0;
      setProblem(p);
      setPhase('input');
      setAns('');
      setAnsKo('');
      setTimer(0);
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => setTimer(Date.now() - startTimeRef.current), 50);
      setKifuPasteOpen(false);
      setKifuPasteText('');
    } catch (e) {
      setKifuErr(e instanceof Error ? e.message : String(e));
    }
  };

  const handleNext = () => {
    if (phase === 'show' && problem) {
      const r = problem.ans;
      const x1 = parseInt(ans) || 0;
      const x2 = parseInt(ansKo) || 0;
      let correct = false;
      if (r.pointType === 1 || r.pointType === 3) correct = x1 === r.point1;
      else if (r.pointType === 0) correct = x1 === r.point1;
      else correct = x1 === r.point1 && x2 === r.point2;
      const record: PracticeRecord = { correct, timeMs: solveElapsedRef.current, timestamp: Date.now(), han: r.han, fu: r.fu, isYakuman: r.isYakuman, point1: r.point1, point2: r.point2 };
      const nr = [record, ...records].slice(0, 200);
      setRecords(nr);
      saveRecords(nr);
    }
    newProblem();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (phase === 'input') handleCheck();
    else handleNext();
  };

  if (!problem) return null;

  const handTiles = problem.hand.filter(p => !p.isAgari).map(cvtPai);
  const agariTile = cvtPai(problem.agariPai);
  const furuBlocks = problem.furu.map(cvtFuro);
  const doraTiles = [...problem.dora.map(cvtPai), ...Array(Math.max(0, 5 - problem.dora.length)).fill('B')];
  const uraTiles = [...problem.ura.map(cvtPai), ...Array(Math.max(0, 5 - problem.ura.length)).fill('B')];
  const flagInfo = getFlagInfo(problem.flag, t);
  const riichiLabel = getRiichiLabel(problem.flag, t);

  const r = problem.ans;
  const isKotsumo = r.pointType === 2;
  const isYakuman = r.isYakuman;
  const resultText = isYakuman
    ? `${r.han}${t('calculator.yakumanResult')}`
    : r.hanRealYaku === 0
      ? t('practice.noYakuResult')
      : r.manType === 1 && r.han === 5 ? `${r.han}${t('practice.hanUnit')} ${t('practice.manganResult')}`
        : r.manType > 0 ? `${r.han}${t('practice.hanUnit')} ${MAN_TYPE_NAMES[r.manType]}`
        : `${r.han}${t('practice.hanUnit')} ${r.fu}符`;

  const placeHolder = isKotsumo ? t('practice.koPointsPlaceholder')
    : r.pointType === 1 || r.pointType === 3 ? t('practice.ronPointsPlaceholder')
    : t('practice.oyaTsumoPlaceholder');

  const x1 = parseInt(ans) || 0, x2 = parseInt(ansKo) || 0;
  let isCorrect = false;
  if (r.pointType === 1 || r.pointType === 3) isCorrect = x1 === r.point1;
  else if (r.pointType === 0) isCorrect = x1 === r.point1;
  else isCorrect = x1 === r.point1 && x2 === r.point2;

  const totalCorrect = records.filter(r => r.correct).length;
  const totalQuestions = records.length;
  const accuracy = totalQuestions > 0 ? Math.round(totalCorrect / totalQuestions * 100) : 0;
  const avgTime = totalQuestions > 0 ? records.reduce((s, r) => s + r.timeMs, 0) / totalQuestions : 0;

  return (
    <div className="flex flex-col items-center gap-5 w-full px-2">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <PointsQuickReference />
        <button
          type="button"
          className="btn btn-sm btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          onClick={() => void navigator.clipboard.writeText(formatKifuTextFromProblem(problem)).catch(() => {})}
        >
          <Copy size={14} /> {t('practice.copyKifu')}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          onClick={() => { setKifuPasteOpen(v => !v); setKifuErr(null); }}
        >
          <ClipboardPaste size={14} /> {t('practice.pasteKifu')}
        </button>
        <div style={{ background: '#fff8e1', padding: '0.25rem 0.75rem', borderRadius: '0.75rem', fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: '#e65100' }}>
          {formatTime(timer)}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
          <span>{t('practice.accuracy')} <b style={{ color: accuracy >= 80 ? '#2d9d78' : accuracy >= 50 ? '#f0b830' : '#e74c3c' }}>{accuracy}%</b></span>
          <span>|</span>
          <span>{t('practice.average')} <b>{formatTime(avgTime)}</b></span>
          <span>|</span>
          <span>{t('practice.answered')} <b>{totalQuestions}</b></span>
        </div>
      </div>

      {kifuPasteOpen && (
        <div style={{ width: '100%', maxWidth: '40rem', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: '#fafafa' }}>
          <textarea
            value={kifuPasteText}
            onChange={e => setKifuPasteText(e.target.value)}
            placeholder={t('practice.pastePlaceholder')}
            rows={8}
            style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'monospace', boxSizing: 'border-box', borderRadius: '0.5rem', padding: '0.5rem', border: '1px solid var(--color-border)' }}
          />
          {kifuErr && <div style={{ color: '#c62828', fontSize: '0.8rem', marginTop: '0.35rem' }}>{kifuErr}</div>}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => applyKifuFromText(kifuPasteText)}>{t('practice.load')}</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => { setKifuPasteOpen(false); setKifuErr(null); }}>{t('practice.cancel')}</button>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '1rem', padding: '1rem 1.25rem', border: '1px solid var(--color-border)', width: '100%', maxWidth: '40rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {handTiles.map((t, i) => <TileImg key={i} name={t} />)}
          <div style={{ width: '0.75rem' }} />
          <div style={{ position: 'relative', display: 'inline-flex', transform: 'rotate(-10deg)' }}>
            <TileImg name={'H' + agariTile} />
          </div>
          <div style={{ width: '0.75rem' }} />
          {furuBlocks.map((f, i) => (
            <div key={i} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '1px' }}>
              {getBlockTiles(f).map((t, j) => <TileImg key={j} name={t} />)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', background: 'white', borderRadius: '1rem', padding: '0.75rem 1.25rem', border: '1px solid var(--color-border)' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>{t('practice.doraIndicators')}</div>
          <div style={{ display: 'flex', gap: '2px' }}>{doraTiles.map((t, i) => <TileImg key={i} name={t} />)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>{t('practice.uraIndicators')}</div>
          <div style={{ display: 'flex', gap: '2px' }}>{uraTiles.map((t, i) => <TileImg key={i} name={t} />)}</div>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '40rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          <span style={{
            background: riichiLabel === t('practice.noRiichi') ? '#eceff1' : '#fff3e0',
            color: riichiLabel === t('practice.noRiichi') ? '#546e7a' : '#e65100',
            padding: '0.4rem 0.85rem',
            borderRadius: '0.625rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
          }}>{riichiLabel}</span>
          {flagInfo.trim().split(/\s+/).filter(Boolean).map((tag, i) => (
            <span key={i} style={{ background: '#e8f5e9', color: '#2e7d32', padding: '0.4rem 0.85rem', borderRadius: '0.625rem', fontSize: '0.9375rem', fontWeight: 600 }}>{tag}</span>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '40rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
            {phase === 'input' ? t('practice.inputAnswer') : t('practice.showAnswer')}
          </div>
          {phase === 'input' ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.2rem' }}>
                  {isKotsumo ? t('practice.koPlayer') : r.pointType === 0 ? t('practice.eachPlayer') : t('practice.points')}
                </div>
                <input ref={inputRef} type="text" value={ans} onChange={e => setAns(e.target.value)} onKeyDown={handleKeyDown} placeholder={placeHolder}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.75rem', border: '2px solid var(--color-primary)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {isKotsumo && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.2rem' }}>{t('practice.oyaPointsPlaceholder')}</div>
                  <input ref={inputRef2} type="text" value={ansKo} onChange={e => setAnsKo(e.target.value)} onKeyDown={handleKeyDown} placeholder={t('practice.oyaPointsPlaceholder')}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.75rem', border: '2px solid var(--color-primary)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid var(--color-border)', padding: '0.75rem 1rem' }}>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--color-text)' }}>
                {r.yaku.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              {r.fuMessages.length > 0 && (
                <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>{t('practice.fuCalcProcess')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {r.fuMessages.map((m, i) => (
                      <span key={i} style={{ background: '#f0f7ff', color: '#1565c0', padding: '0.15rem 0.4rem', borderRadius: '0.375rem', fontSize: '0.7rem' }}>{m}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: '0.5rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>{resultText}</div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: isCorrect ? '#2d9d78' : '#e74c3c', fontWeight: 600 }}>
                {isKotsumo
                  ? <span>{t('practice.you')} {t('practice.koPlayer')}{x1} / {t('practice.oyaPointsPlaceholder')}{x2} | {t('practice.correct')}: {t('practice.koPlayer')}{r.point1} / {t('practice.oyaPointsPlaceholder')}{r.point2}</span>
                  : r.pointType === 1 || r.pointType === 3
                    ? `${t('practice.you')} ${x1} | ${t('practice.correct')}: ${r.point1}`
                    : `${t('practice.you')} ${x1} ALL | ${t('practice.correct')}: ${r.point1}ALL`}
              </div>
              <div style={{ marginTop: '0.375rem', fontSize: '1.25rem', fontWeight: 800 }}>
                {isCorrect ? <span style={{ color: '#2d9d78' }}>{t('practice.correctAnswer')}</span> : <span style={{ color: '#e74c3c' }}>{t('practice.wrongAnswer')}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={phase === 'input' ? handleCheck : handleNext}
        style={{ padding: '0.75rem 3rem', borderRadius: '2rem', border: 'none', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', color: 'white', background: 'linear-gradient(135deg, #a8e6cf, #3d9d78)', boxShadow: '0 2px 8px rgba(61,157,120,0.3)', transition: 'transform 0.1s' }}>
        {phase === 'input' ? t('practice.confirm') : t('practice.next')}
      </button>
    </div>
  );
}
