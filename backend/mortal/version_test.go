package mortal

import (
	"testing"

	"mahjong-backend/models"
)

func TestAnalysisVersionCurrent(t *testing.T) {
	data, _ := models.NewJSONField(AnalysisResult{Version: AnalysisVersion, ModelTag: "t"})
	if !IsAnalysisDataCurrent("done", data) {
		t.Fatal("expected current")
	}
	old, _ := models.NewJSONField(AnalysisResult{Version: 1, ModelTag: "t"})
	if IsAnalysisDataCurrent("done", old) {
		t.Fatal("expected outdated v1")
	}
	if AnalysisVersion < 5 {
		t.Fatal("expected AnalysisVersion >= 5 after human-action scoring fix")
	}
	if IsAnalysisDataCurrent("pending", old) {
		t.Fatal("pending is not current")
	}
}
