package quemi

// PuzzleType distinguishes winnable vs non-winnable puzzles.
type PuzzleType string

const (
	PuzzleTypeWinnable    PuzzleType = "winnable"
	PuzzleTypeNonWinnable PuzzleType = "nonWinnable"
)

// HandMode is closed (menzen) or open (with melds).
type HandMode string

const (
	HandModeClosed HandMode = "closed"
	HandModeOpen   HandMode = "open"
)

// Wind represents field or seat wind.
type Wind string

const (
	WindEast  Wind = "east"
	WindSouth Wind = "south"
	WindWest  Wind = "west"
	WindNorth Wind = "north"
)

// AgariWay is tsumo or ron.
type AgariWay string

const (
	AgariWayTsumo AgariWay = "tsumo"
	AgariWayRon   AgariWay = "ron"
)

// PuzzleDifficulty controls attempt limits.
type PuzzleDifficulty string

const (
	DifficultyHard     PuzzleDifficulty = "hard"
	DifficultyAdvanced PuzzleDifficulty = "advanced"
	DifficultyMedium   PuzzleDifficulty = "medium"
	DifficultyNormal   PuzzleDifficulty = "normal"
	DifficultyEasy     PuzzleDifficulty = "easy"
)

// TileFeedback is Wordle-style tile feedback.
type TileFeedback string

const (
	FeedbackGreen  TileFeedback = "green"
	FeedbackYellow TileFeedback = "yellow"
	FeedbackBlack  TileFeedback = "black"
	FeedbackNone   TileFeedback = "none"
)

// QueMiOpenAnswer is the canonical open-hand answer.
type QueMiOpenAnswer struct {
	Melds      [][]string `json:"melds"`
	ClosedHand []string   `json:"closedHand"`
	Draw       string     `json:"draw"`
}

// QueMiOpenGuess is a player's open-hand submission.
type QueMiOpenGuess struct {
	Melds [][]string `json:"melds"`
	Hand  []string   `json:"hand"`
}

// QueMiPuzzle matches the frontend puzzle shape.
type QueMiPuzzle struct {
	ID            string           `json:"id"`
	Type          PuzzleType       `json:"type"`
	Difficulty    PuzzleDifficulty `json:"difficulty"`
	MaxAttempts   int              `json:"maxAttempts"`
	HandMode      HandMode         `json:"handMode"`
	OpenMeldCount *int             `json:"openMeldCount,omitempty"`
	OpenAnswer    *QueMiOpenAnswer `json:"openAnswer,omitempty"`
	Answer        []string         `json:"answer"`
	FieldWind     Wind             `json:"fieldWind"`
	SeatWind      Wind             `json:"seatWind"`
	AgariWay      AgariWay         `json:"agariWay"`
	Dora          []string         `json:"dora"`
	Shanten       *int             `json:"shanten,omitempty"`
	CreatedAt     int64            `json:"createdAt"`
}

// QueMiOpenSubmitFeedback is feedback for an open-hand submit.
type QueMiOpenSubmitFeedback struct {
	MeldFeedback [][]TileFeedback `json:"meldFeedback"`
	HandFeedback []TileFeedback   `json:"handFeedback"`
}

// ATTEMPTS_BY_DIFFICULTY maps difficulty to max attempts.
var ATTEMPTS_BY_DIFFICULTY = map[PuzzleDifficulty]int{
	DifficultyHard:     4,
	DifficultyAdvanced: 5,
	DifficultyMedium:   6,
	DifficultyNormal:   7,
	DifficultyEasy:     8,
}

// HintDifficulties are difficulties that allow yaku hints.
var HintDifficulties = []PuzzleDifficulty{DifficultyNormal, DifficultyEasy}

const (
	MeldTileCount = 3
)
