package mortal

import (
	"math"
	"strings"
)

// Mortal action space (libriichi consts.rs, ACTION_SPACE = 46).
const ActionSpace = 46

// mjaiTileAtActionIndex maps discard/kan-select indices 0–36 to mjai tile strings.
var mjaiTileAtActionIndex = [37]string{
	"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
	"1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p",
	"1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s",
	"E", "S", "W", "N", "P", "F", "C",
	"5mr", "5pr", "5sr",
}

// ActionMeta describes one legal Mortal action index.
type ActionMeta struct {
	ID    int
	Label string
	Type  string
	Pai   string // majsoul-style tile when applicable
}

// ActionMetaForIndex returns display metadata for a Mortal action index (0–45).
func ActionMetaForIndex(id int) ActionMeta {
	switch {
	case id >= 0 && id <= 36:
		mj := mjaiTileAtActionIndex[id]
		return ActionMeta{
			ID:    id,
			Label: mjaiTileToMajsoul(mj),
			Type:  "dahai",
			Pai:   mjaiTileToMajsoul(mj),
		}
	case id == 37:
		return ActionMeta{ID: id, Label: "立直", Type: "reach"}
	case id == 38:
		return ActionMeta{ID: id, Label: "吃(低)", Type: "chi"}
	case id == 39:
		return ActionMeta{ID: id, Label: "吃(中)", Type: "chi"}
	case id == 40:
		return ActionMeta{ID: id, Label: "吃(高)", Type: "chi"}
	case id == 41:
		return ActionMeta{ID: id, Label: "碰", Type: "pon"}
	case id == 42:
		return ActionMeta{ID: id, Label: "杠", Type: "kan"}
	case id == 43:
		return ActionMeta{ID: id, Label: "荣和", Type: "hora"}
	case id == 44:
		return ActionMeta{ID: id, Label: "流局", Type: "ryukyoku"}
	case id == 45:
		return ActionMeta{ID: id, Label: "跳过", Type: "none"}
	default:
		return ActionMeta{ID: id, Label: "?", Type: "unknown"}
	}
}

// MaskBitsFromMeta reads u64 mask_bits from Mortal meta.
func MaskBitsFromMeta(meta map[string]interface{}) uint64 {
	if meta == nil {
		return 0
	}
	switch v := meta["mask_bits"].(type) {
	case float64:
		return uint64(v)
	case int:
		return uint64(v)
	case int64:
		return uint64(v)
	case uint64:
		return v
	default:
		return 0
	}
}

// LegalActionIndices lists action indices set in mask_bits (ascending).
func LegalActionIndices(mask uint64) []int {
	var out []int
	for i := 0; i < ActionSpace; i++ {
		if mask&(uint64(1)<<uint(i)) != 0 {
			out = append(out, i)
		}
	}
	return out
}

// actionIndexForTile finds discard action index for an mjai tile string.
func actionIndexForTile(mjaiTile string) (int, bool) {
	t := strings.TrimSpace(mjaiTile)
	for i := 0; i < 37; i++ {
		if mjaiTileAtActionIndex[i] == t {
			return i, true
		}
	}
	// deaka red five in reaction
	switch t {
	case "5m":
		return 34, true
	case "5p":
		return 35, true
	case "5s":
		return 36, true
	}
	return -1, false
}

// ChosenActionIndex maps Mortal's actual reaction to an action index (-1 if unknown).
func ChosenActionIndex(r Reaction) int {
	switch r.Type {
	case "dahai":
		if idx, ok := actionIndexForTile(r.Pai); ok {
			return idx
		}
	case "reach":
		return 37
	case "chi":
		return pickChiIndex(r)
	case "pon":
		return 41
	case "daiminkan", "ankan", "kakan":
		return 42
	case "hora":
		return 43
	case "ryukyoku":
		return 44
	case "none":
		return 45
	}
	return -1
}

func pickChiIndex(r Reaction) int {
	// Mortal does not expose which chi slot in meta; default to mid if unknown.
	_ = r
	return 39
}

// compactIndex returns position of actionID in mask-ordered q_values slice.
func compactIndex(mask uint64, actionID int) int {
	if actionID < 0 || actionID >= ActionSpace {
		return -1
	}
	if mask&(uint64(1)<<uint(actionID)) == 0 {
		return -1
	}
	idx := 0
	for i := 0; i < actionID; i++ {
		if mask&(uint64(1)<<uint(i)) != 0 {
			idx++
		}
	}
	return idx
}

