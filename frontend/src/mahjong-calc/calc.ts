import { Result, Rule } from './definition';
import { Block, BlockType, HandSet, MachiType, ManType, Pai, Pair, PointType, State, test, CHIIHOU, TENHOU, TSUMO, RON, MENZEN, SEAT_EAST, pType2Int } from './types';
import {
  Pinfu, YAKU_LIST, YAKUMAN_LIST, MenzenTsumo, Tenhou, Chiihou,
  Riichi, DoubleRiichi, Ippatsu, ChanKan, RinshanKaihou, HaiteiRaoyue, HouteiRaoyui,
} from './yaku';
import type { Yaku } from './yaku';

export class Calculator {
  rule = new Rule();
  yakus = YAKU_LIST;
  yakumanYakus = YAKUMAN_LIST;
  pow2: number[] = [1];
  nowP: Pai[] = [];
  nowHandSet?: HandSet;
  result?: Result;

  constructor() {
    for (let i = 1; i <= 20; i++) this.pow2.push(this.pow2[i - 1] << 1);
  }

  _calculateYaku(hand: HandSet, res: Result) {
    res.yaku.splice(0);
    let cnt = 0;
    for (const yaku of this.yakumanYakus) {
      const p = yaku.test(hand, this.rule);
      cnt += p;
      if (p > 0) { res.yaku.push(yaku.getName()); res.isYakuman = true; }
    }
    if (res.isYakuman) { res.han = cnt; return; }
    for (const x of this.yakus) {
      const p = x.test(hand, this.rule);
      cnt += p;
      if (p > 0) res.yaku.push(`${x.getName()}: ${p}翻`);
    }
    res.han = cnt;
  }

  _calculateFu(hand: HandSet, res: Result) {
    if (new Pinfu().test(hand, this.rule) === 1 && test(hand.flag, TSUMO)) {
      res.fu = 20; res.fuMessages.push('平和自摸：20符'); return;
    }
    let fu = 20;
    res.fuMessages.push('底符：20符');
    if (test(hand.flag, TSUMO)) { fu += 2; res.fuMessages.push('自摸 +2符'); }
    if (test(hand.flag, RON | MENZEN)) { fu += 10; res.fuMessages.push('门前荣和 +10符'); }
    if (hand.type === MachiType.DAN_QI) { fu += 2; res.fuMessages.push('单骑听牌 +2符'); }
    if (hand.type === MachiType.KAN_ZHANG) { fu += 2; res.fuMessages.push('坎张听牌 +2符'); }
    if (hand.type === MachiType.BIAN_ZHANG) { fu += 2; res.fuMessages.push('边张听牌 +2符'); }
    for (const b of hand.blocks) {
      if (b.bType === BlockType.SEQ) continue;
      let bf = 2, msg = '';
      if (b.consistYao()) { bf *= 2; msg += '幺九'; } else msg += '中张';
      if (!b.isOpen) { bf *= 2; msg += '暗'; } else msg += '明';
      if (b.bType === BlockType.QUAD) { bf *= 4; msg += '杠'; } else msg += '刻';
      fu += bf; res.fuMessages.push(msg + ` +${bf}符`);
    }
    let qf = 0;
    if (this.rule.lianFeng4) qf = hand.pair.getPai()[0].isYakuhai(hand.flag) * 2;
    else qf = Math.min(1, hand.pair.getPai()[0].isYakuhai(hand.flag)) * 2;
    fu += qf;
    if (qf > 0) res.fuMessages.push(`役牌雀头 +${qf}符`);
    if (fu === 20) { res.fu = 30; res.fuMessages.push('吃牌后，合计20符时：30符'); return; }
    res.fuMessages.push(`共${fu}符`);
    if (fu % 10 !== 0) { fu = Math.floor((fu + 10) / 10) * 10; res.fuMessages[res.fuMessages.length - 1] += `，切上${fu}符`; }
    res.fu = fu;
  }

