package mortal

import (
	"os"
	"path/filepath"
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

// Requires marjong.db and mortal on :9996.
func TestAnalyzePaipuMortal89e907(t *testing.T) {
	dbPath := filepath.Join("..", "marjong.db")
	if _, err := os.Stat(dbPath); err != nil {
		t.Skip("marjong.db not found")
	}
	config.Load(filepath.Join("..", "db_config.json"))
	config.InitDB(filepath.Join("..", "db_config.json"))

	var game models.Game
	const gameID = "89e9075204ff4f1c8748f1b309eb3f32"
	if err := config.DB.First(&game, "id = ?", gameID).Error; err != nil {
		t.Fatal(err)
	}

	client := NewClient("http://127.0.0.1:9996")
	if err := client.Health(); err != nil {
		t.Skip("mortal not running on :9996:", err)
	}

	if _, err := AnalyzeGame(gameID, game.PaipuData, client, nil, "test", "integration"); err != nil {
		t.Fatal(err)
	}
}
