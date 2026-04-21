import { Rule } from './definition';
import { HandSet, BlockType, MachiType, test, pType2Int } from './types';

export interface Yaku {
  test(handSet: HandSet, rule: Rule): number;
  getName(): string;
}

export class MenzenTsumo implements Yaku {
  test(h: HandSet, _: Rule) { return test(h.flag, (1 << 17) | (1 << 19)) ? 1 : 0; }
  getName() { return '门前清自摸和'; }
}
export class TanYao implements Yaku {
  test(h: HandSet, rule: Rule) {
    if (!rule.shiDuan && !test(h.flag, 1 << 19)) return 0;
    for (const b of h.blocks) if (b.consistYao()) return 0;
    if (h.pair.consistYao()) return 0;
    return 1;
  }
  getName() { return '断幺九'; }
}
function yakuhaiField(fieldFlag: number, zNum: number, name: string) {
  return class implements Yaku {
    test(h: HandSet, _: Rule) {
      if (!test(h.flag, fieldFlag)) return 0;
      for (const b of h.blocks) if (b.pType === 'z' && b.num === zNum) return 1;
      return 0;
    }
    getName() { return name; }
  };
}
export class YakuhaiHako implements Yaku {
  test(h: HandSet, _: Rule) { for (const b of h.blocks) if (b.pType === 'z' && b.num === 5) return 1; return 0; }
  getName() { return '役牌 - 白'; }
}
export class YakuhaiHatsu implements Yaku {
  test(h: HandSet, _: Rule) { for (const b of h.blocks) if (b.pType === 'z' && b.num === 6) return 1; return 0; }
  getName() { return '役牌 - 发'; }
}
export class YakuhaiCyuu implements Yaku {
  test(h: HandSet, _: Rule) { for (const b of h.blocks) if (b.pType === 'z' && b.num === 7) return 1; return 0; }
  getName() { return '役牌 - 中'; }
}
function flagYaku(flagVal: number, name: string, requireMenzen = false) {
  return class implements Yaku {
    test(h: HandSet, _: Rule) {
      if (requireMenzen && !test(h.flag, 1 << 19)) return 0;
      return test(h.flag, flagVal) ? 1 : 0;
    }
    getName() { return name; }
  };
}
export class Pinfu implements Yaku {
  test(h: HandSet, _: Rule) {
    if (!test(h.flag, 1 << 19)) return 0;
    if (h.pair.getPai()[0].isYakuhai(h.flag)) return 0;
    for (const b of h.blocks) if (b.bType !== BlockType.SEQ) return 0;
    if (h.type !== MachiType.LIANG_MIAN) return 0;
    return 1;
  }
  getName() { return '平和'; }
}
export class Iipeikou implements Yaku {
  test(h: HandSet, _: Rule) {
    if (!test(h.flag, 1 << 19)) return 0;
    const lb = h.blocks.slice(0);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      if (lb[i].equalTo(lb[j]) && lb[i].bType === BlockType.SEQ) {
        lb.splice(j, 1); lb.splice(i, 1);
        return lb.length < 2 || !lb[0].equalTo(lb[1]) ? 1 : 0;
      }
    }
    return 0;
  }
  getName() { return '一杯口'; }
}
export class Ryanpeikou implements Yaku {
  test(h: HandSet, _: Rule) {
    if (!test(h.flag, 1 << 19)) return 0;
    const lb = h.blocks.slice(0);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      if (lb[i].equalTo(lb[j]) && lb[i].bType === BlockType.SEQ) {
        lb.splice(j, 1); lb.splice(i, 1);
        return (lb.length >= 2 && lb[0].equalTo(lb[1])) ? 3 : 0;
      }
    }
    return 0;
  }
  getName() { return '两杯口'; }
}
export class Dora implements Yaku {
  test(h: HandSet, _: Rule) {
    let cnt = 0;
    for (const b of h.blocks) for (const p of b.getPai()) for (const d of h.dora) if (d.next().equalTo(p)) cnt++;
    for (const d of h.dora) if (d.next().equalTo(h.pair.getPai()[0])) cnt += 2;
    return cnt;
  }
  getName() { return '宝牌'; }
}
export class Ura implements Yaku {
  test(h: HandSet, _: Rule) {
    let cnt = 0;
    for (const b of h.blocks) for (const p of b.getPai()) for (const d of h.ura) if (d.next().equalTo(p)) cnt++;
    for (const d of h.ura) if (d.next().equalTo(h.pair.getPai()[0])) cnt += 2;
    return cnt;
  }
  getName() { return '里宝牌'; }
}
export class AkaDora implements Yaku {
  test(h: HandSet, _: Rule) { return h.redCnt; }
  getName() { return '赤宝牌'; }
}
export class Toitoi implements Yaku {
  test(h: HandSet, _: Rule) { for (const b of h.blocks) if (b.bType === BlockType.SEQ) return 0; return 2; }
  getName() { return '对对和'; }
}
export class Sanankou implements Yaku {
  test(h: HandSet, _: Rule) { let c = 0; for (const b of h.blocks) if (b.bType !== BlockType.SEQ && !b.isOpen) c++; return c === 3 ? 2 : 0; }
  getName() { return '三暗刻'; }
}
export class SanshokuDoukou implements Yaku {
  test(h: HandSet, _: Rule) {
    const c: number[] = new Array(13).fill(0);
    for (const b of h.blocks) { if (b.bType !== BlockType.SEQ) { c[b.num] |= (1 << pType2Int(b.pType)); if (c[b.num] === 7) return 2; } }
    return 0;
  }
  getName() { return '三色同刻'; }
}
export class SanshokuDoujun implements Yaku {
  test(h: HandSet, _: Rule) {
    let v = 2; if (!test(h.flag, 1 << 19)) v--;
    const c: number[] = new Array(13).fill(0);
    for (const b of h.blocks) { if (b.bType === BlockType.SEQ) { c[b.num] |= (1 << pType2Int(b.pType)); if (c[b.num] === 7) return v; } }
    return 0;
  }
  getName() { return '三色同顺'; }
}
export class Sankantsu implements Yaku {
  test(h: HandSet, _: Rule) { let c = 0; for (const b of h.blocks) if (b.bType === BlockType.QUAD) c++; return c === 3 ? 2 : 0; }
  getName() { return '三杠子'; }
}
export class Shousangen implements Yaku {
  test(h: HandSet, _: Rule) {
    let c = 0; for (const b of h.blocks) if (b.pType === 'z' && 5 <= b.num && b.num <= 7) c++;
    return (c === 2 && h.pair.type === 'z' && 5 <= h.pair.num && h.pair.num <= 7) ? 2 : 0;
  }
  getName() { return '小三元'; }
}
export class Honroutou implements Yaku {
  test(h: HandSet, _: Rule) {
    let hasZi = false;
    for (const b of h.blocks) { if (b.bType === BlockType.SEQ || !b.getPai()[0].isYao()) return 0; if (b.pType === 'z') hasZi = true; }
    if (h.pair.type === 'z') hasZi = true;
    return (h.pair.getPai()[0].isYao() && hasZi) ? 2 : 0;
  }
  getName() { return '混老头'; }
}
export class Chantaiyao implements Yaku {
  test(h: HandSet, _: Rule) {
    let v = 2; if (!test(h.flag, 1 << 19)) v--;
    let haveZi = false, haveSEQ = false;
    for (const b of h.blocks) { if (b.bType === BlockType.SEQ) haveSEQ = true; if (b.pType === 'z') haveZi = true; if (!b.consistYao()) return 0; }
    if (h.pair.type === 'z') haveZi = true;
    if (!h.pair.consistYao() || !haveZi || !haveSEQ) return 0;
    return v;
  }
  getName() { return '混全带幺九'; }
}
export class Junchantaiyao implements Yaku {
  test(h: HandSet, _: Rule) {
    let v = 3; if (!test(h.flag, 1 << 19)) v--;
    let haveZi = false, haveSEQ = false;
    for (const b of h.blocks) { if (b.bType === BlockType.SEQ) haveSEQ = true; if (b.pType === 'z') haveZi = true; if (!b.consistYao()) return 0; }
    if (h.pair.type === 'z') haveZi = true;
    if (!h.pair.consistYao() || haveZi || !haveSEQ) return 0;
    return v;
  }
  getName() { return '纯全带幺九'; }
}
export class Honiisou implements Yaku {
  test(h: HandSet, _: Rule) {
    let v = 3; if (!test(h.flag, 1 << 19)) v--;
    const ct = [0, 0, 0, 0];
    for (const b of h.blocks) ct[pType2Int(b.pType)] = 1;
    ct[pType2Int(h.pair.type)] = 1;
    return (ct[0] + ct[1] + ct[2] === 1 && ct[3]) ? v : 0;
  }
  getName() { return '混一色'; }
}
export class Chiniisou implements Yaku {
  test(h: HandSet, _: Rule) {
    let v = 6; if (!test(h.flag, 1 << 19)) v--;
    const ct = [0, 0, 0, 0];
    for (const b of h.blocks) ct[pType2Int(b.pType)] = 1;
    ct[pType2Int(h.pair.type)] = 1;
    return (ct[0] + ct[1] + ct[2] === 1 && !ct[3]) ? v : 0;
  }
  getName() { return '清一色'; }
}
export class Ikkitsuukan implements Yaku {
  test(h: HandSet, _: Rule) {
    let v = 2; if (!test(h.flag, 1 << 19)) v--;
    const c = [0, 0, 0, 0, 0];
    for (const b of h.blocks) {
      if (b.bType !== BlockType.SEQ) continue;
      const pi = pType2Int(b.pType);
      if (b.num === 1) { c[pi] |= 1; if (c[pi] === 7) return v; }
      if (b.num === 4) { c[pi] |= 2; if (c[pi] === 7) return v; }
      if (b.num === 7) { c[pi] |= 4; if (c[pi] === 7) return v; }
    }
    return 0;
  }
  getName() { return '一气通贯'; }
}