  _takeBetterResult(nr: Result) {
    if (!this.result || nr.point1 > this.result.point1 ||
      (nr.point1 === this.result.point1 && nr.point2 > this.result.point2) ||
      (nr.point1 === this.result.point1 && nr.point2 === this.result.point2 && nr.han > this.result.han)) {
      this.result = nr;
    }
  }

  _calculatePoint(hand: HandSet, res: Result) {
    res.pointType = 0 | (+(!test(hand.flag, SEAT_EAST))) << 1 | +test(hand.flag, RON);
    let basePoint = 0;
    if (res.isYakuman) {
      basePoint = 8000 * res.han;
    } else if ((res.han === 3 && res.fu >= 70) || (res.han === 4 && res.fu >= 40) || res.han === 5) {
      res.manType = ManType.MANGAN; basePoint = 2000;
    } else if (res.han === 6 || res.han === 7) {
      res.manType = ManType.HANEMAN; basePoint = 3000;
    } else if (res.han >= 8 && res.han <= 10) {
      res.manType = ManType.BAIMAN; basePoint = 4000;
    } else if ((res.han >= 11 && res.han <= 12) || (res.han >= 13 && !this.rule.allowLeiMan)) {
      res.manType = ManType.SANBAIMAN; basePoint = 6000;
    } else if (res.han >= 13 && this.rule.allowLeiMan) {
      res.manType = ManType.KAZOEYAKUMAN; basePoint = 8000;
    } else {
      res.manType = ManType.NOMANGAN;
      basePoint = res.han === 0 ? 0 : res.fu * this.pow2[res.han + 2];
    }
    switch (res.pointType) {
      case PointType.OYATSUMO: res.point1 = 2 * basePoint; break;
      case PointType.OYARON: res.point1 = 6 * basePoint; break;
      case PointType.KOTSUMO: res.point1 = basePoint; res.point2 = 2 * basePoint; break;
      case PointType.KORON: res.point1 = 4 * basePoint; break;
    }
    if (res.point1 % 100 !== 0) res.point1 = Math.floor((res.point1 + 100) / 100) * 100;
    if (res.point2 % 100 !== 0) res.point2 = Math.floor((res.point2 + 100) / 100) * 100;
    if (!res.isYakuman && res.han === 0 && test(hand.flag, RON)) {
      res.point1 = -8000;
      res.point2 = 0;
    }
  }

  _calculateNormal(dep: number) {
    if (this.nowP.length === 0) {
      const nr = new Result();
      this._calculateFu(this.nowHandSet!, nr);
      this._calculateYaku(this.nowHandSet!, nr);
      this._calculatePoint(this.nowHandSet!, nr);
      this._takeBetterResult(nr);
      return;
    }
    if (dep === 0) {
      for (let i = 0; i < this.nowP.length - 1; i++) {
        if (this.nowP[i].equalTo(this.nowP[i + 1])) {
          const a = this.nowP[i], b = this.nowP[i + 1];
          const savedMachi = this.nowHandSet!.type;
          if (a.isAgari || b.isAgari) this.nowHandSet!.type = MachiType.DAN_QI;
          else this.nowHandSet!.type = MachiType.BIAN_ZHANG;
          this.nowHandSet!.pair = new Pair(a.type, a.num);
          this.nowP.splice(i, 2);
          this._calculateNormal(dep + 1);
          this.nowP.splice(i, 0, a, b);
          this.nowHandSet!.type = savedMachi;
        }
      }
    } else {
      const a = this.nowP[0], b = this.nowP[1], c = this.nowP[2];
      if (a.equalTo(b) && b.equalTo(c)) {
        const savedMachi = this.nowHandSet!.type;
        let open = false;
        if (a.isAgari || b.isAgari || c.isAgari) {
          this.nowHandSet!.type = MachiType.SHUANG_PENG;
          if (test(this.nowHandSet!.flag, RON)) open = true;
        } else this.nowHandSet!.type = MachiType.BIAN_ZHANG;
        this.nowHandSet!.blocks.push(new Block(BlockType.TRI, a.type, a.num, open));
        this.nowP.splice(0, 3);
        this._calculateNormal(dep + 1);
        this.nowP.splice(0, 0, a, b, c);
        this.nowHandSet!.blocks.pop();
        this.nowHandSet!.type = savedMachi;
      }
      if (this.nowP[0].num > 7 || this.nowP[0].type === 'z') return;
      const a2 = a.next(), a3 = a2.next();
      for (let i = 1; i < this.nowP.length; i++) {
        for (let j = i + 1; j < this.nowP.length; j++) {
          if (this.nowP[i].equalTo(a2) && this.nowP[j].equalTo(a3)) {
            const b2 = this.nowP[i], b3 = this.nowP[j];
            const savedMachi = this.nowHandSet!.type;
            this.nowHandSet!.blocks.push(new Block(BlockType.SEQ, a.type, a.num, false));
            if (a.isAgari) this.nowHandSet!.type = a.num === 7 ? MachiType.BIAN_ZHANG : MachiType.LIANG_MIAN;
            else if (b3.isAgari) this.nowHandSet!.type = b3.num === 3 ? MachiType.BIAN_ZHANG : MachiType.LIANG_MIAN;
            else if (b2.isAgari) this.nowHandSet!.type = MachiType.KAN_ZHANG;
            else this.nowHandSet!.type = MachiType.BIAN_ZHANG;
            this.nowP.splice(j, 1); this.nowP.splice(i, 1); this.nowP.splice(0, 1);
            this._calculateNormal(dep + 1);
            this.nowP.splice(0, 0, a); this.nowP.splice(i, 0, b2); this.nowP.splice(j, 0, b3);
            this.nowHandSet!.blocks.pop();
            this.nowHandSet!.type = savedMachi;
          }
        }
      }
    }
  }

