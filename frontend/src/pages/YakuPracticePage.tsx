import { useState, useCallback, useMemo, useRef } from 'react';
import { YAKU_PRACTICE_LIST, YAKU_CATEGORIES, generateYakuProblems } from '@/mahjong-calc/yakuPracticeGenerator';
import type { YakuProblem, YakuDef } from '@/mahjong-calc/yakuPracticeGenerator';
import { MAN_TYPE_NAMES } from '@/mahjong-calc/definition';
import {
  BlockType,
  CHANKAN,
  CHIIHOU,
  DOUBLE_RIICHI,
  HAITEI_RAOYUE,
  HOUTEI_RAOYUI,
  IPPATSU,
  RIICHI,
  RINNSHANN_KAIHOU,
  TENHOU,
  type Pai,
} from '@/mahjong-calc/types';
import { CheckCircle, XCircle, BookOpen } from 'lucide-react';

const STORAGE_KEY = 'mahjong-yaku-practice';

interface SolveRecord {
  yakuId: string;
  correct: boolean;
  timeMs: number;
  timestamp: number;
}

function loadRecords(): SolveRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveRecords(r: SolveRecord[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(r.slice(0, 500))); }

function solveRecordTimestamp(): number {
  return Date.now();
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function TileImg({ name, small }: { name: string; small?: boolean }) {
  const src = `/marjongs/${name}.webp`;
  const isH = name.startsWith('H');
  return (
    <img src={src} alt={name} draggable={false}
      style={{ height: isH ? '2rem' : (small ? '2.5rem' : '3rem'), width: isH ? 'auto' : undefined, borderRadius: '0.2rem' }} />
  );
}

function cvtPai(p: Pai): string {
  if (p.redCnt > 0) return '0' + p.type;
  return p.num + p.type;
}

function getFlagTags(flag: number): string[] {
  const checks: [number, string][] = [
    [1 << 0, '东一局'], [1 << 1, '南一局'], [1 << 2, '西一局'], [1 << 3, '北一局'],
    [1 << 4, '东家'], [1 << 5, '南家'], [1 << 6, '西家'], [1 << 7, '北家'],
    [1 << 17, '自摸'], [1 << 18, '荣和'],
    [1 << 14, '立直'], [1 << 15, '双立直'], [1 << 16, '一发'],
    [1 << 8, '海底捞月'], [1 << 9, '河底摸鱼'], [1 << 12, '岭上开花'], [1 << 13, '抢杠'],
    [1 << 10, '天和'], [1 << 11, '地和'],
  ];
  const flags = [RIICHI, DOUBLE_RIICHI, IPPATSU, HAITEI_RAOYUE, HOUTEI_RAOYUI, RINNSHANN_KAIHOU, CHANKAN, TENHOU, CHIIHOU];
  const rt: string[] = [];
  for (const [f, name] of checks) {
    if ((flag & f) === f && flags.some(y => (flag & y) === y)) rt.push(name);
  }
  return rt;
}

export default function YakuPracticePage() {
  const [selectedYaku, setSelectedYaku] = useState<YakuDef | null>(null);
  const [problems, setProblems] = useState<YakuProblem[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [userAns, setUserAns] = useState<Record<number, string>>({});
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [records, setRecords] = useState<SolveRecord[]>(loadRecords);
  const timerRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const startPractice = useCallback((yaku: YakuDef) => {
    setSelectedYaku(yaku);
    const p = generateYakuProblems(yaku.id, 10);
    setProblems(p);
    setRevealed(new Set());
    setUserAns({});
    setTimerRunning(true);
    startRef.current = Date.now();
    timerRef.current = window.setInterval(() => setTimer(Date.now() - startRef.current), 50);
  }, []);

  const revealAll = () => {
    setRevealed(new Set(problems.map((_, i) => i)));
    clearInterval(timerRef.current);
    setTimerRunning(false);
  };

  const checkAnswer = (idx: number) => {
    const p = problems[idx];
    if (!p || !p.ans) return false;
    const input = userAns[idx] || '';
    const parts = input.split(/[\s;/]+/).filter(Boolean);
    const x1 = parseInt(parts[0]) || 0;
    const x2 = parseInt(parts[1]) || 0;
    let correct = false;
    const pt = p.ans.pointType;
    if (pt === 0 || pt === 1) correct = x1 === p.ans.point1;
    else if (pt === 2 || pt === 3) correct = x1 === p.ans.point1 && x2 === p.ans.point2;
    return correct;
  };

  const submitAnswer = (idx: number) => {
    const correct = checkAnswer(idx);
    setRevealed(prev => new Set([...prev, idx]));
    const rec: SolveRecord = {
      yakuId: selectedYaku!.id,
      correct,
      timeMs: timer,
      timestamp: solveRecordTimestamp(),
    };
    setRecords(prev => {
      const next = [rec, ...prev];
      saveRecords(next);
      return next;
    });
  };

  const backToList = () => {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    setSelectedYaku(null);
    setProblems([]);
    setRevealed(new Set());
    setUserAns({});
    setTimer(0);
  };

  const yakuDorRecord = useMemo(() => {
    const m: Record<string, { total: number; correct: number }> = {};
    for (const r of records) {
      if (!m[r.yakuId]) m[r.yakuId] = { total: 0, correct: 0 };
      m[r.yakuId].total++;
      if (r.correct) m[r.yakuId].correct++;
    }
    return m;
  }, [records]);

  if (!selectedYaku) {
    return (
      <div className="flex flex-col items-center gap-5" style={{ maxWidth: '40rem' }}>
        <h2 style={{ color: 'var(--color-text)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={20} style={{ color: '#e65100' }} /> 役种专项练习
        </h2>

        {YAKU_CATEGORIES.map(cat => {
          const yakus = YAKU_PRACTICE_LIST.filter(y => y.category === cat);
          return (
            <div key={cat} style={{ width: '100%' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
                {cat}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))", gap: '0.5rem' }}>
                {yakus.map(y => {
                  const rec = yakuDorRecord[y.id];
                  return (
                    <button key={y.id} onClick={() => startPractice(y)}
                      style={{
                        padding: '0.625rem 0.75rem', borderRadius: '0.75rem', border: '2px solid var(--color-border)',
                        background: 'white', cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: '0.25rem',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{y.name}</span>
                        <span style={{ fontSize: '0.7rem', color: rec ? (rec.total > 0 ? (rec.correct / rec.total * 100 >= 80 ? '#2d9d78' : '#f0b830') : '#999') : '#ccc' }}>
                          {rec ? `${rec.correct}/${rec.total}` : '-'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>{y.han}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4" style={{ maxWidth: '40rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', marginBottom: '0.25rem' }}>
        <button onClick={backToList} className="btn btn-sm btn-outline" style={{ whiteSpace: 'nowrap' }}>
          &larr; 返回列表
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>{selectedYaku.name}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginLeft: '0.5rem' }}>{selectedYaku.han}</span>
        </div>
        <div style={{
          background: timerRunning ? '#fff8e1' : '#f5f5f5', padding: '0.25rem 0.75rem', borderRadius: '0.75rem',
          fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace', color: '#e65100',
        }}>
          {formatTime(timer)}
        </div>
      </div>

      <div style={{ width: '100%' }}>
        {problems.map((p, idx) => {
          const handTiles = p.hand.map(cvtPai);
          const agariTile = cvtPai(p.agariPai);
          const furuTiles = p.furu.map(f => {
            const n = f.num;
            const tp = f.pType;
            const base = String(n) + tp;
            const tiles: string[] = [];
            if (f.bType === BlockType.SEQ) tiles.push(base, (n + 1) + tp, (n + 2) + tp);
            else if (f.bType === BlockType.TRI) {
              tiles.push(base, base, base);
            } else if (f.bType === BlockType.QUAD && f.isOpen) {
              tiles.push(base, base, base, base);
            } else tiles.push('B', base, base, 'B');
            return tiles;
          });
          const doraTiles = p.dora.map(d => d.num + d.type);
          const isRevealed = revealed.has(idx);
          const isCorrect = isRevealed && checkAnswer(idx);
          const tags = getFlagTags(p.flag);

          return (
            <div key={idx} style={{
              background: 'white', borderRadius: '1rem', padding: '0.875rem 1rem',
              border: isRevealed ? (isCorrect ? '2px solid #2d9d78' : '2px solid #e74c3c') : '1px solid var(--color-border)',
              transition: 'border-color 0.2s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', fontWeight: 600 }}>第 {idx + 1} 题</span>
                {isRevealed && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem', color: isCorrect ? '#2d9d78' : '#e74c3c' }}>
                    {isCorrect ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {handTiles.map((t, i) => <TileImg key={i} name={t} small />)}
                <div style={{ width: '0.5rem' }} />
                <div style={{ display: 'inline-flex', transform: 'rotate(-10deg)' }}>
                  <TileImg name={'H' + agariTile} small />
                </div>
                {furuTiles.map((f, i) => (
                  <div key={i} style={{ display: 'inline-flex', gap: '1px', alignItems: 'flex-end', marginLeft: '0.25rem' }}>
                    {f.map((t, j) => <TileImg key={j} name={t.startsWith('H') ? t : 'H' + t} small />)}
                  </div>
                ))}
              </div>

              {doraTiles.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-light)' }}>表</span>
                  {doraTiles.map((t, i) => <TileImg key={i} name={t} small />)}
                </div>
              )}

              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.375rem' }}>
                  {tags.map((tag, i) => (
                    <span key={i} style={{ background: '#e8f5e9', color: '#2e7d32', padding: '0.15rem 0.5rem', borderRadius: '0.375rem', fontSize: '0.65rem', fontWeight: 600 }}>{tag}</span>
                  ))}
                </div>
              )}

              {!isRevealed ? (
                <div style={{ marginTop: '0.5rem' }}>
                  <input
                    type="text"
                    value={userAns[idx] || ''}
                    onChange={e => setUserAns(prev => ({ ...prev, [idx]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') submitAnswer(idx); e.preventDefault(); }}
                    placeholder={p.ans.pointType === 2 ? '子/亲 点数 (空格隔开)' : '输入点数'}
                    style={{
                      width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                      border: '2px solid var(--color-primary)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              ) : (
                <div style={{ marginTop: '0.5rem' }}>
                  <ul style={{ margin: 0, paddingLeft: '1.125rem', fontSize: '0.8rem', color: 'var(--color-text)' }}>
                    {p.ans.yaku.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                  {p.ans.fuMessages.length > 0 && (
                    <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '0.375rem', marginTop: '0.375rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>符计算过程</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {p.ans.fuMessages.map((m, i) => (
                          <span key={i} style={{ background: '#f0f7ff', color: '#1565c0', padding: '0.15rem 0.4rem', borderRadius: '0.375rem', fontSize: '0.65rem' }}>{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '0.375rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                    {p.ans.isYakuman ? `${p.ans.han}倍役满` : `${p.ans.han}翻${p.ans.fu}符 ${MAN_TYPE_NAMES[p.ans.manType]}`}
                  </div>
                  <div style={{ marginTop: '0.375rem', fontSize: '1.25rem', fontWeight: 800 }}>
                    <span style={{ color: isCorrect ? '#2d9d78' : '#e74c3c' }}>
                      {p.ans.pointType === 2 ? `${p.ans.point1}/${p.ans.point2}` : p.ans.pointType === 0 ? `${p.ans.point1}ALL` : p.ans.point1}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!timerRunning && problems.length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={revealAll} className="btn btn-sm btn-outline">显示所有答案</button>
          <button onClick={backToList} className="btn" style={{
            padding: '0.625rem 2.5rem', borderRadius: '2rem', border: 'none',
            fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', color: 'white',
            background: 'linear-gradient(135deg, #a8e6cf, #3d9d78)', boxShadow: '0 2px 8px rgba(61,157,120,0.3)',
          }}>
            完成
          </button>
        </div>
      )}
    </div>
  );
}
