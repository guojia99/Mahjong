import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';
import type { Game } from '@/types';
import { getGameAiAnalysis } from '@/api/games';
import { buildMajsoulAccountBindings } from '@/paipu/paipuDetailModel';
import { buildPaipuReplayModel } from '@/paipu/paipuReplayModel';
import { extractPaipuActions } from '@/paipu/paipuDetailModel';
import { modelDisplayLabel, type AiAnalysisFull, type AiModelInfo } from '@/paipu/aiAnalysis';
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
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [modelKey, setModelKey] = useState('');
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
        const list = res.models ?? [];
        setModels(list);
        const key = res.model_key ?? list[0]?.key ?? '';
        setModelKey(key);
        setAnalysis(res.analysis ?? (key ? res.analyses?.[key] : undefined) ?? null);
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  useEffect(() => {
    if (!modelKey) return;
    let cancelled = false;
    getGameAiAnalysis(game.id, { model: modelKey })
      .then((res) => {
        if (cancelled) return;
        if (res.analysis) setAnalysis(res.analysis);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [game.id, modelKey]);

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
        {models.length > 1 && (
          <label className="text-xs block mb-3" style={{ color: 'var(--color-text-light)' }}>
            {t('paipuAi.model')}
            <select
              className="mt-1 w-full text-xs rounded border px-2 py-1"
              value={modelKey}
              onChange={(e) => setModelKey(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.key} value={m.key}>
                  {modelDisplayLabel(m)}
                </option>
              ))}
            </select>
          </label>
        )}
        {status === 'loading' ? (
          <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
            {t('paipuAi.loading')}
          </p>
        ) : !analysis ? (
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