  _calculateKokushi() {
    const cnt: number[] = new Array(20).fill(0);
    const isAgari: boolean[] = new Array(20).fill(false);
    for (const p of this.nowP) {
      if (!p.isYao()) return;
      if (p.type === 'm') { let x = p.num; if (x === 9) x = 2; if (p.isAgari) isAgari[7 + x] = true; cnt[7 + x]++; }
      else if (p.type === 's') { let x = p.num; if (x === 9) x = 2; if (p.isAgari) isAgari[9 + x] = true; cnt[9 + x]++; }
      else if (p.type === 'p') { let x = p.num; if (x === 9) x = 2; if (p.isAgari) isAgari[11 + x] = true; cnt[11 + x]++; }
      else if (p.type === 'z') { let x = p.num; if (x === 9) x = 2; if (p.isAgari) isAgari[x] = true; cnt[x]++; }
    }
    let yc = 1;
    for (let i = 1; i <= 13; i++) { if (cnt[i] === 0) return; if (cnt[i] === 2 && isAgari[i]) yc++; }
    const res = new Result();
    res.han = yc; res.isYakuman = true;
    res.yaku.push(yc === 1 ? '国士无双' : '国士无双十三面');
    if (test(this.nowHandSet!.flag, TENHOU)) { res.yaku.push('天和'); res.han++; }
    if (test(this.nowHandSet!.flag, CHIIHOU)) { res.yaku.push('地和'); res.han++; }
    this._calculatePoint(this.nowHandSet!, res);
    this.result = res;
  }