// BuildOptionsForHumanAction labels mask/q_values and marks the action the human actually took.
func BuildOptionsForHumanAction(meta map[string]interface{}, humanActionID int) ([]DecisionOption, int) {
	qvals := QValuesFromMeta(meta)
	mask := MaskBitsFromMeta(meta)
	if len(qvals) == 0 || mask == 0 {
		return nil, -1
	}
	chosenCompact := compactIndex(mask, humanActionID)
	if chosenCompact < 0 {
		chosenCompact = argmaxQ(qvals)
	}
	return buildOptionsFromMask(mask, qvals, chosenCompact), chosenCompact
}

// BuildOptionsFromReaction expands compact q_values with mask_bits and marks Mortal's reaction (debug).
func BuildOptionsFromReaction(r Reaction, meta map[string]interface{}) ([]DecisionOption, int) {
	qvals := QValuesFromMeta(meta)
	mask := MaskBitsFromMeta(meta)
	if len(qvals) == 0 || mask == 0 {
		return nil, -1
	}

	chosenAction := ChosenActionIndex(r)
	chosenCompact := compactIndex(mask, chosenAction)
	if chosenCompact < 0 || chosenCompact >= len(qvals) {
		chosenCompact = argmaxQ(qvals)
	}
	return buildOptionsFromMask(mask, qvals, chosenCompact), chosenCompact
}

func buildOptionsFromMask(mask uint64, qvals []float64, chosenCompact int) []DecisionOption {
	pis := PiTau(qvals, 1)
	linearScores := NormalizeTurnScores(qvals, chosenCompact)
	var opts []DecisionOption
	qi := 0
	for i := 0; i < ActionSpace; i++ {
		if mask&(uint64(1)<<uint(i)) == 0 {
			continue
		}
		if qi >= len(qvals) {
			break
		}
		am := ActionMetaForIndex(i)
		opts = append(opts, DecisionOption{
			ActionID: am.ID,
			Label:    am.Label,
			Type:     am.Type,
			Pai:      am.Pai,
			Q:        qvals[qi],
			Pi:       pis[qi],
			Score:    linearScores[qi],
			Chosen:   qi == chosenCompact,
		})
		qi++
	}
	return opts
}

// HumanActionIndexForEvent maps the mjai event we are about to apply to an action index.
func HumanActionIndexForEvent(evType string, evMap map[string]interface{}, mask uint64) (int, bool) {
	switch evType {
	case "dahai":
		return actionIndexForTile(toString(evMap["pai"]))
	case "reach":
		return 37, true
	case "chi":
		if id, ok := soleChiInMask(mask); ok {
			return id, true
		}
		return 39, true // fallback: mid chi
	case "pon":
		return 41, true
	case "daiminkan", "ankan", "kakan":
		return 42, true
	case "hora":
		return 43, true
	case "ryukyoku":
		return 44, true
	default:
		return -1, false
	}
}

func soleChiInMask(mask uint64) (int, bool) {
	found := -1
	for _, id := range []int{38, 39, 40} {
		if mask&(uint64(1)<<uint(id)) == 0 {
			continue
		}
		if found >= 0 {
			return -1, false
		}
		found = id
	}
	if found < 0 {
		return -1, false
	}
	return found, true
}

func argmaxQ(qvals []float64) int {
	if len(qvals) == 0 {
		return 0
	}
	best, idx := qvals[0], 0
	for i, q := range qvals[1:] {
		if q > best {
			best, idx = q, i+1
		}
	}
	return idx
}

// NormalizeTurnScores maps q_values to 0–100; when all Q equal, only chosen gets 100.
func NormalizeTurnScores(qvals []float64, chosenIdx int) []int {
	if len(qvals) == 0 {
		return nil
	}
	minQ, maxQ := qvals[0], qvals[0]
	for _, q := range qvals[1:] {
		if q < minQ {
			minQ = q
		}
		if q > maxQ {
			maxQ = q
		}
	}
	out := make([]int, len(qvals))
	span := maxQ - minQ
	if span < 1e-9 {
		for i := range out {
			out[i] = 0
		}
		if chosenIdx >= 0 && chosenIdx < len(out) {
			out[chosenIdx] = 100
		} else if len(out) == 1 {
			out[0] = 100
		}
		return out
	}
	for i, q := range qvals {
		out[i] = int(math.Round((q - minQ) / span * 100))
	}
	return out
}
