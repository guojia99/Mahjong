package mortal

import (
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

func TestParseLegacySingleAnalysis(t *testing.T) {
	legacy, _ := models.NewJSONField(AnalysisResult{
		Version:  5,
		ModelTag: "mortal4-test",
		Players:  []PlayerAnalysis{{Seat: 0, MatchAvg: 80}},
	})
	store, err := ParseAnalysisStore(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Models) != 1 {
		t.Fatalf("expected 1 model, got %d", len(store.Models))
	}
}

func TestModelKey(t *testing.T) {
	if ModelKey("mortal_v4", "1") != "mortal_v4:1" {
		t.Fatal("unexpected key")
	}
}

func TestIsStoreCurrentRequiresAllBackends(t *testing.T) {
	config.Cfg = &config.DBConfig{
		MortalBackends: []config.MortalBackendCfg{
			{Name: "a", Version: "1", URL: "http://127.0.0.1:9996"},
			{Name: "b", Version: "1", URL: "http://127.0.0.1:9995"},
		},
	}
	store := &AnalysisStore{
		Version: AnalysisStoreVersion,
		Models: map[string]*ModelEntry{
			"a:1": {Status: "done", Analysis: &AnalysisResult{Version: AnalysisVersion}},
		},
	}
	if IsStoreCurrent(store) {
		t.Fatal("expected incomplete store")
	}
	store.Models["b:1"] = &ModelEntry{Status: "done", Analysis: &AnalysisResult{Version: AnalysisVersion}}
	if !IsStoreCurrent(store) {
		t.Fatal("expected complete store")
	}
}