  _calculateChiitui() {
    if (!test(this.nowHandSet!.flag, MENZEN) || this.nowP.length !== 14) return;
    for (let i = 0; i < 7; i++) {
      if (!this.nowP[i * 2].equalTo(this.nowP[i * 2 + 1])) return;
      if (i > 0 && this.nowP[i * 2].equalTo(this.nowP[i * 2 - 1])) return;
    }

    const h = this.nowHandSet!;
    /** 七对子形但为役满牌型时只按役满计，不计「七对子」与 25 符（与常见规则及 mahjong-vue 役满分支一致） */
    const finishChiitoiYakuman = (baseHan: number, names: string[]) => {
      let yk = baseHan;
      const yn = [...names];
      if (new Tenhou().test(h, this.rule) > 0) { yk++; yn.push('天和'); }
      if (new Chiihou().test(h, this.rule) > 0) { yk++; yn.push('地和'); }
      const res = new Result();
      res.isYakuman = true;
      res.han = yk;
      res.yaku = yn;
      this._calculatePoint(h, res);
      this._takeBetterResult(res);
    };
    if (this.nowP.every(p => p.type === 'z')) {
      finishChiitoiYakuman(1, ['字一色']);
      return;
    }
    if (this.nowP.every(p => p.isRyu())) {
      finishChiitoiYakuman(1, ['绿一色']);
      return;
    }

    let cnt = 2;
    const yakuName: string[] = ['七对子: 2翻'];
    let yakuman = 0;
    const yakumanName: string[] = [];

    let dora = 0, ura = 0;
    const akadora = this.nowHandSet!.redCnt;
    for (const p of this.nowP) {
      for (const d of this.nowHandSet!.dora) if (p.equalTo(d.next())) dora++;
      for (const d of this.nowHandSet!.ura) if (p.equalTo(d.next())) ura++;
    }
    if (dora > 0) yakuName.push(`宝牌: ${dora}翻`);
    if (ura > 0) yakuName.push(`里宝牌: ${ura}翻`);
    if (akadora > 0) yakuName.push(`赤宝牌: ${akadora}翻`);
    cnt += dora + ura + akadora;

    const calcFlagYaku = (yaku: Yaku, asYakuman: boolean) => {
      const x = yaku.test(h, this.rule);
      if (x <= 0) return;
      if (!asYakuman) {
        cnt += x;
        yakuName.push(`${yaku.getName()}: ${x}翻`);
      } else {
        yakuman += x;
        yakumanName.push(yaku.getName());
      }
    };
    calcFlagYaku(new Riichi(), false);
    calcFlagYaku(new DoubleRiichi(), false);
    calcFlagYaku(new MenzenTsumo(), false);
    calcFlagYaku(new Ippatsu(), false);
    calcFlagYaku(new ChanKan(), false);
    calcFlagYaku(new RinshanKaihou(), false);
    calcFlagYaku(new HouteiRaoyui(), false);
    calcFlagYaku(new HaiteiRaoyue(), false);
    calcFlagYaku(new Tenhou(), true);
    calcFlagYaku(new Chiihou(), true);

    const allNonYao = () => { for (const p of this.nowP) if (p.isYao()) return false; return true; };
    if (allNonYao()) {
      cnt += 1;
      yakuName.push('断幺九: 1翻');
    }
    const typeCnt = [0, 0, 0, 0];
    for (const p of this.nowP) typeCnt[pType2Int(p.type)] = 1;
    if (typeCnt[0] + typeCnt[1] + typeCnt[2] === 1 && typeCnt[3] === 1) {
      cnt += 3;
      yakuName.push('混一色: 3翻');
    }
    if (typeCnt[0] + typeCnt[1] + typeCnt[2] === 1 && typeCnt[3] === 0) {
      cnt += 6;
      yakuName.push('清一色: 6翻');
    }
    const allYao = () => { for (const p of this.nowP) if (!p.isYao()) return false; return true; };
    if (allYao()) {
      cnt += 2;
      yakuName.push('混老头: 2翻');
    }

    const res = new Result();
    if (yakuman > 0) {
      res.han = yakuman;
      res.yaku = yakumanName;
      res.isYakuman = true;
    } else {
      res.han = cnt;
      res.fu = 25;
      res.yaku = yakuName;
    }
    this._calculatePoint(this.nowHandSet!, res);
    if (!res.isYakuman) res.fuMessages.push('七对子：25符');
    this._takeBetterResult(res);
  }

  calculate(state: State, rule = new Rule()): Result {
    this.rule = rule;
    this.nowHandSet = new HandSet([], new Pair('m', 1), state.dora, state.ura, MachiType.BIAN_ZHANG, state.flag, state.agariPai, state.redCnt);
    this.result = new Result();
    this.nowP = [...state.pais, state.agariPai];
    this.nowP.sort();
    for (const b of state.furu) this.nowHandSet.blocks.push(b);
    this._calculateKokushi();
    this._calculateNormal(0);
    this._calculateChiitui();
    return this.result!;
  }
}
