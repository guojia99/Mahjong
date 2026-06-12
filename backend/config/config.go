package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"mahjong-backend/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type EmailConfig struct {
	SMTPHost string `json:"smtpHost"`
	SMTPPort int    `json:"smtpPort"`
	From     string `json:"from"`
	FromName string `json:"fromName"`
	Password string `json:"password"`
}

func (e EmailConfig) Enabled() bool {
	return e.SMTPHost != "" && e.From != "" && e.Password != ""
}

type DBConfig struct {
	Database struct {
		SQLitePath string `json:"sqlite_path"`
	} `json:"database"`
	MajsoulAccount         string             `json:"majsoul_account"`
	MajsoulPassword        string             `json:"majsoul_password"`
	MajsoulAccessToken     string             `json:"majsoul_access_token"`
	MajsoulOAuth2Type      int                `json:"majsoul_oauth2_type"`
	MajsoulLoginRequestB64 string             `json:"majsoul_login_request_b64"`
	MortalBaseURL          string             `json:"mortal_base_url"`
	MortalBackends         []MortalBackendCfg `json:"mortal_backends"`
	AiGradeTiers           []AiGradeTierCfg   `json:"ai_grade_tiers"`
	EmailConfig            EmailConfig        `json:"emailConfig"`
}

// MortalBackendCfg is one Mortal inference server endpoint.
type MortalBackendCfg struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Best    bool   `json:"best,omitempty"`
	URL     string `json:"url"`
}

// AiGradeTierCfg is the minimum score (inclusive) for a letter grade label.
type AiGradeTierCfg struct {
	Grade string  `json:"grade"`
	Min   float64 `json:"min"`
}

var (
	Cfg *DBConfig
	DB  *gorm.DB
)

var (
	ProjectRoot    string
	ConfigFilePath string
)

func Load(configPath string) {
	absConfig, err := filepath.Abs(configPath)
	if err != nil {
		panic("cannot resolve config path " + configPath + ": " + err.Error())
	}
	ConfigFilePath = absConfig
	ProjectRoot = filepath.Dir(absConfig)

	data, err := os.ReadFile(absConfig)
	if err != nil {
		panic("cannot read config " + absConfig + ": " + err.Error())
	}

	Cfg = &DBConfig{}
	if err := json.Unmarshal(data, Cfg); err != nil {
		panic("cannot parse config " + absConfig + ": " + err.Error())
	}
	normalizeMortalBackends()
}

// BestMortalBackend returns the backend marked best, or the first configured entry.
func BestMortalBackend() (MortalBackendCfg, bool) {
	backends := MortalBackends()
	for _, b := range backends {
		if b.Best {
			return b, true
		}
	}
	if len(backends) > 0 {
		return backends[0], true
	}
	return MortalBackendCfg{}, false
}

// MortalBackends returns configured Mortal endpoints (multi-model or legacy single URL).
func MortalBackends() []MortalBackendCfg {
	if Cfg == nil {
		return nil
	}
	if len(Cfg.MortalBackends) > 0 {
		return Cfg.MortalBackends
	}
	if Cfg.MortalBaseURL != "" {
		return []MortalBackendCfg{{
			Name:    "mortal",
			Version: "1",
			URL:     Cfg.MortalBaseURL,
		}}
	}
	return []MortalBackendCfg{{
		Name:    "mortal",
		Version: "1",
		URL:     "http://127.0.0.1:9996",
	}}
}

func normalizeMortalBackends() {
	if Cfg == nil {
		return
	}
	if len(Cfg.MortalBackends) == 0 && Cfg.MortalBaseURL != "" {
		Cfg.MortalBackends = []MortalBackendCfg{{
			Name:    "mortal",
			Version: "1",
			URL:     Cfg.MortalBaseURL,
		}}
	}
}

// ResolveDBPath returns the absolute SQLite file path for configPath (loads config).
func ResolveDBPath(configPath string) (string, error) {
	Load(configPath)
	return prepareDBPath()
}

func prepareDBPath() (string, error) {
	rel := Cfg.Database.SQLitePath
	if rel == "" {
		rel = "db.sqlite3"
	}
	dbPath := rel
	if !filepath.IsAbs(dbPath) {
		dbPath = filepath.Join(ProjectRoot, rel)
	}
	abs, err := filepath.Abs(dbPath)
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(abs)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create database directory %s: %w", dir, err)
	}
	return abs, nil
}

func InitDB(configPath string) *gorm.DB {
	Load(configPath)

	dbPath, err := prepareDBPath()
	if err != nil {
		panic("failed to prepare database path: " + err.Error())
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Discard,
	})
	if err != nil {
		panic(fmt.Sprintf("failed to connect database %s: %s", dbPath, err.Error()))
	}

	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)

	time.Local = time.FixedZone("CST", 8*3600)

	DB = db
	if err := db.AutoMigrate(
		&models.Game{},
		&models.User{},
		&models.VerificationCode{},
		&models.LoginLog{},
		&models.QueMiPuzzle{},
		&models.QueMiAttempt{},
		&models.QueMiSubmit{},
		&models.QueMiCreatorBlacklist{},
	); err != nil {
		panic("failed to migrate database: " + err.Error())
	}
	return db
}
