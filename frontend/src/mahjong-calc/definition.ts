import { PointType, ManType } from './types';

export class Rule {
  shiDuan = 1;
  duoBeiYiMan = 1;
  fuHeYiMan = 1;
  lianFeng4 = 1;
  allowLeiMan = 1;
}

export class Result {
  han = 0;
  /** 不含宝牌・里宝牌・赤宝牌番；为 0 时视为无役，点数为 0 */
  hanRealYaku = 0;
  fu = 0;
  fuMessages: string[] = [];
  point1 = 0;
  point2 = 0;
  pointType: PointType = PointType.OYATSUMO;
  yaku: string[] = [];
  isYakuman = false;
  manType: ManType = ManType.NOMANGAN;
}

export const MAN_TYPE_NAMES: Record<ManType, string> = {
  [ManType.NOMANGAN]: '',
  [ManType.MANGAN]: '满贯',
  [ManType.HANEMAN]: '跳满',
  [ManType.BAIMAN]: '倍满',
  [ManType.SANBAIMAN]: '三倍满',
  [ManType.KAZOEYAKUMAN]: '累计役满',
};

export const POINT_TYPE_NAMES: Record<number, string> = {
  [PointType.OYATSUMO]: '亲家自摸',
  [PointType.OYARON]: '亲家荣和',
  [PointType.KOTSUMO]: '子家自摸',
  [PointType.KORON]: '子家荣和',
};
