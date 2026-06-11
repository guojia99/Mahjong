package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID                 uint64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Username           string     `gorm:"size:150;uniqueIndex;not null" json:"username"`
	FirstName          string     `gorm:"column:first_name;size:150;not null;default:''" json:"-"`
	LastName           string     `gorm:"column:last_name;size:150;not null;default:''" json:"-"`
	DateJoined         time.Time  `gorm:"column:date_joined;not null;autoCreateTime" json:"-"`
	Password           string     `gorm:"size:128;not null;default:''" json:"-"`
	SystemPassword     string     `gorm:"column:system_password;size:36;default:''" json:"-"`
	IsStaff            bool       `gorm:"column:is_staff;default:false" json:"is_admin"`
	IsActive           bool       `gorm:"column:is_active;default:true" json:"is_active"`
	Superuser          bool       `gorm:"column:is_superuser;default:false" json:"-"`
	Email              string     `gorm:"column:email;size:254;default:''" json:"email"`
	PlayerID           *string    `gorm:"column:player_id;size:36;uniqueIndex" json:"player_id,omitempty"`
	LoginFailCount     int        `gorm:"column:login_fail_count;default:0" json:"login_fail_count"`
	LastLoginAttemptAt *time.Time `gorm:"column:last_login_attempt_at" json:"last_login_attempt_at,omitempty"`
	LastLoginIP        string     `gorm:"column:last_login_ip;size:45;default:''" json:"last_login_ip"`
	LockedUntil        *time.Time `gorm:"column:locked_until" json:"locked_until,omitempty"`
	CreatedAt          time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt          time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"-"`
}

func (User) TableName() string { return "users" }

// HasPassword reports whether the user has a regular password set.
func (u *User) HasPassword() bool {
	return u.Password != ""
}

const (
	VerificationPurposeBindEmail    = "bind_email"
	VerificationPurposeChangeEmail  = "change_email"
	VerificationPurposeResetPassword = "reset_password"
)

type VerificationCode struct {
	ID        uint64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID    uint64     `gorm:"column:user_id;not null;index" json:"user_id"`
	Purpose   string     `gorm:"size:30;not null;index" json:"purpose"`
	Code      string     `gorm:"size:6;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"column:expires_at;not null" json:"expires_at"`
	UsedAt    *time.Time `gorm:"column:used_at" json:"used_at,omitempty"`
	CreatedAt time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (VerificationCode) TableName() string { return "verification_codes" }

const (
	LoginActionSuccess       = "login_success"
	LoginActionFail          = "login_fail"
	LoginActionLogout        = "logout"
	LoginActionPasswordReset = "password_reset"
)

type LoginLog struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID    *uint64   `gorm:"column:user_id;index" json:"user_id,omitempty"`
	PlayerID  *string   `gorm:"column:player_id;size:36;index" json:"player_id,omitempty"`
	Username  string    `gorm:"size:150;not null;index" json:"username"`
	IP        string    `gorm:"size:45;default:''" json:"ip"`
	Action    string    `gorm:"size:30;not null;index" json:"action"`
	Detail    string    `gorm:"size:500;default:''" json:"detail"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime;index" json:"created_at"`
}

func (LoginLog) TableName() string { return "login_logs" }

