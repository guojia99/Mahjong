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
    avatar: string;
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

export interface Game {
    id: string;
    room?: { id: string; name: string } | null;
    game_type: 'offline' | 'online';
    game_mode: 'east_wind' | 'half_match';
    player_count: number;
    start_time: string;
    source_url: string;
    paipu_data?: Record<string, unknown>;
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

export const TILE_ORDER = [
    '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
    '0m',
    '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
    '0p',
    '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
    '0s',
    '1z', '2z', '3z', '4z', '5z', '6z', '7z',
];
