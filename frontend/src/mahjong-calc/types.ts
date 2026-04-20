export const NOMI = 0;
export const FIELD_EAST = 1 << 0;
export const FIELD_SOUTH = 1 << 1;
export const FIELD_WEST = 1 << 2;
export const FIELD_NORTH = 1 << 3;
export const SEAT_EAST = 1 << 4;
export const SEAT_SOUTH = 1 << 5;
export const SEAT_WEST = 1 << 6;
export const SEAT_NORTH = 1 << 7;
export const HAITEI_RAOYUE = 1 << 8;
export const HOUTEI_RAOYUI = 1 << 9;
export const TENHOU = 1 << 10;
export const CHIIHOU = 1 << 11;
export const RINNSHANN_KAIHOU = 1 << 12;
export const CHANKAN = 1 << 13;
export const RIICHI = 1 << 14;
export const DOUBLE_RIICHI = 1 << 15;
export const IPPATSU = 1 << 16;
export const TSUMO = 1 << 17;
export const RON = 1 << 18;
export const MENZEN = 1 << 19;

export enum BlockType { SEQ, TRI, QUAD }
export enum PositionType { EAST, SOUTH, WEST, NORTH, EMPTY }
export enum MachiType { LIANG_MIAN, KAN_ZHANG, BIAN_ZHANG, SHUANG_PENG, DAN_QI }
export enum PointType {
  TSUMO = 0, RON = 1, OYA = 0, KO = 2,
  OYATSUMO = 0, OYARON = 1, KOTSUMO = 2, KORON = 3,
}
export enum ManType { NOMANGAN, MANGAN, HANEMAN, BAIMAN, SANBAIMAN, KAZOEYAKUMAN }

export type PaiType = 'm' | 's' | 'p' | 'z';

export class Pai {
  type: PaiType;
  num: number;
  isAgari = false;
  redCnt = 0;

  constructor(type: PaiType, num: number) {
    this.type = type;
    this.num = num;
  }

  toString() { return this.type + this.num; }

  isYao() {
    if (this.type === 'z') return true;
    return this.num === 1 || this.num === 9;
  }

  isRyu() {
    if (this.type === 'z' && this.num === 6) return true;
    if (this.type === 's' && [2, 3, 4, 6, 8].includes(this.num)) return true;
    return false;
  }

  isYakuhai(flag: number): number {
    if (this.type !== 'z') return 0;
    let cnt = 0;
    switch (this.num) {
      case 1: if (test(flag, FIELD_EAST)) cnt++; if (test(flag, SEAT_EAST)) cnt++; break;
      case 2: if (test(flag, FIELD_SOUTH)) cnt++; if (test(flag, SEAT_SOUTH)) cnt++; break;
      case 3: if (test(flag, FIELD_WEST)) cnt++; if (test(flag, SEAT_WEST)) cnt++; break;
      case 4: if (test(flag, FIELD_NORTH)) cnt++; if (test(flag, SEAT_NORTH)) cnt++; break;
      case 5: cnt++; break;
      case 6: cnt++; break;
      case 7: cnt++; break;
    }
    return cnt;
  }

  next(): Pai {
    const b = new Pai(this.type, this.num);
    b.num++;
    if (b.type === 'z') {
      if (b.num === 5) b.num = 1;
      if (b.num === 8) b.num = 5;
    } else {
      if (b.num === 10) b.num = 1;
    }
    return b;
  }

  equalTo(other: Pai) {
    return this.type === other.type && this.num === other.num;
  }
}

export class Block {
  bType: BlockType;
  pType: PaiType;
  num: number;
  isOpen: boolean;
  redCnt = 0;

  constructor(bType: BlockType, pType: PaiType, num: number, isOpen: boolean) {
    this.bType = bType;
    this.pType = pType;
    this.num = num;
    this.isOpen = isOpen;
  }

  consistYao() {
    if (this.pType === 'z') return true;
    if (this.bType === BlockType.SEQ) {
      return this.num === 1 || this.num === 7;
    }
    return this.num === 1 || this.num === 9;
  }

