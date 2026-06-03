package mortal

import (
	"encoding/json"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

// AnalysisStoreVersion is the wrapper version for multi-model ai_analysis_data.
const AnalysisStoreVersion = 6

// ModelKey builds the storage key for a configured Mortal backend.
func ModelKey(name, version string) string {
	return name + ":" + version
}

// AnalysisStore holds per-model analysis results in Game.ai_analysis_data.
type AnalysisStore struct {
	Version int                    `json:"version"`
	Models  map[string]*ModelEntry `json:"models"`
}

// ModelEntry is one Mortal backend's analysis slot.
type ModelEntry struct {
	Name       string           `json:"name"`
	Version    string           `json:"version"`
	URL        string           `json:"url,omitempty"`
	Status     string           `json:"status"` // pending|processing|done|failed|skipped
	Error      string           `json:"error,omitempty"`
	AnalyzedAt string           `json:"analyzed_at,omitempty"`
	Analysis   *AnalysisResult  `json:"analysis,omitempty"`
}

// ParseAnalysisStore reads ai_analysis_data (v6 multi-model or legacy single AnalysisResult).
func ParseAnalysisStore(data models.JSONField) (*AnalysisStore, error) {
	if data.IsNil() {
		return &AnalysisStore{Version: AnalysisStoreVersion, Models: map[string]*ModelEntry{}}, nil
	}
	raw := []byte(data)
	var store AnalysisStore
	if err := json.Unmarshal(raw, &store); err == nil && store.Models != nil && store.Version >= AnalysisStoreVersion {
		if store.Models == nil {
			store.Models = map[string]*ModelEntry{}
		}
		return &store, nil
	}
	// Legacy: single AnalysisResult at root.
	var single AnalysisResult
	if err := json.Unmarshal(raw, &single); err != nil {
		return nil, err
	}
	key := "legacy"
	if single.ModelName != "" || single.ModelVersion != "" {
		key = ModelKey(single.ModelName, single.ModelVersion)
	} else if single.ModelTag != "" {
		key = single.ModelTag
	}
	return &AnalysisStore{
		Version: AnalysisStoreVersion,
		Models: map[string]*ModelEntry{
			key: {
				Name:     single.ModelName,
				Version:  single.ModelVersion,
				Status:   "done",
				Analysis: &single,
			},
		},
	}, nil
}

// StoreToJSONField serializes the multi-model store.
func StoreToJSONField(store *AnalysisStore) (models.JSONField, error) {
	if store == nil {
		store = &AnalysisStore{Version: AnalysisStoreVersion, Models: map[string]*ModelEntry{}}
	}
	if store.Models == nil {
		store.Models = map[string]*ModelEntry{}
	}
	store.Version = AnalysisStoreVersion
	b, err := json.Marshal(store)
	if err != nil {
		return models.JSONField{}, err
	}
	return models.JSONField(string(b)), nil
}

func (s *AnalysisStore) entry(key string) *ModelEntry {
	if s.Models == nil {
		s.Models = map[string]*ModelEntry{}
	}
	e, ok := s.Models[key]
	if !ok {
		e = &ModelEntry{}
		s.Models[key] = e
	}
	return e
}

// ModelEntryFor returns the slot for a backend key, creating if needed.
func (s *AnalysisStore) ModelEntryFor(key, name, version, url string) *ModelEntry {
	e := s.entry(key)
	if e.Name == "" {
		e.Name = name
	}
	if e.Version == "" {
		e.Version = version
	}
	if e.URL == "" {
		e.URL = url
	}
	return e
}

// IsModelCurrent is true when the slot has done analysis at AnalysisVersion.
func IsModelCurrent(entry *ModelEntry) bool {
	if entry == nil || entry.Status != "done" || entry.Analysis == nil {
		return false
	}
	return entry.Analysis.Version == AnalysisVersion
}

// IsStoreCurrent reports whether every configured backend has current analysis.
func IsStoreCurrent(store *AnalysisStore) bool {
	if store == nil {
		return false
	}
	backends := config.MortalBackends()
	if len(backends) == 0 {
		return false
	}
	for _, b := range backends {
		key := ModelKey(b.Name, b.Version)
		if !IsModelCurrent(store.Models[key]) {
			return false
		}
	}
	return true
}

// AggregateStatus derives game-level ai_analysis_status from per-model slots.
func AggregateStatus(store *AnalysisStore) string {
	if store == nil || len(store.Models) == 0 {
		return ""
	}
	backends := config.MortalBackends()
	if len(backends) == 0 {
		return ""
	}
	anyFailed := false
	anyProcessing := false
	anyPending := false
	allDone := true
	for _, b := range backends {
		key := ModelKey(b.Name, b.Version)
		e := store.Models[key]
		if e == nil || e.Status == "" || e.Status == "pending" {
			anyPending = true
			allDone = false
			continue
		}
		switch e.Status {
		case "processing":
			anyProcessing = true
			allDone = false
		case "failed":
			anyFailed = true
			allDone = false
		case "done":
			if !IsModelCurrent(e) {
				anyPending = true
				allDone = false
			}
		default:
			allDone = false
		}
	}
	if allDone {
		return "done"
	}
	if anyProcessing {
		return "processing"
	}
	if anyFailed && !anyPending {
		return "failed"
	}
	if anyPending {
		return "pending"
	}
	return "pending"
}

// AvailableModels lists done, current-version models for API responses.
func AvailableModels(store *AnalysisStore) []map[string]string {
	if store == nil {
		return nil
	}
	var out []map[string]string
	for key, e := range store.Models {
		if e == nil || !IsModelCurrent(e) {
			continue
		}
		out = append(out, modelInfoMap(key, e))
	}
	return out
}

func modelInfoMap(key string, e *ModelEntry) map[string]string {
	tag := ""
	if e.Analysis != nil {
		tag = e.Analysis.ModelTag
	}
	return map[string]string{
		"key":         key,
		"name":        e.Name,
		"version":     e.Version,
		"model_tag":   tag,
		"analyzed_at": e.AnalyzedAt,
	}
}

// CurrentAnalyses returns all done slots at the current AnalysisVersion.
func CurrentAnalyses(store *AnalysisStore) map[string]*AnalysisResult {
	out := map[string]*AnalysisResult{}
	if store == nil {
		return out
	}
	for key, e := range store.Models {
		if IsModelCurrent(e) {
			out[key] = e.Analysis
		}
	}
	return out
}

// PickAnalysis returns a current-version analysis for modelKey, or the first current done slot.
func PickAnalysis(store *AnalysisStore, modelKey string) (*AnalysisResult, string, bool) {
	if store == nil {
		return nil, "", false
	}
	if modelKey != "" {
		if e := store.Models[modelKey]; IsModelCurrent(e) {
			return e.Analysis, modelKey, true
		}
		return nil, modelKey, false
	}
	for _, b := range config.MortalBackends() {
		if !b.Best {
			continue
		}
		key := ModelKey(b.Name, b.Version)
		if e := store.Models[key]; IsModelCurrent(e) {
			return e.Analysis, key, true
		}
	}
	for _, b := range config.MortalBackends() {
		key := ModelKey(b.Name, b.Version)
		if e := store.Models[key]; IsModelCurrent(e) {
			return e.Analysis, key, true
		}
	}
	for key, e := range store.Models {
		if IsModelCurrent(e) {
			return e.Analysis, key, true
		}
	}
	return nil, "", false
}

// MarkModelDone stores a finished analysis result.
func MarkModelDone(store *AnalysisStore, key, name, version, url string, result *AnalysisResult) {
	e := store.ModelEntryFor(key, name, version, url)
	e.Status = "done"
	e.Error = ""
	e.AnalyzedAt = time.Now().Format(time.RFC3339)
	e.Analysis = result
}

// MarkModelFailed records an error for one backend.
func MarkModelFailed(store *AnalysisStore, key, name, version, url, errMsg string) {
	e := store.ModelEntryFor(key, name, version, url)
	e.Status = "failed"
	e.Error = errMsg
}

// MarkModelProcessing marks a slot as in progress.
func MarkModelProcessing(store *AnalysisStore, key, name, version, url string) {
	e := store.ModelEntryFor(key, name, version, url)
	e.Status = "processing"
	e.Error = ""
}
