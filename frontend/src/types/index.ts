export interface User {
    id: number;
    username: string;
    created_at: string;
    is_admin: boolean;
}

export interface Player {
    id: string;
    nickname: string;
    real_name: string;
    avatar?: string;
    extra_info: Record<string, unknown>;
    majsoul_uids?: number[];
    majsoul_accounts?: MajsoulAccount[];
    created_at: string;
    updated_at?: string;
}

export interface MajsoulAccount {
    id: string;
    uid: number;
    nickname: string;
    player: string | null;
    created_at: string;
}

export interface Room {
    id: string;
    name: string;
    location: string;
    room_type: 'offline' | 'online';
    session_time: string | null;
    status: 'open' | 'closed';
    player_count: number;
    game_count: number;
    room_players?: RoomPlayer[];
    created_at: string;
    closed_at: string | null;
    earliest_game_time: string | null;
    latest_game_time: string | null;
}

export interface RoomPlayer {
    id: string;
    player: Player;
    joined_at: string;
}

export interface AiAnalysisSummary {
    status: string;
    has_ai_analysis: boolean;
    analyzed_at?: string | null;
    model_tag?: string;
    players?: {
        seat: number;
        match_avg: number;
        match_grade: string;
        kyoku: { kyoku_index: number; avg: number; grade: string }[];
    }[];
}

export interface Game {
    id: string;
    room?: { id: string; name: string } | null;
    game_type: 'offline' | 'online';
    game_mode: 'east_wind' | 'half_match';
    player_count: number;
    start_time: string;
    end_time: string | null;
    source_url: string;
    /** 是否为联赛对局（后端 LeagueMatch 关联） */
    is_league_game?: boolean;
    league_series_name?: string | null;
    league_season_name?: string | null;
    league_stage_name?: string | null;
    /** 联赛系列 Logo 绝对 URL，用作详情页背景等 */
    league_logo_url?: string | null;
    /** 仅对局详情接口返回；列表接口为减轻体积不返回，请用 has_paipu_data / paipu_has_actions */
    paipu_data?: Record<string, unknown>;
    /** 列表接口：是否保存了非空 paipu_data（牌谱相关信息） */
    has_paipu_data?: boolean;
    /** 列表接口：牌谱 JSON 是否含可解析的 actions（顶层或 majsoul_record_detail 内） */
    paipu_has_actions?: boolean;
    /** AI 分析摘要（列表/详情） */
    ai_analysis?: AiAnalysisSummary;
    players: GamePlayerInfo[];
    is_scored: boolean;
    created_at: string;
    created_by?: number;
    hand_records?: HandRecord[];
    pt?: Record<string, number>;
}

export interface GamePlayerInfo {
    player: Player;
    seat_number: number;
    score: number | null;
    is_dealer_start: boolean;
}

export interface GameScore {
    player_id: string;
    score: number;
    is_dealer_start: boolean;
    seat_number: number;
}

export interface HandRecord {
    id: string;
    player: Player;
    record_type: 'yakuman' | 'yakuman_confirmed' | 'yakuman_chance';
    yakuman_names: string[];
    hand_tiles: string[];
    melds: MeldInfo[];
    winning_tile: string;
    win_type: 'tsumo' | 'ron';
    created_at: string;
    game_info?: {
        game_id: string;
        room_id: string | null;
        room_name: string | null;
        game_mode: string;
        start_time: string;
    };
}

export interface MeldInfo {
    tiles: { tile: string; orientation: 'h' | 'v' }[];
    type: 'chi' | 'pon' | 'kan';
}

export interface PlayerStatsRecentPoint {
    game_id: string;
    start_time: string;
    rank: number;
    pt: number;
    score: number;
    game_index?: number;
    cumulative_pt?: number;
    /** 该局人数（3/4），用于区分三麻/四麻 */
    player_count?: number;
    game_mode?: string;
    game_type?: string;
}

export interface PlayerStats {
    total_games: number;
    total_pt: number;
    rank_distribution: Record<string, number>;
    recent_ranking: PlayerStatsRecentPoint[];
    recent_series?: PlayerStatsRecentPoint[];
}

export interface PtRankingItem {
    player: Player;
    total_pt: number;
    game_count: number;
}

export interface RankTier {
    id: string;
    name: string;
    level_order: number;
    initial_score: number;
    promotion_score: number;
    dajiang_score: number;
    fourth_penalty: number;
    is_protected: boolean;
    bg_color: string;
    bg_gradient: string;
    description: string;
}

export interface UmaConfig {
    id: string;
    name: string;
    player_count: number;
    game_mode: string;
    uma_1st: number;
    uma_2nd: number;
    uma_3rd: number;
    uma_4th: number;
    base_score: number;
    is_active: boolean;
}

export interface PlayerRankingScore {
    id: string;
    player: Player;
    tier: RankTier | null;
    score: number;
    game_count: number;
    updated_at: string;
    next_tier: {
        name: string;
        level_order: number;
        threshold: number;
        needed: number;
        bg_color: string;
        bg_gradient: string;
    } | null;
}

export const SEAT_WIND_LABELS: Record<number, string> = {
    0: '东',
    1: '南',
    2: '西',
    3: '北',
};

export const GAME_MODE_LABELS: Record<string, string> = {
    east_wind: '东风',
    half_match: '半庄',
};

export const GAME_MODE_FULL_LABELS: Record<string, string> = {
    east_wind: '东风局',
    half_match: '半庄',
};

export const GAME_TYPE_LABELS: Record<string, string> = {
    offline: '线下',
    online: '线上',
};

