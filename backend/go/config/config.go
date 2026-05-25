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
	MajsoulAccount  string `json:"majsoul_account"`
	MajsoulPassword string `json:"majsoul_password"`
}

var (
	Cfg *DBConfig
	DB  *gorm.DB
)

var ProjectRoot string

func Load(configPath string) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		panic("cannot read config " + configPath + ": " + err.Error())
	}

	Cfg = &DBConfig{}
	if err := json.Unmarshal(data, Cfg); err != nil {
		panic("cannot parse config " + configPath + ": " + err.Error())
	}
}

func InitDB(configPath string) *gorm.DB {
	ProjectRoot = filepath.Dir(configPath)
	Load(configPath)

	dbPath := filepath.Join(ProjectRoot, Cfg.Database.SQLitePath)

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
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
