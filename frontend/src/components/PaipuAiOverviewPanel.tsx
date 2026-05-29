import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';
import type { Game } from '@/types';
import { getGameAiAnalysis } from '@/api/games';
import { buildMajsoulAccountBindings } from '@/paipu/paipuDetailModel';
import { buildPaipuReplayModel } from '@/paipu/paipuReplayModel';
import { extractPaipuActions } from '@/paipu/paipuDetailModel';
import type { AiAnalysisFull } from '@/paipu/aiAnalysis';
import { PaipuAiMatchScoresTable } from '@/components/PaipuAiPanel';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';

type Props = {
  game: Game;
};

export function canShowPaipuAiOverview(game: Game | null): boolean {
  if (!game || game.game_type !== 'online') return false;
  if (game.paipu_has_actions === true) return true;
  const pd = game.paipu_data as Record<string, unknown> | undefined;
  return extractPaipuActions(pd).length > 0;
}

export function PaipuAiOverviewPanel({ game }: Props) {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<AiAnalysisFull | null>(null);
  const [status, setStatus] = useState<string>('loading');
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  const seatPlayers = useMemo(() => {
    const bindings = buildMajsoulAccountBindings(game.players);
    const base = buildPaipuReplayModel((game.paipu_data as Record<string, unknown> | undefined) ?? {}, {
      accountBindings: bindings,
    }).seatPlayers;
    return base.map((sp, seat) => {
      const gp = game.players.find((p) => p.seat_number === seat);
      const avatar = gp ? avatars[gp.player.id] : undefined;
      return { ...sp, avatar: avatar || sp.avatar };
    });
  }, [game.paipu_data, game.players, avatars]);

  useEffect(() => {
    let cancelled = false;
    const ids = game.players.map((p) => p.player.id);
    loadPlayerAvatarsForList(ids).then((map) => {
      if (!cancelled) setAvatars(map);
    });
    return () => {
      cancelled = true;
    };
  }, [game.players]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getGameAiAnalysis(game.id)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.status);
        setAnalysis(res.analysis ?? null);
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  const kyokuCount = Math.max(0, ...(analysis?.players.map((p) => p.kyoku.length) ?? [0]));

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: '1px solid rgba(99, 102, 241, 0.35)',
        background: 'linear-gradient(180deg, rgba(238, 242, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%)',
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'rgba(99, 102, 241, 0.2)' }}
      >
        <Brain size={18} style={{ color: '#4f46e5' }} />
        <span className="text-sm font-semibold" style={{ color: '#312e81' }}>
          {t('paipuAi.tabMatchScores')}
        </span>
      </div>

      <div className="p-4 min-w-0">
        {status === 'loading' ? (
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            {t('paipuAi.loading')}
          </p>
        ) : status !== 'done' || !analysis ? (
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            {t('paipuAi.notReady', { status })}
          </p>
        ) : (
          <PaipuAiMatchScoresTable
            analysis={analysis}
            highlightSeat={-1}
            kyokuCount={kyokuCount}
            seatPlayers={seatPlayers}
          />
        )}
      </div>
    </div>
  );
}