type Player struct {
	ID         string    `gorm:"primaryKey;size:36" json:"id"`
	Nickname   string    `gorm:"size:50;not null" json:"nickname"`
	RealName   string    `gorm:"column:real_name;size:50;default:''" json:"real_name"`
	Avatar     string    `gorm:"type:text;default:''" json:"avatar"`
	ExtraInfo  JSONField `gorm:"column:extra_info;type:text;default:'{}'" json:"extra_info"`
	CreatedByID *uint64  `gorm:"column:created_by_id" json:"-"`
	CreatedBy  *User     `gorm:"foreignKey:CreatedByID" json:"-"`
	CreatedAt  time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt  time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`

	MajsoulAccounts []MahjongSoulAccount `gorm:"foreignKey:PlayerID" json:"majsoul_accounts,omitempty"`
}

func (Player) TableName() string { return "players" }

type MahjongSoulAccount struct {
	ID        string   `gorm:"primaryKey;size:36" json:"id"`
	PlayerID  *string  `gorm:"column:player_id;size:36;index" json:"player"`
	Player    *Player  `gorm:"foreignKey:PlayerID" json:"-"`
	UID       int64    `gorm:"column:uid;uniqueIndex;not null" json:"uid"`
	Nickname  string   `gorm:"size:50;default:''" json:"nickname"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (MahjongSoulAccount) TableName() string { return "mahjong_soul_accounts" }

type Room struct {
	ID          string     `gorm:"primaryKey;size:36" json:"id"`
	Name        string     `gorm:"size:100;not null" json:"name"`
	Location    string     `gorm:"size:100;default:''" json:"location"`
	RoomType    string     `gorm:"column:room_type;size:20;default:'offline'" json:"room_type"`
	SessionTime *time.Time `gorm:"column:session_time" json:"session_time"`
	Status      string     `gorm:"size:20;default:'open'" json:"status"`
	CreatedByID *uint64    `gorm:"column:created_by_id" json:"-"`
	CreatedBy   *User      `gorm:"foreignKey:CreatedByID" json:"-"`
	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	ClosedAt    *time.Time `gorm:"column:closed_at" json:"closed_at"`

	RoomPlayers []RoomPlayer `gorm:"foreignKey:RoomID" json:"room_players,omitempty"`
	Games       []Game       `gorm:"foreignKey:RoomID" json:"games,omitempty"`
}

func (Room) TableName() string { return "rooms" }

type RoomPlayer struct {
	ID       string    `gorm:"primaryKey;size:36" json:"id"`
	RoomID   string    `gorm:"column:room_id;size:36;uniqueIndex:idx_room_player" json:"-"`
	PlayerID string    `gorm:"column:player_id;size:36;uniqueIndex:idx_room_player" json:"-"`
	Room     *Room     `gorm:"foreignKey:RoomID" json:"-"`
	Player   *Player   `gorm:"foreignKey:PlayerID" json:"-"`
	JoinedAt time.Time `gorm:"column:joined_at;autoCreateTime" json:"joined_at"`
}

func (RoomPlayer) TableName() string { return "room_players" }

type Game struct {
	ID          string    `gorm:"primaryKey;size:36" json:"id"`
	RoomID      *string   `gorm:"column:room_id;size:36;index" json:"-"`
	Room        *Room     `gorm:"foreignKey:RoomID" json:"room"`
	GameType    string    `gorm:"column:game_type;size:20;default:'offline'" json:"game_type"`
	GameMode    string    `gorm:"column:game_mode;size:20;default:'half_match'" json:"game_mode"`
	PlayerCount int       `gorm:"column:player_count;default:4" json:"player_count"`
	StartTime   time.Time `gorm:"column:start_time" json:"start_time"`
	EndTime     *time.Time `gorm:"column:end_time" json:"end_time"`
	SourceURL   string    `gorm:"column:source_url;size:500;default:''" json:"source_url"`
	PaipuData        JSONField  `gorm:"column:paipu_data;type:text;default:'{}'" json:"paipu_data"`
	AiAnalysisData   JSONField  `gorm:"column:ai_analysis_data;type:text;default:'{}'" json:"ai_analysis_data"`
	AiAnalyzedAt     *time.Time `gorm:"column:ai_analyzed_at" json:"ai_analyzed_at"`
	AiAnalysisStatus string     `gorm:"column:ai_analysis_status;size:20;default:''" json:"ai_analysis_status"`
	AiAnalysisError  string     `gorm:"column:ai_analysis_error;size:500;default:''" json:"ai_analysis_error"`
	CreatedByID      *uint64    `gorm:"column:created_by_id" json:"-"`
	CreatedBy   *User     `gorm:"foreignKey:CreatedByID" json:"-"`
	CreatedAt   time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`

	GamePlayers []GamePlayer `gorm:"foreignKey:GameID" json:"-"`
	HandRecords []HandRecord `gorm:"foreignKey:GameID" json:"hand_records,omitempty"`
	LeagueMatch *LeagueMatch `gorm:"foreignKey:GameID" json:"-"`
}

func (Game) TableName() string { return "games" }

func (g *Game) BeforeCreate(tx *gorm.DB) error {
	defaultJSONField(&g.PaipuData)
	defaultJSONField(&g.AiAnalysisData)
	return nil
}

func (g *Game) IsScored() bool {
	for _, gp := range g.GamePlayers {
		if gp.Score != nil {
			return true
		}
	}
	return false
}

type GamePlayer struct {
	ID            string   `gorm:"primaryKey;size:36" json:"id"`
	GameID        string   `gorm:"column:game_id;size:36;uniqueIndex:idx_game_player" json:"-"`
	PlayerID      string   `gorm:"column:player_id;size:36;uniqueIndex:idx_game_player;uniqueIndex:idx_game_seat" json:"-"`
	Game          *Game    `gorm:"foreignKey:GameID" json:"-"`
	Player        *Player  `gorm:"foreignKey:PlayerID" json:"-"`
	SeatNumber    int      `gorm:"column:seat_number" json:"seat_number"`
	Score         *int     `gorm:"column:score" json:"score"`
	IsDealerStart bool     `gorm:"column:is_dealer_start;default:false" json:"is_dealer_start"`
}

func (GamePlayer) TableName() string { return "game_players" }

type HandRecord struct {
	ID           string    `gorm:"primaryKey;size:36" json:"id"`
	GameID       string    `gorm:"column:game_id;size:36;index" json:"-"`
	PlayerID     string    `gorm:"column:player_id;size:36;index" json:"-"`
	Game         *Game     `gorm:"foreignKey:GameID" json:"-"`
	Player       *Player   `gorm:"foreignKey:PlayerID" json:"-"`
	RecordType   string    `gorm:"column:record_type;size:30" json:"record_type"`
	YakumanNames JSONField `gorm:"column:yakuman_names;type:text" json:"yakuman_names"`
	HandTiles    JSONField `gorm:"column:hand_tiles;type:text" json:"hand_tiles"`
	Melds        JSONField `gorm:"column:melds;type:text" json:"melds"`
	WinningTile  string    `gorm:"column:winning_tile;size:10;default:''" json:"winning_tile"`
	WinType      string    `gorm:"column:win_type;size:10;default:'tsumo'" json:"win_type"`
	CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (HandRecord) TableName() string { return "hand_records" }

type UmaConfig struct {
	ID          string    `gorm:"primaryKey;size:36" json:"id"`
	Name        string    `gorm:"size:50;uniqueIndex;not null" json:"name"`
	PlayerCount int       `gorm:"column:player_count;default:4" json:"player_count"`
	GameMode    string    `gorm:"column:game_mode;size:20;default:'half_match'" json:"game_mode"`
	Uma1st      float64   `gorm:"column:uma_1st;default:30" json:"uma_1st"`
	Uma2nd      float64   `gorm:"column:uma_2nd;default:10" json:"uma_2nd"`
	Uma3rd      float64   `gorm:"column:uma_3rd;default:-10" json:"uma_3rd"`
	Uma4th      float64   `gorm:"column:uma_4th;default:-30" json:"uma_4th"`
	BaseScore   float64   `gorm:"column:base_score;default:250" json:"base_score"`
	IsActive    bool      `gorm:"column:is_active;default:true" json:"is_active"`
	CreatedAt   time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (UmaConfig) TableName() string { return "uma_configs" }

func (u *UmaConfig) GetUmaList() []float64 {
	if u.PlayerCount == 3 {
		return []float64{u.Uma1st, u.Uma2nd, u.Uma3rd}
	}
	return []float64{u.Uma1st, u.Uma2nd, u.Uma3rd, u.Uma4th}
}

type RankTier struct {
	ID             string    `gorm:"primaryKey;size:36" json:"id"`
	Name           string    `gorm:"size:50;uniqueIndex;not null" json:"name"`
	LevelOrder     int       `gorm:"column:level_order;uniqueIndex;not null" json:"level_order"`
	InitialScore   float64   `gorm:"column:initial_score;default:0" json:"initial_score"`
	PromotionScore float64   `gorm:"column:promotion_score;default:0" json:"promotion_score"`
	DajiangScore   float64   `gorm:"column:dajiang_score;default:10" json:"dajiang_score"`
	FourthPenalty  float64   `gorm:"column:fourth_penalty;default:0" json:"fourth_penalty"`
	IsProtected    bool      `gorm:"column:is_protected;default:false" json:"is_protected"`
	BgColor        string    `gorm:"column:bg_color;size:20;default:'#8e8e8e'" json:"bg_color"`
	BgGradient     string    `gorm:"column:bg_gradient;size:100;default:''" json:"bg_gradient"`
	Description    string    `gorm:"column:description;size:200;default:''" json:"description"`
	CreatedAt      time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (RankTier) TableName() string { return "rank_tiers" }

type PlayerRankingScore struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	PlayerID  string    `gorm:"column:player_id;size:36;uniqueIndex" json:"-"`
	Player    *Player   `gorm:"foreignKey:PlayerID" json:"-"`
	TierID    *string   `gorm:"column:tier_id;size:36;index" json:"-"`
	Tier      *RankTier `gorm:"foreignKey:TierID" json:"-"`
	Score     float64   `gorm:"column:score;default:0" json:"score"`
	GameCount int       `gorm:"column:game_count;default:0" json:"game_count"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (PlayerRankingScore) TableName() string { return "player_ranking_scores" }

type GameRankingResult struct {
	ID          string    `gorm:"primaryKey;size:36" json:"id"`
	GameID      string    `gorm:"column:game_id;size:36;uniqueIndex:idx_game_player_ranking" json:"-"`
	PlayerID    string    `gorm:"column:player_id;size:36;uniqueIndex:idx_game_player_ranking" json:"-"`
	Game        *Game     `gorm:"foreignKey:GameID" json:"-"`
	Player      *Player   `gorm:"foreignKey:PlayerID" json:"-"`
	Rank        int       `json:"rank"`
	Delta       float64   `json:"delta"`
	OldTierName string    `gorm:"column:old_tier_name;size:50" json:"old_tier_name"`
	NewTierName string    `gorm:"column:new_tier_name;size:50" json:"new_tier_name"`
	OldScore    float64   `gorm:"column:old_score" json:"old_score"`
	NewScore    float64   `gorm:"column:new_score" json:"new_score"`
	CreatedAt   time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (GameRankingResult) TableName() string { return "game_ranking_results" }

type LeagueImageAsset struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	MimeType  string    `gorm:"column:mime_type;size:100" json:"mime_type"`
	Data      []byte    `gorm:"column:data" json:"-"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (LeagueImageAsset) TableName() string { return "league_image_assets" }

type LeagueSeries struct {
	ID          string           `gorm:"primaryKey;size:36" json:"id"`
	Name        string           `gorm:"size:100;not null" json:"name"`
	Cover       string           `gorm:"column:cover;size:500" json:"cover"`
	LogoAssetID *string          `gorm:"column:logo_asset_id;size:36" json:"-"`
	LogoAsset   *LeagueImageAsset `gorm:"foreignKey:LogoAssetID" json:"-"`
	Description string           `gorm:"type:text;default:''" json:"description"`
	CreatedByID *uint64          `gorm:"column:created_by_id" json:"-"`
	CreatedBy   *User            `gorm:"foreignKey:CreatedByID" json:"-"`
	CreatedAt   time.Time        `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time        `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`

	Seasons []LeagueSeason `gorm:"foreignKey:SeriesID" json:"seasons,omitempty"`
}

func (LeagueSeries) TableName() string { return "league_series" }

type LeagueSeason struct {
	ID           string         `gorm:"primaryKey;size:36" json:"id"`
	SeriesID     string         `gorm:"column:series_id;size:36;uniqueIndex:idx_series_season;index" json:"-"`
	Series       *LeagueSeries  `gorm:"foreignKey:SeriesID" json:"series"`
	SeasonNumber int            `gorm:"column:season_number;uniqueIndex:idx_series_season" json:"season_number"`
	Name         string         `gorm:"size:150;not null" json:"name"`
	Cover        string         `gorm:"column:cover;size:500" json:"cover"`
	Description  string         `gorm:"type:text;default:''" json:"description"`
	StartTime    *time.Time     `gorm:"column:start_time" json:"start_time"`
	EndTime      *time.Time     `gorm:"column:end_time" json:"end_time"`
	Status       string         `gorm:"size:20;default:'registration'" json:"status"`
	IsCurrent    bool           `gorm:"column:is_current;default:false" json:"is_current"`
	AllowOnline  bool           `gorm:"column:allow_online;default:true" json:"allow_online"`
	AllowOffline bool           `gorm:"column:allow_offline;default:true" json:"allow_offline"`
	CreatedByID  *uint64        `gorm:"column:created_by_id" json:"-"`
	CreatedBy    *User          `gorm:"foreignKey:CreatedByID" json:"-"`
	CreatedAt    time.Time      `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt    time.Time      `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`

	Stages         []LeagueStage        `gorm:"foreignKey:SeasonID" json:"stages,omitempty"`
	SeasonPlayers  []LeagueSeasonPlayer `gorm:"foreignKey:SeasonID" json:"season_players,omitempty"`
}

func (LeagueSeason) TableName() string { return "league_seasons" }

type LeagueStage struct {
	ID             string        `gorm:"primaryKey;size:36" json:"id"`
	SeasonID       string        `gorm:"column:season_id;size:36;uniqueIndex:idx_season_order;index" json:"-"`
	Season         *LeagueSeason `gorm:"foreignKey:SeasonID" json:"-"`
	Name           string        `gorm:"size:100;not null" json:"name"`
	StageType      string        `gorm:"column:stage_type;size:30" json:"stage_type"`
	Status         string        `gorm:"size:20;default:'pending'" json:"status"`
	Order          int           `gorm:"uniqueIndex:idx_season_order;default:0" json:"order"`
	GamesPerPlayer int           `gorm:"column:games_per_player;default:8" json:"games_per_player"`
	Uma1st         float64       `gorm:"column:uma_1st;default:20" json:"uma_1st"`
	Uma2nd         float64       `gorm:"column:uma_2nd;default:10" json:"uma_2nd"`
	Uma3rd         float64       `gorm:"column:uma_3rd;default:-10" json:"uma_3rd"`
	Uma4th         float64       `gorm:"column:uma_4th;default:-20" json:"uma_4th"`
	BaseScore      float64       `gorm:"column:base_score;default:25000" json:"base_score"`
	AllowCompanion bool          `gorm:"column:allow_companion;default:false" json:"allow_companion"`
	AllowFreeTable bool          `gorm:"column:allow_free_table;default:true" json:"allow_free_table"`
	RecordRanking  bool          `gorm:"column:record_ranking;default:false" json:"record_ranking"`
	Notes          string        `gorm:"type:text;default:''" json:"notes"`
	PromotionRules JSONField     `gorm:"column:promotion_rules;type:text;default:'{}'" json:"promotion_rules"`
	CreatedAt      time.Time     `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time     `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`

	StagePlayers []LeagueStagePlayer `gorm:"foreignKey:StageID" json:"stage_players,omitempty"`
	Matches      []LeagueMatch       `gorm:"foreignKey:StageID" json:"matches,omitempty"`
}

func (LeagueStage) TableName() string { return "league_stages" }

func (s *LeagueStage) BeforeCreate(tx *gorm.DB) error {
	defaultJSONField(&s.PromotionRules)
	return nil
}

func (s *LeagueStage) GetUmaList() []float64 {
	return []float64{s.Uma1st, s.Uma2nd, s.Uma3rd, s.Uma4th}
}

func (s *LeagueStage) HasGroups() bool {
	return s.StageType == "elimination_1" || s.StageType == "elimination_2" || s.StageType == "elimination_3"
}

type LeagueSeasonPlayer struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	SeasonID  string    `gorm:"column:season_id;size:36;uniqueIndex:idx_season_player" json:"-"`
	PlayerID  string    `gorm:"column:player_id;size:36;uniqueIndex:idx_season_player" json:"-"`
	Season    *LeagueSeason `gorm:"foreignKey:SeasonID" json:"-"`
	Player    *Player   `gorm:"foreignKey:PlayerID" json:"-"`
	SeedLabel string    `gorm:"column:seed_label;size:10;default:''" json:"seed_label"`
	JoinedAt  time.Time `gorm:"column:joined_at;autoCreateTime" json:"joined_at"`
}

func (LeagueSeasonPlayer) TableName() string { return "league_season_players" }

type LeagueStagePlayer struct {
	ID            string        `gorm:"primaryKey;size:36" json:"id"`
	StageID       string        `gorm:"column:stage_id;size:36;uniqueIndex:idx_stage_player" json:"-"`
	PlayerID      string        `gorm:"column:player_id;size:36;uniqueIndex:idx_stage_player" json:"-"`
	Stage         *LeagueStage  `gorm:"foreignKey:StageID" json:"-"`
	Player        *Player       `gorm:"foreignKey:PlayerID" json:"-"`
	GroupType     string        `gorm:"column:group_type;size:20;default:'none'" json:"group_type"`
	IsEliminated  bool          `gorm:"column:is_eliminated;default:false" json:"is_eliminated"`
	IsPromoted    bool          `gorm:"column:is_promoted;default:false" json:"is_promoted"`
	GamesPlayed   int           `gorm:"column:games_played;default:0" json:"games_played"`
	TotalPT       float64       `gorm:"column:total_pt;default:0" json:"total_pt"`
	RankInStage   int           `gorm:"column:rank_in_stage;default:0" json:"rank_in_stage"`
	CreatedAt     time.Time     `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time     `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (LeagueStagePlayer) TableName() string { return "league_stage_players" }

type LeagueMatch struct {
	ID               string        `gorm:"primaryKey;size:36" json:"id"`
	StageID          string        `gorm:"column:stage_id;size:36;index" json:"-"`
	GameID           *string       `gorm:"column:game_id;size:36;uniqueIndex" json:"-"`
	Stage            *LeagueStage  `gorm:"foreignKey:StageID" json:"-"`
	Game             *Game         `gorm:"foreignKey:GameID" json:"-"`
	MatchLabel       string        `gorm:"column:match_label;size:50;default:''" json:"match_label"`
	RoundIndex       int           `gorm:"column:round_index;default:0" json:"round_index"`
	TableIndex       int           `gorm:"column:table_index;default:0" json:"table_index"`
	ScheduledPlayers JSONField     `gorm:"column:scheduled_players;type:text" json:"scheduled_players"`
	CompanionPlayers JSONField     `gorm:"column:companion_players;type:text" json:"companion_players"`
	CreatedAt        time.Time     `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (LeagueMatch) TableName() string { return "league_matches" }

type JSONField json.RawMessage

func (j JSONField) Value() (interface{}, error) {
	if len(j) == 0 {
		return "{}", nil
	}
	return string(j), nil
}

func (j *JSONField) Scan(value interface{}) error {
	if value == nil {
		*j = JSONField("{}")
		return nil
	}
	switch v := value.(type) {
	case []byte:
		*j = JSONField(make([]byte, len(v)))
		copy(*j, v)
		return nil
	case string:
		*j = JSONField(v)
		return nil
	}
	*j = JSONField("{}")
	return nil
}

func (j JSONField) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("{}"), nil
	}
	return j, nil
}

func (j *JSONField) UnmarshalJSON(data []byte) error {
	if j == nil {
		j = new(JSONField)
	}
	*j = JSONField(make([]byte, len(data)))
	copy(*j, data)
	return nil
}

func (j JSONField) AsMap() map[string]interface{} {
	var m map[string]interface{}
	if json.Unmarshal(j, &m) == nil {
		return m
	}
	return nil
}

func (j JSONField) AsArray() []interface{} {
	var a []interface{}
	if json.Unmarshal(j, &a) == nil {
		return a
	}
	return nil
}

func (j JSONField) IsNil() bool {
	return len(j) == 0 || string(j) == "null" || string(j) == "{}"
}

func (j JSONField) Len() int {
	a := j.AsArray()
	if a != nil {
		return len(a)
	}
	m := j.AsMap()
	return len(m)
}

func defaultJSONField(j *JSONField) {
	if j == nil || len(*j) == 0 {
		*j = JSONField("{}")
	}
}

// NewJSONField marshals v into JSON bytes stored as JSONField.
func NewJSONField(v interface{}) (JSONField, error) {
	if v == nil {
		return JSONField("{}"), nil
	}
	switch x := v.(type) {
	case JSONField:
		return x, nil
	case json.RawMessage:
		return JSONField(x), nil
	case []byte:
		if len(x) == 0 {
			return JSONField("{}"), nil
		}
		return JSONField(append([]byte(nil), x...)), nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return JSONField(b), nil
}

func mustMarshal(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

func mustUnmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}