// Yakuman yakus
export class Daisangen implements Yaku {
  test(h: HandSet, _: Rule) { let c = 0; for (const b of h.blocks) if (b.pType === 'z' && 5 <= b.num && b.num <= 7) c++; return c === 3 ? 1 : 0; }
  getName() { return '大三元'; }
}
export class Suuankou implements Yaku {
  test(h: HandSet, _: Rule) {
    if (!test(h.flag, 1 << 19)) return 0;
    let c = 0; for (const b of h.blocks) if (b.bType !== BlockType.SEQ && !b.isOpen) c++;
    return (c === 4 && !h.agariPai.equalTo(h.pair.getPai()[0])) ? 1 : 0;
  }
  getName() { return '四暗刻'; }
}
export class SuuankouTanki implements Yaku {
  test(h: HandSet, rule: Rule) {
    if (!test(h.flag, 1 << 19)) return 0;
    let c = 0; for (const b of h.blocks) if (b.bType !== BlockType.SEQ && !b.isOpen) c++;
    return (c === 4 && h.agariPai.equalTo(h.pair.getPai()[0])) ? (rule.duoBeiYiMan ? 2 : 1) : 0;
  }
  getName() { return '四暗刻单骑'; }
}
export class Shousuushi implements Yaku {
  test(h: HandSet, _: Rule) {
    let c = 0; for (const b of h.blocks) if (b.pType === 'z' && 1 <= b.num && b.num <= 4) c++;
    return (c === 3 && h.pair.type === 'z' && 1 <= h.pair.num && h.pair.num <= 4) ? 1 : 0;
  }
  getName() { return '小四喜'; }
}
export class Daisuushi implements Yaku {
  test(h: HandSet, rule: Rule) {
    let c = 0; for (const b of h.blocks) if (b.pType === 'z' && 1 <= b.num && b.num <= 4) c++;
    return c === 4 ? (rule.duoBeiYiMan ? 2 : 1) : 0;
  }
  getName() { return '大四喜'; }
}
export class Tsuuiisou implements Yaku {
  test(h: HandSet, _: Rule) {
    for (const b of h.blocks) if (b.pType !== 'z') return 0;
    return h.pair.type === 'z' ? 1 : 0;
  }
  getName() { return '字一色'; }
}
export class Ryuuiisou implements Yaku {
  test(h: HandSet, _: Rule) {
    for (const b of h.blocks) for (const p of b.getPai()) if (!p.isRyu()) return 0;
    for (const p of h.pair.getPai()) if (!p.isRyu()) return 0;
    return 1;
  }
  getName() { return '绿一色'; }
}
export class Chinroutou implements Yaku {
  test(h: HandSet, _: Rule) {
    let hasZi = false;
    for (const b of h.blocks) { if (b.bType === BlockType.SEQ || !b.getPai()[0].isYao()) return 0; if (b.pType === 'z') hasZi = true; }
    if (h.pair.type === 'z') hasZi = true;
    return (h.pair.getPai()[0].isYao() && !hasZi) ? 1 : 0;
  }
  getName() { return '清老头'; }
}
export class ChuurenPoutou implements Yaku {
  test(h: HandSet, _: Rule) {
    if (!test(h.flag, 1 << 19)) return 0;
    if (!new Chiniisou().test(h, _)) return 0;
    const cnt = new Array(12).fill(0);
    const need = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
    for (const b of h.blocks) { if (b.bType === BlockType.QUAD) return 0; for (const p of b.getPai()) cnt[p.num]++; }
    for (const p of h.pair.getPai()) cnt[p.num]++;
    let mulNum = -1;
    for (let i = 1; i <= 9; i++) { if (cnt[i] < need[i] || cnt[i] > need[i] + 1) return 0; if (cnt[i] === need[i] + 1) mulNum = i; }
    return mulNum !== h.agariPai.num ? 1 : 0;
  }
  getName() { return '九莲宝灯'; }
}
export class JunseiChuurenPoutou implements Yaku {
  test(h: HandSet, rule: Rule) {
    if (!test(h.flag, 1 << 19)) return 0;
    if (!new Chiniisou().test(h, rule)) return 0;
    const cnt = new Array(12).fill(0);
    const need = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
    for (const b of h.blocks) { if (b.bType === BlockType.QUAD) return 0; for (const p of b.getPai()) cnt[p.num]++; }
    for (const p of h.pair.getPai()) cnt[p.num]++;
    let mulNum = -1;
    for (let i = 1; i <= 9; i++) { if (cnt[i] < need[i] || cnt[i] > need[i] + 1) return 0; if (cnt[i] === need[i] + 1) mulNum = i; }
    return mulNum === h.agariPai.num ? (rule.duoBeiYiMan ? 2 : 1) : 0;
  }
  getName() { return '纯正九莲宝灯'; }
}
export class Suukantsu implements Yaku {
  test(h: HandSet, _: Rule) { for (const b of h.blocks) if (b.bType !== BlockType.QUAD) return 0; return 1; }
  getName() { return '四杠子'; }
}
export class Tenhou implements Yaku {
  test(h: HandSet, _: Rule) { return (!test(h.flag, 1 << 19) || !test(h.flag, 1 << 10)) ? 0 : 1; }
  getName() { return '天和'; }
}
export class Chiihou implements Yaku {
  test(h: HandSet, _: Rule) { return (!test(h.flag, 1 << 19) || !test(h.flag, 1 << 11)) ? 0 : 1; }
  getName() { return '地和'; }
}

