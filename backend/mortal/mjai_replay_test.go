package mortal

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

// Replay full mjai stream against a running mortal-dev instance (port 9996 by default).
func TestReplayPaipuMortal89e907(t *testing.T) {
	replayPaipuMortalGame(t, "89e9075204ff4f1c8748f1b309eb3f32")
}

func TestReplayPaipuMortalBe7fdd(t *testing.T) {
	replayPaipuMortalGame(t, "be7fdd19a05647a2acd7202824ac4e60")
}

func replayPaipuMortalGame(t *testing.T, gameID string) {
	dbPath := filepath.Join("..", "marjong.db")
	if _, err := os.Stat(dbPath); err != nil {
		t.Skip("marjong.db not found")
	}
	config.Load(filepath.Join("..", "db_config.json"))
	config.InitDB(filepath.Join("..", "db_config.json"))

	var game models.Game
	if err := config.DB.First(&game, "id = ?", gameID).Error; err != nil {
		t.Fatal(err)
	}

	client := NewClient("http://127.0.0.1:9996")
	if err := client.Health(); err != nil {
		t.Skip("mortal not running on :9996:", err)
	}

	actions := ActionsFromPaipuData(game.PaipuData)
	names := PlayerNamesFromPaipu(game.PaipuData)

	for seat := 0; seat < 4; seat++ {
		seat := seat
		t.Run(fmt.Sprintf("seat%d", seat), func(t *testing.T) {
			events, err := BuildMjaiEvents(actions, seat, names)
			if err != nil {
				t.Fatal(err)
			}
			gid := fmt.Sprintf("%s-replay-s%d", gameID, seat)
			_ = client.ResetGame(gid)
			for i, ev := range events {
				if _, err := client.React(gid, []string{ev.JSON}); err != nil {
					t.Fatalf("event %d action %d kind=%s: %v\n%s", i, ev.ActionIndex, ev.Kind, err, ev.JSON)
				}
			}
		})
	}
}
