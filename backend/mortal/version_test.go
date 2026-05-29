package mortal

import (
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

func TestAnalysisVersionCurrent(t *testing.T) {
	config.Cfg = &config.DBConfig{
		MortalBackends: []config.MortalBackendCfg{{Name: "mortal", Version: "1", URL: "http://127.0.0.1:9996"}},
	}
	store := &AnalysisStore{
		Version: AnalysisStoreVersion,
		Models: map[string]*ModelEntry{
			"mortal:1": {Status: "done", Analysis: &AnalysisResult{Version: AnalysisVersion, ModelTag: "t"}},
		},
	}
	data, _ := StoreToJSONField(store)
	if !IsAnalysisDataCurrent("done", data) {
		t.Fatal("expected current")
	}
	old, _ := models.NewJSONField(AnalysisResult{Version: 1, ModelTag: "t"})
	if IsAnalysisDataCurrent("done", old) {
		t.Fatal("expected outdated v1")
	}
	if AnalysisVersion < 6 {
		t.Fatal("expected AnalysisVersion >= 6 for multi-model store")
	}
	if IsAnalysisDataCurrent("pending", old) {
		t.Fatal("pending is not current")
	}
}