export const ChanKan = flagYaku(1 << 13, '抢杠');
export const RinshanKaihou = flagYaku(1 << 12, '岭上开花');
export const HaiteiRaoyue = flagYaku(1 << 8, '海底捞月');
export const HouteiRaoyui = flagYaku(1 << 9, '河底摸鱼');
export const Riichi = flagYaku(1 << 14, '立直', true);
export const DoubleRiichi = flagYaku(1 << 15, '双立直', true);
export const Ippatsu = flagYaku(1 << 16, '一发', true);

export const YAKUMAN_LIST: Yaku[] = [
  new Daisangen(), new Suuankou(), new SuuankouTanki(), new Shousuushi(),
  new Daisuushi(), new Tsuuiisou(), new Ryuuiisou(), new Chinroutou(),
  new ChuurenPoutou(), new JunseiChuurenPoutou(), new Suukantsu(), new Tenhou(), new Chiihou(),
];

export const YAKU_LIST: Yaku[] = [
  new MenzenTsumo(), new TanYao(),
  new (yakuhaiField(1, 1, '场风牌 - 东'))(), new (yakuhaiField(1 << 1, 2, '场风牌 - 南'))(),
  new (yakuhaiField(1 << 2, 3, '场风牌 - 西'))(), new (yakuhaiField(1 << 3, 4, '场风牌 - 北'))(),
  new (yakuhaiField(1 << 4, 1, '自风牌 - 东'))(), new (yakuhaiField(1 << 5, 2, '自风牌 - 南'))(),
  new (yakuhaiField(1 << 6, 3, '自风牌 - 西'))(), new (yakuhaiField(1 << 7, 4, '自风牌 - 北'))(),
  new YakuhaiHako(), new YakuhaiHatsu(), new YakuhaiCyuu(),
  new ChanKan(), new RinshanKaihou(), new HaiteiRaoyue(), new HouteiRaoyui(),
  new Riichi(), new Iipeikou(), new Pinfu(), new Ippatsu(),
  new Dora(), new Ura(), new AkaDora(),
  new Toitoi(), new Sanankou(), new SanshokuDoukou(), new Sankantsu(),
  new Shousangen(), new Honroutou(), new DoubleRiichi(),
  new SanshokuDoujun(), new Ikkitsuukan(), new Chantaiyao(),
  new Honiisou(), new Junchantaiyao(), new Ryanpeikou(), new Chiniisou(),
];
