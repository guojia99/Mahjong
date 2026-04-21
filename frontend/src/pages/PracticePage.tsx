import { useState, useEffect, useRef, useCallback } from 'react';
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

function getRiichiLabel(flag: number): string {
  if (test(flag, DOUBLE_RIICHI)) return '双立直';
  if (test(flag, RIICHI)) return '立直';
  return '未立直';
}

function getFlagInfo(flag: number): string {
  let info = '';
  const checks: [number, string][] = [
    [FIELD_EAST, '东一局'], [FIELD_SOUTH, '南一局'], [FIELD_WEST, '西一局'], [FIELD_NORTH, '北一局'],
    [SEAT_EAST, '东家'], [SEAT_SOUTH, '南家'], [SEAT_WEST, '西家'], [SEAT_NORTH, '北家'],
    [TSUMO, '自摸'], [RON, '荣和'],
    [IPPATSU, '一发'], [HAITEI_RAOYUE, '海底捞月'], [HOUTEI_RAOYUI, '河底摸鱼'],
    [RINNSHANN_KAIHOU, '岭上开花'], [CHANKAN, '抢杠'], [TENHOU, '天和'], [CHIIHOU, '地和'],
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
  const flagInfo = getFlagInfo(problem.flag);
  const riichiLabel = getRiichiLabel(problem.flag);

  const r = problem.ans;
  const isKotsumo = r.pointType === 2;
  const isYakuman = r.isYakuman;
  const resultText = isYakuman
    ? `${r.han}倍役满`
    : r.manType === 1 && r.han === 5 ? `${r.han}翻 满贯`
    : r.manType > 0 ? `${r.han}翻 ${MAN_TYPE_NAMES[r.manType]}`
    : `${r.han}翻 ${r.fu}符`;

  const placeHolder = isKotsumo ? '子家点数'
    : r.pointType === 1 || r.pointType === 3 ? '荣和：直接输入点数'
    : '亲家自摸：输入收取每人点数';

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
          <Copy size={14} /> 复制牌谱
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          onClick={() => { setKifuPasteOpen(v => !v); setKifuErr(null); }}
        >
          <ClipboardPaste size={14} /> 粘贴牌谱
        </button>
        <div style={{ background: '#fff8e1', padding: '0.25rem 0.75rem', borderRadius: '0.75rem', fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: '#e65100' }}>
          {formatTime(timer)}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
          <span>正确率: <b style={{ color: accuracy >= 80 ? '#2d9d78' : accuracy >= 50 ? '#f0b830' : '#e74c3c' }}>{accuracy}%</b></span>
          <span>|</span>
          <span>平均: <b>{formatTime(avgTime)}</b></span>
          <span>|</span>
          <span>已答: <b>{totalQuestions}</b></span>
        </div>
      </div>

      {kifuPasteOpen && (
        <div style={{ width: '100%', maxWidth: '40rem', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: '#fafafa' }}>
          <textarea
            value={kifuPasteText}
            onChange={e => setKifuPasteText(e.target.value)}
            placeholder="粘贴牌谱（场型/手牌/和牌/宝牌/里宝/副露）"
            rows={8}
            style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'monospace', boxSizing: 'border-box', borderRadius: '0.5rem', padding: '0.5rem', border: '1px solid var(--color-border)' }}
          />
          {kifuErr && <div style={{ color: '#c62828', fontSize: '0.8rem', marginTop: '0.35rem' }}>{kifuErr}</div>}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => applyKifuFromText(kifuPasteText)}>载入</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => { setKifuPasteOpen(false); setKifuErr(null); }}>取消</button>
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
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>表宝牌</div>
          <div style={{ display: 'flex', gap: '2px' }}>{doraTiles.map((t, i) => <TileImg key={i} name={t} />)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>里宝牌</div>
          <div style={{ display: 'flex', gap: '2px' }}>{uraTiles.map((t, i) => <TileImg key={i} name={t} />)}</div>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '40rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          <span style={{
            background: riichiLabel === '未立直' ? '#eceff1' : '#fff3e0',
            color: riichiLabel === '未立直' ? '#546e7a' : '#e65100',
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
            {phase === 'input' ? '输入答案' : '答案显示'}
          </div>
          {phase === 'input' ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.2rem' }}>
                  {isKotsumo ? '子家' : r.pointType === 0 ? '每人' : '点数'}
                </div>
                <input ref={inputRef} type="text" value={ans} onChange={e => setAns(e.target.value)} onKeyDown={handleKeyDown} placeholder={placeHolder}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.75rem', border: '2px solid var(--color-primary)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {isKotsumo && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginBottom: '0.2rem' }}>亲家</div>
                  <input ref={inputRef2} type="text" value={ansKo} onChange={e => setAnsKo(e.target.value)} onKeyDown={handleKeyDown} placeholder="亲家点数"
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
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>符计算过程</div>
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
                  ? <span>您: 子家{x1} / 亲家{x2} | 正确: 子家{r.point1} / 亲家{r.point2}</span>
                  : r.pointType === 1 || r.pointType === 3
                    ? `您: ${x1} | 正确: ${r.point1}`
                    : `您: ${x1} ALL | 正确: ${r.point1}ALL`}
              </div>
              <div style={{ marginTop: '0.375rem', fontSize: '1.25rem', fontWeight: 800 }}>
                {isCorrect ? <span style={{ color: '#2d9d78' }}>答案正确</span> : <span style={{ color: '#e74c3c' }}>答案错误</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={phase === 'input' ? handleCheck : handleNext}
        style={{ padding: '0.75rem 3rem', borderRadius: '2rem', border: 'none', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', color: 'white', background: 'linear-gradient(135deg, #a8e6cf, #3d9d78)', boxShadow: '0 2px 8px rgba(61,157,120,0.3)', transition: 'transform 0.1s' }}>
        {phase === 'input' ? '确认' : '下一题'}
      </button>
    </div>
  );
}
