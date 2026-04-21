import { Calculator } from './calc';
import { Rule } from './definition';
import { Pai, Block, BlockType, TSUMO, RON, RIICHI, HAITEI_RAOYUE, HOUTEI_RAOYUI, RINNSHANN_KAIHOU, DOUBLE_RIICHI, IPPATSU, State, randInt, shuffle, choose } from './types';

export interface Problem {
  hand: Pai[];
  agariPai: Pai;
  furu: Block[];
  dora: Pai[];
  ura: Pai[];
  flag: number;
  ans: ReturnType<Calculator['calculate']>;
}

export class ProblemGenerator {
  rule: Rule;
  paiLeft: Record<string, number[]> = {};
  akaDoraLeft: Record<string, number> = {};
  doraCnt = 0;

  constructor(rule: Rule) { this.rule = rule; }

  generate(): Problem {
    this.paiLeft = {};
    for (let i = 0; i < 4; i++) {
      this.paiLeft['mspz'[i]] = new Array(12).fill(4);
    }
    this.akaDoraLeft = { m: 1, s: 1, p: 1 };
    this.doraCnt = 1;

    const field = randInt(0, 2);
    const seat = randInt(0, 4);
    const agariWay = Math.random() < 0.4 ? TSUMO : RON;

    const yakus: number[] = [];
    let hand: Pai[] = [];
    const dora: Pai[] = [];
    const ura: Pai[] = [];
    const furu: Block[] = [];

    if (Math.random() < 0.01) {
      hand = [new Pai('s', 1), new Pai('s', 9), new Pai('m', 1), new Pai('m', 9), new Pai('p', 1), new Pai('p', 9),
        new Pai('z', 1), new Pai('z', 2), new Pai('z', 3), new Pai('z', 4), new Pai('z', 5), new Pai('z', 6), new Pai('z', 7)];
      hand.push(choose([new Pai('s', 1), new Pai('s', 9), new Pai('m', 1), new Pai('m', 9), new Pai('p', 1), new Pai('p', 9),
        new Pai('z', 1), new Pai('z', 2), new Pai('z', 3), new Pai('z', 4), new Pai('z', 5), new Pai('z', 6), new Pai('z', 7)]));
    } else if (Math.random() < 0.05) {
      for (let tuiCnt = 0; tuiCnt < 7;) {
        const tp = 'msp'[randInt(0, 3)] as Pai['type'];
        const num = randInt(1, tp === 'z' ? 8 : 10);
        if (this._canGetPai(tp, num, 3)) { tuiCnt++; hand.push(this._getPai(tp, num)); hand.push(this._getPai(tp, num)); }
      }
    } else {
      let callCount = randInt(-4, 5);
      if (callCount < 0) callCount = 0;
      const wantTanyao = Math.random() < 0.5 && this.rule.shiDuan;
      const wantYakuhai = !wantTanyao && Math.random() < 0.2;

      for (let i = 0; i < 4 - callCount; i++) {
        const p = wantTanyao ? this._genTanyaoBlock() : wantYakuhai && i === 0 ? this._genYakuhaiBlock() : this._genRandomBlock();
        hand.push(...p);
      }
      for (let i = 0; i < callCount; i++) furu.push(wantTanyao ? this._genTanyaoFuru() : this._genRandomFuru());

      /* 立直须门清：明吃/明碰/明杠后不可立直（暗杠仍算门清，isOpen=false） */
      const canRiichi = !furu.some(b => b.isOpen);
      if (!wantTanyao && canRiichi && Math.random() < 0.2) yakus.push(RIICHI);
      const pair = wantTanyao ? this._genTanyaoPair() : this._genRandomPair();
      hand.push(...pair);
    }

    hand.sort();
    const agariIdx = randInt(0, hand.length);
    const agariPai = hand.splice(agariIdx, 1)[0];

    for (let i = 0; i < this.doraCnt; i++) {
      dora.push(this._getRandomPai());
      if (yakus.includes(RIICHI)) ura.push(this._getRandomPai());
    }
    if (Math.random() < 0.01) yakus.push(agariWay === TSUMO ? HAITEI_RAOYUE : HOUTEI_RAOYUI);
    if (this.doraCnt > 1 && agariWay === TSUMO && Math.random() < 0.01) yakus.push(RINNSHANN_KAIHOU);
    if (yakus.includes(RIICHI)) {
      if (Math.random() < 0.01) yakus.splice(yakus.indexOf(RIICHI), 1, DOUBLE_RIICHI);
      if (Math.random() < 0.01) yakus.push(IPPATSU);
    }

    let rc = 0;
    for (const p of hand) rc += p.redCnt;
    for (const b of furu) rc += b.redCnt;
    rc += agariPai.redCnt;

    const s = new State(field, seat, yakus, agariWay, hand, furu, dora, ura, agariPai, rc);
    const c = new Calculator();
    const ans = c.calculate(s, this.rule);

    return { hand, agariPai, furu, dora, ura, flag: s.flag, ans };
  }

