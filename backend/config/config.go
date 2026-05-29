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

type DBConfig struct {
	Database struct {
		SQLitePath string `json:"sqlite_path"`
	} `json:"database"`
	MajsoulAccount         string `json:"majsoul_account"`
	MajsoulPassword        string `json:"majsoul_password"`
	MajsoulAccessToken     string `json:"majsoul_access_token"`
	MajsoulOAuth2Type      int    `json:"majsoul_oauth2_type"`
	MajsoulLoginRequestB64 string `json:"majsoul_login_request_b64"`
	MortalBaseURL          string           `json:"mortal_base_url"`
	AiGradeTiers           []AiGradeTierCfg `json:"ai_grade_tiers"`
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
	if err := db.AutoMigrate(&models.Game{}); err != nil {
		panic("failed to migrate database: " + err.Error())
	}
	return db
}
