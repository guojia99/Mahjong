import type { CSSProperties, ReactNode } from 'react';
import Modal from '@/components/Modal';
import { useTranslation } from 'react-i18next';

function SecTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-bold mt-5 mb-2 first:mt-0" style={{ color: '#9b3aae' }}>
      {children}
    </h3>
  );
}

function P({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <p className={`text-xs leading-relaxed mb-2 ${className ?? ''}`} style={{ color: 'var(--color-text-light)', ...style }}>
      {children}
    </p>
  );
}

function WeightTableHeaded({
  colItem,
  colPts,
  rows,
}: {
  colItem: string;
  colPts: string;
  rows: { label: string; pts: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: '#fdf2ff' }}>
            <th className="text-left font-semibold py-2 px-2">{colItem}</th>
            <th className="text-right font-semibold py-2 px-2 tabular-nums">{colPts}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1.5 px-2 border-t align-top" style={{ borderColor: 'var(--color-border)' }}>
                {r.label}
              </td>
              <td className="py-1.5 px-2 border-t text-right font-semibold tabular-nums whitespace-nowrap" style={{ borderColor: 'var(--color-border)', color: '#c45cdd' }}>
                {r.pts}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function StartingHandsWeightsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const colItem = t('startingHands.weightsModal.colItem');
  const colPts = t('startingHands.weightsModal.colPts');

  const shapeRows = [
    { label: t('startingHands.weightsModal.shapeSeq'), pts: '+10' },
    { label: t('startingHands.weightsModal.shapeTriplet'), pts: '+12' },
    { label: t('startingHands.weightsModal.shapePair'), pts: '+4' },
    { label: t('startingHands.weightsModal.shapeTaatsuGood'), pts: '+5' },
    { label: t('startingHands.weightsModal.shapeTaatsuNorm'), pts: '+4' },
    { label: t('startingHands.weightsModal.shapeTaatsuEdge'), pts: '+2' },
    { label: t('startingHands.weightsModal.shapeKanchan'), pts: '+2' },
  ];

  const honorRows = [
    { label: t('startingHands.weightsModal.honorTriplet'), pts: '+10' },
    { label: t('startingHands.weightsModal.honorTripletYaku'), pts: '+14' },
    { label: t('startingHands.weightsModal.honorPair'), pts: '+3' },
    { label: t('startingHands.weightsModal.honorPairYaku'), pts: '+8' },
  ];

  const shantenRows = [
    { label: t('startingHands.weightsModal.shantenBase'), pts: '(8 − shanten) × 4' },
    { label: t('startingHands.weightsModal.shantenTenpai'), pts: '+1.5' },
  ];

  const per = t('startingHands.weightsModal.perTile');
  const doraRows = [
    { label: t('startingHands.weightsModal.doraTile'), pts: `+7 ${per}` },
    { label: t('startingHands.weightsModal.doraAdjacent'), pts: `+1.5 ${per}` },
    { label: t('startingHands.weightsModal.redFive'), pts: `+5 ${per}` },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('startingHands.weightsModal.title')} wide>
      <P>{t('startingHands.weightsModal.intro')}</P>
      <P>{t('startingHands.weightsModal.formula')}</P>

      <SecTitle>{t('startingHands.weightsModal.secShape')}</SecTitle>
      <P>{t('startingHands.weightsModal.shapeNote')}</P>
      <WeightTableHeaded colItem={colItem} colPts={colPts} rows={shapeRows} />

      <SecTitle>{t('startingHands.weightsModal.secHonor')}</SecTitle>
      <P>{t('startingHands.weightsModal.honorNote')}</P>
      <WeightTableHeaded colItem={colItem} colPts={colPts} rows={honorRows} />

      <SecTitle>{t('startingHands.weightsModal.secShanten')}</SecTitle>
      <P>{t('startingHands.weightsModal.shantenNote')}</P>
      <WeightTableHeaded colItem={colItem} colPts={colPts} rows={shantenRows} />

      <SecTitle>{t('startingHands.weightsModal.secDora')}</SecTitle>
      <P>{t('startingHands.weightsModal.doraNote')}</P>
      <WeightTableHeaded colItem={colItem} colPts={colPts} rows={doraRows} />

      <SecTitle>{t('startingHands.weightsModal.secYaku')}</SecTitle>
      <P>{t('startingHands.weightsModal.yakuIntro')}</P>
      <ul className="list-disc pl-4 space-y-1.5 text-xs" style={{ color: 'var(--color-text-light)' }}>
        <li>{t('startingHands.weightsModal.yakuTanyao')}</li>
        <li>{t('startingHands.weightsModal.yakuChiitoitsu')}</li>
        <li>{t('startingHands.weightsModal.yakuIttsuu')}</li>
        <li>{t('startingHands.weightsModal.yakuSanshokuDoujun')}</li>
        <li>{t('startingHands.weightsModal.yakuSanshokuDoukou')}</li>
        <li>{t('startingHands.weightsModal.yakuSanankou')}</li>
        <li>{t('startingHands.weightsModal.yakuToitoi')}</li>
        <li>{t('startingHands.weightsModal.yakuChinitsuHonitsu')}</li>
        <li>{t('startingHands.weightsModal.yakuJunchanChanta')}</li>
        <li>{t('startingHands.weightsModal.yakuHonroutou')}</li>
      </ul>
    </Modal>
  );
}