export const ROOM_STATUS_LABELS: Record<string, string> = {
    open: '进行中',
    closed: '已关闭',
};

export const ROOM_TYPE_LABELS: Record<string, string> = {
    offline: '线下场',
    online: '线上场',
};

export const PLAYER_COUNT_LABELS: Record<number, string> = {
    3: '三麻',
    4: '四麻',
};

export const HAND_RECORD_TYPE_LABELS: Record<string, string> = {
    yakuman: '役满',
    yakuman_confirmed: '役满确定',
    yakuman_chance: '役满机会',
};

export const WIN_TYPE_LABELS: Record<string, string> = {
    tsumo: '自摸',
    ron: '荣胡',
};

export const YAKUMAN_LIST = [
    '天和',
    '地和',
    '大三元',
    '大四喜',
    '小四喜',
    '字一色',
    '緑一色',
    '清老頭',

    '四暗刻',
    '四暗刻単騎',

    '国士无双',
    '国士無双十三面',

    '九蓮宝燈',
    '純正九蓮宝燈',

    '四槓子',
    '累积役满',

    '古役:人和',
    '古役:石上三年',
];

// ===== League Types =====
export type LeagueSeasonStatus = 'registration' | 'ongoing' | 'finished';
export type StageType =
    | 'swiss'
    | 'elimination_1'
    | 'elimination_2'
    | 'elimination_3'
    | 'revival'
    | 'semifinal'
    | 'final';
export type StageStatus = 'pending' | 'ongoing' | 'finished';
export type GroupType = 'winners' | 'losers' | 'none';

export interface LeagueSeries {
    id: string;
    name: string;
    cover: string | null;
    /** Logo 绝对 URL（存储于服务端 SQLite，路径含 UUID） */
    logo_url?: string | null;
    description: string;
    season_count: number;
    current_season_name: string | null;
    current_season_id: string | null;
    created_by: number;
    created_at: string;
    updated_at: string;
}

export interface LeagueSeason {
    id: string;
    series: string;
    series_name: string;
    season_number: number;
    name: string;
    cover: string | null;
    description?: string;
    status: LeagueSeasonStatus;
    is_current: boolean;
    is_locked: boolean;
    allow_online: boolean;
    allow_offline: boolean;
    start_time: string | null;
    end_time: string | null;
    player_count: number;
    stage_count: number;
    stages?: LeagueStage[];
    season_players?: LeagueSeasonPlayerItem[];
    created_at: string;
    updated_at: string;
}

export interface LeagueStage {
    id: string;
    season: string;
    name: string;
    stage_type: StageType;
    status: StageStatus;
    order: number;
    games_per_player: number;
    uma_1st: number;
    uma_2nd: number;
    uma_3rd: number;
    uma_4th: number;
    base_score: number;
    allow_companion: boolean;
    allow_free_table: boolean;
    record_ranking: boolean;
    has_groups: boolean;
    notes: string;
    promotion_rules: Record<string, unknown>;
    player_count: number;
    game_count: number;
    /** 淘汰赛第二、三阶段：第一阶段胜者组前四（保送第三阶段胜者组） */
    bypass_players?: Player[];
    created_at: string;
    updated_at: string;
}

export interface LeagueSeasonPlayerItem {
    id: string;
    season: string;
    player: Player;
    player_id?: string;
    seed_label: string;
    joined_at: string;
}

export interface LeagueStagePlayer {
    id: string;
    stage: string;
    player: Player;
    group_type: GroupType;
    is_eliminated: boolean;
    is_promoted: boolean;
    games_played: number;
    total_pt: number;
    rank_in_stage: number;
    is_full: boolean;
    games_per_player?: number;
    seed_label: string;
    created_at: string;
    updated_at: string;
}

export interface LeagueMatchScore {
    player_id: string;
    nickname: string;
    seat_number: number;
    score: number | null;
}

export interface LeagueMatch {
    id: string;
    stage: string;
    game: string | null;
    game_id: string | null;
    /** 关联对局开始时间，用于公开页按时间排序展示 */
    game_start_time?: string | null;
    match_label: string;
    round_index: number;
    table_index: number;
    scheduled_players: string[];
    companion_players: string[];
    players: Player[];
    companions: Player[];
    game_scores: LeagueMatchScore[];
    game_is_scored: boolean;
    created_at: string;
}

export const LEAGUE_SEASON_STATUS_LABELS: Record<LeagueSeasonStatus, string> = {
    registration: '报名中',
    ongoing: '进行中',
    finished: '已结束',
};

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
    swiss: '积分赛',
    elimination_1: '淘汰赛第一阶段',
    elimination_2: '淘汰赛第二阶段',
    elimination_3: '淘汰赛第三阶段',
    revival: '复活赛',
    semifinal: '半决赛',
    final: '决赛',
};

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
    pending: '未开始',
    ongoing: '进行中',
    finished: '已结束',
};

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
    winners: '胜者组',
    losers: '败者组',
    none: '无分组',
};

/** 标准赛段 i18n key（用于显示阶段名称） */
export const STAGE_TYPE_I18N_KEY: Record<StageType, string> = {
    swiss: 'league.stageType.swiss',
    elimination_1: 'league.stageType.elimination1',
    elimination_2: 'league.stageType.elimination2',
    elimination_3: 'league.stageType.elimination3',
    revival: 'league.stageType.revival',
    semifinal: 'league.stageType.semifinal',
    final: 'league.stageType.final',
};

export const TILE_ORDER = [
    '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
    '0m',
    '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
    '0p',
    '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
    '0s',
    '1z', '2z', '3z', '4z', '5z', '6z', '7z',
];