  _canGetPai(tp: string, n: number, cnt = 1) { return this.paiLeft[tp][n] >= cnt; }
  _getPai(tp: Pai['type'], n: number): Pai {
    if (n === 5 && this.akaDoraLeft[tp] >= 1 && tp !== 'z' && (Math.random() < 0.25 || this.akaDoraLeft[tp] >= this.paiLeft[tp][n])) {
      this.akaDoraLeft[tp]--; this.paiLeft[tp][n]--;
      const rt = new Pai(tp, n); rt.redCnt = 1; return rt;
    }
    this.paiLeft[tp][n]--;
    return new Pai(tp, n);
  }
  _getRandomPai(): Pai { for (;;) { const tp = 'mspz'[randInt(0, 4)] as Pai['type']; const n = randInt(1, tp === 'z' ? 8 : 10); if (this._canGetPai(tp, n)) return this._getPai(tp, n); } }

  _genTanyaoBlock(): Pai[] {
    for (;;) { const tp = 'msp'[randInt(0, 3)] as Pai['type']; if (Math.random() < 0.15) { const n = randInt(2, 9); if (this._canGetPai(tp, n, 3)) return [this._getPai(tp, n), this._getPai(tp, n), this._getPai(tp, n)]; } else { const n = randInt(2, 7); if (this._canGetPai(tp, n) && this._canGetPai(tp, n + 1) && this._canGetPai(tp, n + 2)) return [this._getPai(tp, n), this._getPai(tp, n + 1), this._getPai(tp, n + 2)]; } }
  }
  _genRandomBlock(): Pai[] {
    for (;;) { const tp = 'mspz'[randInt(0, 4)] as Pai['type']; if (Math.random() < 0.15 || tp === 'z') { const n = randInt(1, tp === 'z' ? 8 : 10); if (this._canGetPai(tp, n, 3)) return [this._getPai(tp, n), this._getPai(tp, n), this._getPai(tp, n)]; } else { const n = randInt(1, 8); if (this._canGetPai(tp, n) && this._canGetPai(tp, n + 1) && this._canGetPai(tp, n + 2)) return [this._getPai(tp, n), this._getPai(tp, n + 1), this._getPai(tp, n + 2)]; } }
  }
  _genYakuhaiBlock(): Pai[] {
    const ys = shuffle([1, 2, 3, 4, 5, 6, 7]);
    for (const n of ys) if (this._canGetPai('z', n, 3)) return [this._getPai('z', n), this._getPai('z', n), this._getPai('z', n)];
    return this._genRandomBlock();
  }
  _genTanyaoPair(): Pai[] { for (;;) { const tp = 'msp'[randInt(0, 3)] as Pai['type']; const n = randInt(2, 9); if (this._canGetPai(tp, n, 2)) return [this._getPai(tp, n), this._getPai(tp, n)]; } }
  _genRandomPair(): Pai[] { for (;;) { const tp = 'mspz'[randInt(0, 4)] as Pai['type']; const n = randInt(1, tp === 'z' ? 8 : 10); if (this._canGetPai(tp, n, 2)) return [this._getPai(tp, n), this._getPai(tp, n)]; } }

  _genRandomFuru(): Block {
    for (;;) {
      const tp = 'mspz'[randInt(0, 4)] as Pai['type'];
      if (Math.random() < 0.15 || tp === 'z') {
        const n = randInt(1, tp === 'z' ? 8 : 10);
        if (Math.random() < 0.1) {
          const isOpen = Math.random() < 0.6;
          if (this._canGetPai(tp, n, 4)) { this.doraCnt++; return this._makeBlock(BlockType.QUAD, tp, n, isOpen); }
        } else {
          if (this._canGetPai(tp, n, 3)) return this._makeBlock(BlockType.TRI, tp, n, true);
        }
      } else {
        const n = randInt(1, 8);
        if (this._canGetPai(tp, n) && this._canGetPai(tp, n + 1) && this._canGetPai(tp, n + 2)) return this._makeBlock(BlockType.SEQ, tp, n, true);
      }
    }
  }
  _genTanyaoFuru(): Block {
    for (;;) {
      const tp = 'msp'[randInt(0, 3)] as Pai['type'];
      if (Math.random() < 0.15) {
        const n = randInt(2, 9);
        if (this._canGetPai(tp, n, 3)) return this._makeBlock(BlockType.TRI, tp, n, true);
      } else {
        const n = randInt(2, 7);
        if (this._canGetPai(tp, n) && this._canGetPai(tp, n + 1) && this._canGetPai(tp, n + 2)) return this._makeBlock(BlockType.SEQ, tp, n, true);
      }
    }
  }

  _makeBlock(bType: BlockType, tp: Pai['type'], n: number, isOpen: boolean): Block {
    let rc = 0;
    for (let i = 0; i < (bType === BlockType.QUAD ? 4 : 3); i++) rc += this._getPai(tp, n).redCnt;
    const b = new Block(bType, tp, n, isOpen);
    b.redCnt = rc;
    return b;
  }
}
