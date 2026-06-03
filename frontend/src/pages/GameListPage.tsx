import { useMemo, useState } from 'react';
import { useAbortableEffect } from '@/hooks/useAbortableEffect';
import { isAbortError } from '@/utils/http';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getGamesList, type GamesListParams } from '@/api/games';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/Modal';
import { loadPlayerAvatarsForList } from '@/services/playerAvatarCache';
import { useSyncedSearchParams } from '@/hooks/useSyncedSearchParams';
import type { Game } from '@/types';
import { GAME_MODE_LABELS, GAME_TYPE_LABELS, PLAYER_COUNT_LABELS } from '@/types';
import { aiMatchForPlayer } from '@/paipu/aiAnalysis';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

function ScoreTag({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const tone = score > 0 ? 'score-tag-positive' : score < 0 ? 'score-tag-negative' : 'score-tag-zero';
  return <span className={`score-tag ${tone}`}>{score}</span>;
}

function PtTag({ pt }: { pt: number | undefined }) {
  if (pt === undefined || pt === null) return null;
  const val = Math.round(pt * 100) / 100;
  const tone = val > 0 ? 'pt-tag--pos' : val < 0 ? 'pt-tag--neg' : 'pt-tag--zero';
  return (
    <span className={`pt-tag ${tone}`}>
      {val > 0 ? `+${val}` : val}pt
    </span>
  );
}

function GamePlayerCell({
  rank,
  game,
  playerId,
  nickname,
  avatar,
  score,
  isDealer,
}: {
  rank: number;
  game: Game;
  playerId: string;
  nickname: string;
  avatar: string;
  score: number | null;
  isDealer: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-2 min-w-0 p-2.5 rounded-2xl border border-white/60"
      style={{
        background: 'linear-gradient(145deg, #fdfcfd 0%, #f5f0f7 100%)',
        boxShadow: '0 1px 3px rgba(120, 100, 140, 0.08)',
      }}
    >
      <span
        className="text-xs font-bold flex-shrink-0 w-4 text-center"
        style={{ color: rank === 1 ? '#f0b830' : 'var(--color-text-light)' }}
      >
        {rank}
      </span>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          loading="lazy"
          className="flex-shrink-0 rounded-full object-cover"
          style={{ width: '3rem', height: '3rem' }}
        />
      ) : (
        <div
          className="flex-shrink-0 rounded-full flex items-center justify-center text-sm font-bold"
          style={{
            width: '3rem',
            height: '3rem',
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary-dark)',
          }}
        >
          {nickname.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 flex-wrap text-sm min-w-0">
          <Link
            to={`/player-list/${playerId}`}
            className="font-medium truncate"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {nickname}
          </Link>
          {isDealer && (
            <span
              className="flex-shrink-0 font-extrabold"
              style={{
                fontSize: '0.5625rem',
                padding: '0.125rem 0.4rem',
                borderRadius: '9999px',
                background: 'linear-gradient(180deg, #fff4e0 0%, #ffe7c4 100%)',
                color: '#c97700',
                border: '1px solid rgba(230, 160, 40, 0.25)',
                boxShadow: '0 1px 1px rgba(200, 140, 0, 0.12)',
              }}
            >
{t('wind.east')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ScoreTag score={score} />
          <PtTag pt={game.pt?.[playerId]} />
          {(() => {
            const ai = aiMatchForPlayer(game, playerId);
            if (!ai) return null;
            return (
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(79, 70, 229, 0.12)', color: '#4338ca' }}
                title={t('gameList.aiScoreTitle')}
              >
                AI {ai.match_avg} ({ai.match_grade})
              </span>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const SELECT_STYLE: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.75rem',
  borderRadius: '0.5rem',
  border: '2px solid var(--color-border)',
  background: 'white',
  color: 'var(--color-text)',
  outline: 'none',
  cursor: 'pointer',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const DEFAULT_PLAYER_COUNT = '4';
const DEFAULT_MODE = 'half_match';
const DEFAULT_PAGE_SIZE = 20;

export default function GameListPage() {
  const { t } = useTranslation();
  const { patch, queryString, readInt, readFilterString } = useSyncedSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string>>({});
  const [paipuConfirmUrl, setPaipuConfirmUrl] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const { showToast, ToastComponent } = useToast();

  const page = readInt('page', 1);
  const pageSizeRaw = readFilterString('page_size', String(DEFAULT_PAGE_SIZE));
  const pageSizeNum = (PAGE_SIZE_OPTIONS as readonly number[]).includes(Number(pageSizeRaw))
    ? (Number(pageSizeRaw) as (typeof PAGE_SIZE_OPTIONS)[number])
    : DEFAULT_PAGE_SIZE;
  const playerCountFilter = readFilterString('player_count', DEFAULT_PLAYER_COUNT);
  const modeFilter = readFilterString('game_mode', DEFAULT_MODE);
  const typeFilter = readFilterString('game_type', '');
  const leagueFilter = readFilterString('league', '') as '' | '0' | '1';

  const listBackTo = `/games${queryString}`;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSizeNum) || 1);

  const playerIds = useMemo(
    () => [...new Set(games.flatMap((g) => g.players.map((p) => p.player.id)))],
    [games]
  );

  useAbortableEffect((signal) => {
    const params: GamesListParams = { page, page_size: pageSizeNum };
    if (playerCountFilter) params.player_count = playerCountFilter;
    if (modeFilter) params.game_mode = modeFilter;
    if (typeFilter) params.game_type = typeFilter;
    if (leagueFilter) params.league = leagueFilter;
    setListLoading(true);
    getGamesList(params, { signal })
      .then((res) => {
        setGames(res.results);
        setTotalCount(res.count);
        const maxPage = Math.max(1, Math.ceil(res.count / pageSizeNum) || 1);
        if (page > maxPage) patch({ page: String(maxPage) }, true);
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        showToast(t('gameList.loadFailed'));
      })
      .finally(() => {
        if (!signal.aborted) setListLoading(false);
      });
  }, [playerCountFilter, modeFilter, typeFilter, leagueFilter, page, pageSizeNum, showToast, t, patch]);

  useAbortableEffect((signal) => {
    if (playerIds.length === 0) {
      setPlayerAvatars({});
      return;
    }
    loadPlayerAvatarsForList(playerIds, { signal }).then(setPlayerAvatars).catch((e) => {
      if (!isAbortError(e)) throw e;
    });
  }, [playerIds]);

  const setFilterPage1 = (updates: Record<string, string | null | undefined>) => {
    patch({ ...updates, page: null });
  };

  const setPage = (next: number) => {
    patch({ page: next <= 1 ? null : String(next) });
  };

  const filterQueryPatch = (key: string, value: string, defaultWhenMissing: string) => {
    if (value === defaultWhenMissing) return { [key]: null as string | null };
    return { [key]: value };
  };

  return (
    <div>
      {ToastComponent}
      <Modal open={Boolean(paipuConfirmUrl)} onClose={() => setPaipuConfirmUrl(null)} title={t('gameList.openPaipuTitle')}>
        <p className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>
          {t('gameList.openPaipuWarn')}
        </p>
        {paipuConfirmUrl && (
          <p className="text-xs font-mono break-all mb-4 p-2 rounded-lg" style={{ background: '#f5f5f5', color: 'var(--color-text-light)' }}>
            {paipuConfirmUrl}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPaipuConfirmUrl(null)}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm inline-flex items-center gap-1"
            onClick={() => {
              if (paipuConfirmUrl) window.open(paipuConfirmUrl, '_blank', 'noopener,noreferrer');
              setPaipuConfirmUrl(null);
            }}
          >
            <ExternalLink size={14} /> {t('gameList.openPaipu')}
          </button>
        </div>
      </Modal>
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <select
          value={playerCountFilter}
          onChange={(e) => setFilterPage1(filterQueryPatch('player_count', e.target.value, DEFAULT_PLAYER_COUNT))}
          style={SELECT_STYLE}
        >
          <option value="">{t('gameList.allPlayerCount')}</option>
          <option value="4">{t('playerCount.yonma')}</option>
          <option value="3">{t('playerCount.sanma')}</option>
        </select>
        <select
          value={modeFilter}
          onChange={(e) => setFilterPage1(filterQueryPatch('game_mode', e.target.value, DEFAULT_MODE))}
          style={SELECT_STYLE}
        >
          <option value="">{t('gameList.allMode')}</option>
          <option value="east_wind">{t('gameMode.eastWind')}</option>
          <option value="half_match">{t('gameMode.halfMatch')}</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setFilterPage1({ game_type: e.target.value === '' ? '' : e.target.value })}
          style={SELECT_STYLE}
        >
          <option value="">{t('gameList.allType')}</option>
          <option value="offline">{t('gameType.offline')}</option>
          <option value="online">{t('gameType.online')}</option>
        </select>
        <select
          value={leagueFilter}
          onChange={(e) => setFilterPage1({ league: e.target.value === '' ? '' : e.target.value })}
          style={SELECT_STYLE}
        >
          <option value="">{t('gameList.leagueAll')}</option>
          <option value="1">{t('gameList.leagueOnly')}</option>
          <option value="0">{t('gameList.leagueExclude')}</option>
        </select>
        <select
          value={String(pageSizeNum)}
          onChange={(e) => {
            const n = e.target.value;
            setFilterPage1(filterQueryPatch('page_size', n, String(DEFAULT_PAGE_SIZE)));
          }}
          style={SELECT_STYLE}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {t('gameList.perPage', { n })}
            </option>
          ))}
        </select>
        <span className="text-sm self-center ml-auto" style={{ color: 'var(--color-text-light)' }}>
          {t('gameList.totalGames', { count: totalCount })}
        </span>
      </div>

      {listLoading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-light)' }}>
          {t('gameList.loading')}
        </p>
      ) : totalCount === 0 ? (
        <div className="empty-state card">
          <p className="text-sm">{t('gameList.noGames')}</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 gap-3">
          {games.map((game) => {
            const ranked = [...game.players].sort((a, b) => (b.score || 0) - (a.score || 0));
            const detailPath = game.room ? `/rooms/${game.room.id}/games/${game.id}` : `/games/${game.id}`;
            return (
              <div
                key={game.id}
                className="card p-4 rounded-2xl"
                style={{
                  border: '1px solid rgba(200, 180, 220, 0.35)',
                  boxShadow: '0 2px 12px rgba(100, 80, 120, 0.06)',
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${game.player_count === 3 ? 'badge-sanma' : 'badge-yonma'}`}>
                      {PLAYER_COUNT_LABELS[game.player_count] || `${game.player_count}`}
                    </span>
                    <span className="badge badge-mode">{GAME_MODE_LABELS[game.game_mode]}</span>
                    <span className={`badge badge-${game.game_type}`}>{GAME_TYPE_LABELS[game.game_type]}</span>
                    {game.is_league_game && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                          color: '#c2410c',
                          border: '1px solid rgba(251, 146, 60, 0.35)',
                        }}
                      >
                        {t('gameList.leagueBadge')}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--color-text-light)' }}>{game.start_time}{game.end_time ? ` ~ ${game.end_time}` : ''}</span>
                    {game.game_type === 'online' && Boolean(game.source_url?.trim()) && (
                      <button
                        type="button"
                        className="text-xs font-medium underline-offset-2 hover:underline"
                        style={{ color: 'var(--color-secondary-dark)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => setPaipuConfirmUrl(game.source_url.trim())}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          <ExternalLink size={12} /> {t('gameList.paipu')}
                        </span>
                      </button>
                    )}
                  </div>
                <div className="flex flex-wrap items-center justify-end gap-2 min-w-0 shrink">
                  <Link
                    to={detailPath}
                    state={{ backTo: listBackTo }}
                    className="btn btn-sm btn-primary min-w-0 max-w-full text-center"
                    style={{
                      textDecoration: 'none',
                      fontSize: 'clamp(0.65rem, 0.45rem + 0.9vw, 0.8125rem)',
                      lineHeight: 1.25,
                      paddingInline: '0.5rem',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                    }}
                  >
                    {t('gameList.viewDetail')}
                  </Link>
                  {game.room && (
                    <Link
                      to={`/rooms/${game.room.id}`}
                      className="btn btn-sm btn-outline text-xs"
                      style={{ textDecoration: 'none' }}
                    >
                      {game.room.name}
                    </Link>
                  )}
                </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ranked.map((gp, idx) => {
                    const pid = gp.player.id;
                    return (
                      <GamePlayerCell
                        key={pid}
                        rank={idx + 1}
                        game={game}
                        playerId={pid}
                        nickname={gp.player.nickname}
                        avatar={playerAvatars[pid] ?? ''}
                        score={gp.score}
                        isDealer={gp.is_dealer_start}
                      />
                    );
                  })}
                </div>
                {game.hand_records && game.hand_records.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {game.hand_records.map((hr) => (
                      <span key={hr.id} className="badge" style={{ background: '#fff8e1', color: '#e65100', fontSize: '0.625rem', padding: '0.125rem 0.5rem' }}>
                        {hr.player.nickname}: {(hr.yakuman_names || []).join(' + ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button
              type="button"
              className="btn btn-sm btn-outline inline-flex items-center gap-1"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              <ChevronLeft size={16} /> {t('gameList.pagePrev')}
            </button>
            <span className="text-sm" style={{ color: 'var(--color-text-light)' }}>
              {t('gameList.pageInfo', { page, totalPages })}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline inline-flex items-center gap-1"
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
            >
              {t('gameList.pageNext')} <ChevronRight size={16} />
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