  consistYakuhai(flag: number): number {
    if (this.pType !== 'z') return 0;
    let cnt = 0;
    switch (this.num) {
      case 1: if (test(flag, FIELD_EAST)) cnt++; if (test(flag, SEAT_EAST)) cnt++; break;
      case 2: if (test(flag, FIELD_SOUTH)) cnt++; if (test(flag, SEAT_SOUTH)) cnt++; break;
      case 3: if (test(flag, FIELD_WEST)) cnt++; if (test(flag, SEAT_WEST)) cnt++; break;
      case 4: if (test(flag, FIELD_NORTH)) cnt++; if (test(flag, SEAT_NORTH)) cnt++; break;
      case 5: cnt++; break;
      case 6: cnt++; break;
      case 7: cnt++; break;
    }
    return cnt;
  }

  getPai(): Pai[] {
    const rt: Pai[] = [];
    switch (this.bType) {
      case BlockType.SEQ:
        for (let i = this.num; i < this.num + 3; i++) rt.push(new Pai(this.pType, i));
        break;
      case BlockType.TRI:
        for (let i = 0; i < 3; i++) rt.push(new Pai(this.pType, this.num));
        break;
      case BlockType.QUAD:
        for (let i = 0; i < 4; i++) rt.push(new Pai(this.pType, this.num));
        break;
    }
    return rt;
  }

  equalTo(other: Block) {
    return this.bType === other.bType && this.pType === other.pType && this.num === other.num;
  }
}

export class Pair {
  type: PaiType;
  num: number;

  constructor(type: PaiType, num: number) {
    this.type = type;
    this.num = num;
  }

  getPai(): Pai[] {
    return [new Pai(this.type, this.num), new Pai(this.type, this.num)];
  }

  consistYao() {
    return this.getPai()[0].isYao();
  }
}

export class HandSet {
  blocks: Block[];
  pair: Pair;
  dora: Pai[];
  ura: Pai[];
  type: MachiType;
  flag: number;
  agariPai: Pai;
  redCnt: number;

  constructor(blocks: Block[], pair: Pair, dora: Pai[], ura: Pai[], type: MachiType, flag: number, agariPai: Pai, redCnt: number) {
    this.blocks = blocks;
    this.pair = pair;
    this.dora = dora;
    this.ura = ura;
    this.type = type;
    this.flag = flag;
    this.agariPai = agariPai;
    this.redCnt = redCnt;
  }
}

export class State {
  flag: number;
  furu: Block[];
  pais: Pai[];
  dora: Pai[];
  ura: Pai[];
  agariPai: Pai;
  redCnt: number;

  constructor(field: PositionType, seat: PositionType, yakus: number[], agariWay: number,
    pais: Pai[], furu: Block[], d: Pai[], u: Pai[], agariPai: Pai, redCnt: number) {
    this.flag = 0;
    if (field !== PositionType.EMPTY) this.flag |= (1 << field);
    if (seat !== PositionType.EMPTY) this.flag |= (1 << (seat + 4));
    for (const yaku of yakus) this.flag |= yaku;
    this.flag |= agariWay;

    this.furu = furu;
    let menzen = true;
    for (const b of furu) {
      if (b.isOpen) { menzen = false; break; }
    }
    if (menzen) this.flag |= MENZEN;

    this.pais = pais;
    this.dora = d;
    this.ura = u;
    this.agariPai = agariPai;
    this.agariPai.isAgari = true;
    this.redCnt = redCnt;
  }
}

export function test(flag: number, value: number): boolean {
  return (flag & value) === value;
}

export function pType2Int(pType: string): number {
  if (pType === 's') return 0;
  if (pType === 'p') return 1;
  if (pType === 'm') return 2;
  if (pType === 'z') return 3;
  return -1;
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min))) + Math.ceil(min);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function choose<T>(arr: T[]): T {
  return arr[randInt(0, arr.length)];
}
