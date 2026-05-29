package mortal

// AnalysisResult is one model's full review for a game.
type AnalysisResult struct {
	Version      int              `json:"version"`
	ModelKey     string           `json:"model_key,omitempty"`
	ModelName    string           `json:"model_name,omitempty"`
	ModelVersion string           `json:"model_version,omitempty"`
	ModelTag     string           `json:"model_tag"`
	Players      []PlayerAnalysis `json:"players"`
}

type PlayerAnalysis struct {
	Seat       int            `json:"seat"`
	MatchAvg   int            `json:"match_avg"`
	MatchGrade string         `json:"match_grade"`
	Kyoku      []KyokuAnalysis `json:"kyoku"`
}

type KyokuAnalysis struct {
	KyokuIndex int              `json:"kyoku_index"`
	Avg        int              `json:"avg"`
	Grade      string           `json:"grade"`
	Decisions  []DecisionRecord `json:"decisions"`
}

type DecisionOption struct {
	ActionID int     `json:"action_id,omitempty"`
	Label    string  `json:"label"`
	Type     string  `json:"type,omitempty"`
	Pai      string  `json:"pai,omitempty"`
	Q       float64 `json:"q"`
	Pi      float64 `json:"pi"`
	Score   int     `json:"score"`
	Chosen  bool    `json:"chosen"`
}

type DecisionRecord struct {
	ActionIndex int              `json:"action_index"`
	Step        int              `json:"step"`
	Kind        string           `json:"kind"`
	ChosenLabel string           `json:"chosen_label"`
	ChosenScore int              `json:"chosen_score"`
	ChosenPi    float64          `json:"chosen_pi"`
	Options     []DecisionOption `json:"options"`
}
