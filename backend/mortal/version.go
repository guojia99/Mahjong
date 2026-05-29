package mortal

import (
	"encoding/json"

	"mahjong-backend/models"
)

// AnalysisVersion is stored in ai_analysis_data.version; bump when mjai/scoring logic changes.
const AnalysisVersion = 5

// StoredAnalysisVersion reads version from persisted JSON (0 if missing or invalid).
func StoredAnalysisVersion(data models.JSONField) int {
	if data.IsNil() {
		return 0
	}
	var ar AnalysisResult
	if err := json.Unmarshal([]byte(data), &ar); err != nil {
		return 0
	}
	return ar.Version
}

// IsAnalysisDataCurrent is true when status is done and stored version matches AnalysisVersion.
func IsAnalysisDataCurrent(status string, data models.JSONField) bool {
	return status == "done" && StoredAnalysisVersion(data) == AnalysisVersion
}
