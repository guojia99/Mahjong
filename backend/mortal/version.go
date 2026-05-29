package mortal

import (
	"encoding/json"

	"mahjong-backend/models"
)

// AnalysisVersion is stored in each AnalysisResult.version; bump when mjai/scoring logic changes.
const AnalysisVersion = 9

// StoredAnalysisVersion reads version from persisted JSON (legacy single or multi-model store).
func StoredAnalysisVersion(data models.JSONField) int {
	if data.IsNil() {
		return 0
	}
	store, err := ParseAnalysisStore(data)
	if err == nil && store != nil {
		if IsStoreCurrent(store) {
			return AnalysisVersion
		}
		for _, e := range store.Models {
			if e != nil && e.Analysis != nil {
				return e.Analysis.Version
			}
		}
		return 0
	}
	var ar AnalysisResult
	if err := json.Unmarshal([]byte(data), &ar); err != nil {
		return 0
	}
	return ar.Version
}

// IsAnalysisDataCurrent is true when status is done and all configured models are current.
func IsAnalysisDataCurrent(status string, data models.JSONField) bool {
	if status != "done" {
		return false
	}
	store, err := ParseAnalysisStore(data)
	if err != nil || store == nil {
		return false
	}
	return IsStoreCurrent(store)
}
