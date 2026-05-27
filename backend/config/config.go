package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

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

func InitDB(configPath string) *gorm.DB {
	Load(configPath)

	dbPath := filepath.Join(ProjectRoot, Cfg.Database.SQLitePath)

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Discard,
	})
	if err != nil {
		panic("failed to connect database: " + err.Error())
	}

	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)

	time.Local = time.FixedZone("CST", 8*3600)

	DB = db
	return db
}
