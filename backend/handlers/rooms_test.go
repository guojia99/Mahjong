package handlers

import (
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupRoomTestDB(t *testing.T) {
	t.Helper()
	// Match production DSN flags (WAL, busy_timeout) without legacy-breaking foreign_keys=on.
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared&_busy_timeout=5000&_journal_mode=WAL"), &gorm.Config{
		FullSaveAssociations: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Player{},
		&models.Room{},
		&models.RoomPlayer{},
	); err != nil {
		t.Fatal(err)
	}
	config.DB = db
}

func TestRoomCreateDB(t *testing.T) {
	setupRoomTestDB(t)

	user := models.User{Username: "room_admin", IsActive: true, IsStaff: true}
	if err := config.DB.Create(&user).Error; err != nil {
		t.Fatal(err)
	}

	room := models.Room{
		ID:          newUUID(),
		Name:        "20260622线上歹人场",
		Location:    "线上",
		RoomType:    "online",
		Status:      "open",
		CreatedByID: &user.ID,
	}
	if err := config.DB.Create(&room).Error; err != nil {
		t.Fatalf("create room: %v", err)
	}

	var loaded models.Room
	if err := config.DB.Preload("RoomPlayers.Player").First(&loaded, "id = ?", room.ID).Error; err != nil {
		t.Fatalf("load room: %v", err)
	}
}
