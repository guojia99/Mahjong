package handlers

import (
	"encoding/json"
	"os"
	"testing"
	"mahjong-backend/models"
)

func TestAggregatePaipuRiichiFromDemoPaipu(t *testing.T) {
	data, err := os.ReadFile("../../../majsoul_paipu_demo/paipu_raw.json")
	if err != nil {
		t.Skip(err)
	}
	var games []map[string]interface{}
	if err := json.Unmarshal(data, &games); err != nil {
		t.Fatal(err)
	}
	if len(games) == 0 {
		t.Fatal("empty paipu list")
	}
	b, _ := json.Marshal(games[0])
	pd := models.JSONField(b)
	actions := paipuActionsFromGameData(pd)
	if len(actions) == 0 {
		t.Fatal("no actions")
	}
	st, hands := aggregatePaipuPerGameStats(actions)
	if hands <= 0 {
		t.Fatal("no hands")
	}
	totalRiichi := 0
	for _, s := range st {
		if s != nil {
			totalRiichi += s.Riichi
		}
	}
	if totalRiichi == 0 {
		t.Fatalf("expected riichi > 0 in demo paipu, got 0 over %d hands", hands)
	}
	t.Logf("hands=%d total_riichi=%d", hands, totalRiichi)
}

func TestRiichiNotenOnDrawEnd(t *testing.T) {
	actions := []map[string]interface{}{
		{"name": ".lq.RecordNewRound", "data": map[string]interface{}{}},
		{"name": ".lq.RecordDiscardTile", "data": map[string]interface{}{
			"seat": 1, "is_liqi": true,
		}},
		{"name": ".lq.RecordLiuJu", "data": map[string]interface{}{
			"delta_scores": []interface{}{0, -1500, 500, 500},
			"type":         0,
		}},
		{"name": ".lq.RecordNewRound", "data": map[string]interface{}{}},
		{"name": ".lq.RecordDiscardTile", "data": map[string]interface{}{
			"seat": 2, "is_liqi": true,
		}},
		{"name": ".lq.RecordNoTile", "data": map[string]interface{}{
			"delta_scores": []interface{}{0, 0, -1500, 1500},
			"players": []interface{}{
				map[string]interface{}{"seat": 0, "tingpai": false},
				map[string]interface{}{"seat": 1, "tingpai": false},
				map[string]interface{}{"seat": 2, "tingpai": true},
				map[string]interface{}{"seat": 3, "tingpai": true},
			},
		}},
	}
	st, hands := aggregatePaipuPerGameStats(actions)
	if hands != 2 {
		t.Fatalf("hands=%d want 2", hands)
	}
	if st[1] == nil || st[1].RiichiNotenHands != 1 {
		t.Fatalf("seat1 noten=%v want 1", st[1])
	}
	if st[2] == nil || st[2].RiichiNotenHands != 1 {
		t.Fatalf("seat2 noten=%v want 1 (tenpai should not exclude draw)", st[2])
	}
}
