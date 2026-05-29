package mortal

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

func TestBuildMjaiEventsFromDBSample(t *testing.T) {
	dbPath := filepath.Join("..", "marjong.db")
	if _, err := os.Stat(dbPath); err != nil {
		t.Skip("marjong.db not found")
	}
	config.Load(filepath.Join("..", "db_config.json"))
	config.InitDB(filepath.Join("..", "db_config.json"))

	var game models.Game
	if err := config.DB.Where("game_type = ?", "online").Order("created_at ASC").First(&game).Error; err != nil {
		t.Skip(err)
	}
	actions := ActionsFromPaipuData(game.PaipuData)
	if len(actions) == 0 {
		t.Skip("no actions")
	}
	names := PlayerNamesFromPaipu(game.PaipuData)
	for seat := 0; seat < 4; seat++ {
		events, err := BuildMjaiEvents(actions, seat, names)
		if err != nil {
			t.Fatalf("seat %d: %v", seat, err)
		}
		if len(events) < 10 {
			t.Fatalf("seat %d: too few events %d", seat, len(events))
		}
	}
}

func TestKakanAfterPonNotAnkan(t *testing.T) {
	dbPath := filepath.Join("..", "marjong.db")
	if _, err := os.Stat(dbPath); err != nil {
		t.Skip("marjong.db not found")
	}
	config.Load(filepath.Join("..", "db_config.json"))
	config.InitDB(filepath.Join("..", "db_config.json"))

	var game models.Game
	id := "89e9075204ff4f1c8748f1b309eb3f32"
	if err := config.DB.First(&game, "id = ?", id).Error; err != nil {
		t.Skip(err)
	}
	actions := ActionsFromPaipuData(game.PaipuData)
	names := PlayerNamesFromPaipu(game.PaipuData)
	events, err := BuildMjaiEvents(actions, 0, names)
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range events {
		if ev.ActionIndex != 674 {
			continue
		}
		if ev.Kind != "kakan" {
			t.Fatalf("action 674: want kakan, got %s: %s", ev.Kind, ev.JSON)
		}
		var m map[string]interface{}
		_ = json.Unmarshal([]byte(ev.JSON), &m)
		if m["type"] != "kakan" || m["pai"] != "W" {
			t.Fatalf("unexpected event: %v", m)
		}
		return
	}
	t.Fatal("no event at action 674")
}

func TestMjaiTilesMatchRedFive(t *testing.T) {
	if !mjaiTilesMatch("5mr", "5m") || !mjaiTilesMatch("5pr", "5p") {
		t.Fatal("red five should match")
	}
	if mjaiTilesMatch("5m", "5p") {
		t.Fatal("different suits should not match")
	}
}

func TestType3WithoutPonIsAnkan(t *testing.T) {
	dbPath := filepath.Join("..", "marjong.db")
	if _, err := os.Stat(dbPath); err != nil {
		t.Skip("marjong.db not found")
	}
	config.Load(filepath.Join("..", "db_config.json"))
	config.InitDB(filepath.Join("..", "db_config.json"))

	var game models.Game
	id := "09b862932ed942008d36834b52cfd2ac"
	if err := config.DB.First(&game, "id = ?", id).Error; err != nil {
		t.Skip(err)
	}
	actions := ActionsFromPaipuData(game.PaipuData)
	names := PlayerNamesFromPaipu(game.PaipuData)
	events, err := BuildMjaiEvents(actions, 1, names)
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range events {
		if ev.ActionIndex != 511 {
			continue
		}
		if ev.Kind != "ankan" {
			t.Fatalf("action 511: want ankan, got %s: %s", ev.Kind, ev.JSON)
		}
		return
	}
	t.Fatal("no event at action 511")
}

func TestDealTileEmitsTsumoWhenWallEmpty(t *testing.T) {
	// Last draw before exhaustive draw: left_tile_count is 0 but tile is present.
	events, err := BuildMjaiEvents([]map[string]interface{}{
		{"name": ".lq.RecordNewRound", "data": map[string]interface{}{
			"chang": 0, "ju": 0, "ben": 0, "liqibang": 0,
			"scores": []interface{}{25000, 25000, 25000, 25000},
			"doras":  []interface{}{"1m"},
			"tiles0": []interface{}{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"},
			"tiles1": []interface{}{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"},
			"tiles2": []interface{}{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"},
			"tiles3": []interface{}{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"},
		}},
		{"name": ".lq.RecordDealTile", "data": map[string]interface{}{
			"seat": 1, "tile": "4z", "left_tile_count": 0,
		}},
		{"name": ".lq.RecordDiscardTile", "data": map[string]interface{}{
			"seat": 1, "tile": "4z", "moqie": true,
		}},
		{"name": ".lq.RecordNoTile", "data": map[string]interface{}{}},
	}, 1, [4]string{"a", "b", "c", "d"})
	if err != nil {
		t.Fatal(err)
	}
	var sawTsumo, sawDahai bool
	for _, ev := range events {
		if ev.ActionIndex == 1 && ev.Kind == "tsumo" {
			sawTsumo = true
			if !strings.Contains(ev.JSON, `"N"`) {
				t.Fatalf("tsumo: want N (4z), got %s", ev.JSON)
			}
		}
		if ev.ActionIndex == 2 && ev.Kind == "dahai" {
			sawDahai = true
		}
	}
	if !sawTsumo {
		t.Fatal("expected tsumo at last draw when left_tile_count=0")
	}
	if !sawDahai {
		t.Fatal("expected dahai after last-draw tsumo")
	}
}

func TestNoAnkanWithFourVisibleHonors(t *testing.T) {
	// Regression: pon 3z then RecordAnGangAddGang type 2 must not emit ankan (5th W).
	events, err := BuildMjaiEvents([]map[string]interface{}{
		{"name": ".lq.RecordNewRound", "data": map[string]interface{}{
			"chang": 0, "ju": 0, "ben": 0, "liqibang": 0,
			"scores": []interface{}{25000, 25000, 25000, 25000},
			"doras":  []interface{}{"1m"},
			"tiles0": []interface{}{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"},
			"tiles1": []interface{}{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"},
			"tiles2": []interface{}{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"},
			"tiles3": []interface{}{"3z", "3z", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p"},
		}},
		{"name": ".lq.RecordDiscardTile", "data": map[string]interface{}{"seat": 1, "tile": "3z", "moqie": false}},
		{"name": ".lq.RecordChiPengGang", "data": map[string]interface{}{
			"seat": 3, "type": 1, "tiles": []interface{}{"3z", "3z", "3z"}, "froms": []interface{}{3, 3, 1},
		}},
		{"name": ".lq.RecordDealTile", "data": map[string]interface{}{"seat": 3, "tile": "3z"}},
		{"name": ".lq.RecordAnGangAddGang", "data": map[string]interface{}{"seat": 3, "type": 2, "tiles": "3z"}},
	}, 0, [4]string{"a", "b", "c", "d"})
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range events {
		if strings.Contains(ev.JSON, `"ankan"`) && strings.Contains(ev.JSON, `"W"`) {
			t.Fatalf("should be kakan not ankan: %s", ev.JSON)
		}
	}
}
