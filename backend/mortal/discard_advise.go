package mortal

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// MeldInput is one open meld from the discard-advise tool.
type MeldInput struct {
	Type string `json:"type"` // chi, pon, kan, ankan
	Name string `json:"name"` // majsoul tile e.g. 3m
	Red  bool   `json:"red,omitempty"`
}

// DiscardAdviseRequest is the tool input (hand excludes drawn tile).
type DiscardAdviseRequest struct {
	Hand  []string    `json:"hand"`
	Melds []MeldInput `json:"melds"`
	Drawn string      `json:"drawn"`
	Dora  []string    `json:"dora"`
}

// DiscardAdviseOption is one legal discard candidate with Mortal scores.
type DiscardAdviseOption struct {
	ActionID int     `json:"action_id"`
	Label    string  `json:"label"`
	Type     string  `json:"type"`
	Pai      string  `json:"pai,omitempty"`
	Q        float64 `json:"q"`
	Pi       float64 `json:"pi"`
	Score    int     `json:"score"`
	Best     bool    `json:"best"`
}

// DiscardAdviseResult is the Mortal reaction expanded for the tool UI.
type DiscardAdviseResult struct {
	ModelKey  string                `json:"model_key"`
	ModelName string                `json:"model_name"`
	ModelTag  string                `json:"model_tag,omitempty"`
	Shanten   *int                  `json:"shanten,omitempty"`
	Options   []DiscardAdviseOption `json:"options"`
}

func eventJSON(ev map[string]interface{}) string {
	raw, _ := json.Marshal(ev)
	return string(raw)
}

func meldHandTiles(m MeldInput) []string {
	switch m.Type {
	case "chi":
		n := int(m.Name[0] - '0')
		suit := m.Name[1:]
		t0 := m.Name
		t1 := fmt.Sprintf("%d%s", n+1, suit)
		return []string{t0, t1}
	case "pon":
		return []string{m.Name, m.Name}
	case "kan":
		return []string{m.Name, m.Name, m.Name}
	case "ankan":
		if m.Red && len(m.Name) >= 2 && m.Name[0] == '5' {
			return []string{"0" + m.Name[1:], m.Name, m.Name, m.Name}
		}
		return []string{m.Name, m.Name, m.Name, m.Name}
	default:
		return nil
	}
}

func meldToMjaiEvents(m MeldInput, target int) (dahaiEv, meldEv map[string]interface{}) {
	switch m.Type {
	case "chi":
		n := int(m.Name[0] - '0')
		suit := m.Name[1:]
		t0 := majsoulTileToMjai(m.Name)
		t1 := majsoulTileToMjai(fmt.Sprintf("%d%s", n+1, suit))
		var pai string
		var consumed []string
		if m.Red {
			pai = majsoulTileToMjai("0" + suit)
			consumed = []string{t0, t1}
		} else {
			t2 := majsoulTileToMjai(fmt.Sprintf("%d%s", n+2, suit))
			pai = t2
			consumed = []string{t0, t1}
		}
		dahaiEv = map[string]interface{}{
			"type": "dahai", "actor": target, "pai": pai, "tsumogiri": false, "can_act": false,
		}
		meldEv = map[string]interface{}{
			"type": "chi", "actor": 0, "target": target, "pai": pai, "consumed": consumed, "can_act": false,
		}
	case "pon", "kan":
		pai := majsoulTileToMjai(m.Name)
		consumed := []string{pai, pai, pai}
		if m.Red && len(m.Name) >= 2 && m.Name[0] == '5' {
			consumed = []string{majsoulTileToMjai("0" + m.Name[1:]), pai, pai}
		}
		dahaiEv = map[string]interface{}{
			"type": "dahai", "actor": target, "pai": pai, "tsumogiri": false, "can_act": false,
		}
		typ := "pon"
		if m.Type == "kan" {
			typ = "daiminkan"
		}
		meldEv = map[string]interface{}{
			"type": typ, "actor": 0, "target": target, "pai": pai, "consumed": consumed, "can_act": false,
		}
	case "ankan":
		tiles := meldHandTiles(m)
		consumed := make([]string, len(tiles))
		for i, t := range tiles {
			consumed[i] = majsoulTileToMjai(t)
		}
		meldEv = map[string]interface{}{
			"type": "ankan", "actor": 0, "consumed": consumed, "can_act": false,
		}
	}
	return dahaiEv, meldEv
}

func tileCounts(tiles []string) map[string]int {
	c := map[string]int{}
	for _, t := range tiles {
		c[t]++
	}
	return c
}

func deduceDiscardedTiles(have []string, need int) ([]string, error) {
	if need <= 0 {
		return nil, nil
	}
	counts := tileCounts(have)
	candidates := []string{}
	for _, row := range [][]string{
		{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m"},
		{"1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p"},
		{"1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s"},
		{"1z", "2z", "3z", "4z", "5z", "6z", "7z"},
	} {
		candidates = append(candidates, row...)
	}
	sort.Slice(candidates, func(i, j int) bool {
		ci, cj := counts[candidates[i]], counts[candidates[j]]
		if ci != cj {
			return ci < cj
		}
		return candidates[i] < candidates[j]
	})
	out := make([]string, 0, need)
	for _, t := range candidates {
		if len(out) >= need {
			break
		}
		if counts[t] >= 4 {
			continue
		}
		out = append(out, t)
	}
	if len(out) < need {
		return nil, fmt.Errorf("cannot reconstruct discard history for melded hand")
	}
	return out, nil
}

// BuildDiscardAdviseEvents builds mjai events ending with a tsumo that triggers discard advice.
func BuildDiscardAdviseEvents(req DiscardAdviseRequest) ([]string, error) {
	hand := append([]string{}, req.Hand...)
	drawn := strings.TrimSpace(req.Drawn)
	if drawn == "" {
		return nil, fmt.Errorf("drawn tile required")
	}
	if len(req.Dora) == 0 {
		return nil, fmt.Errorf("at least one dora indicator required")
	}
	melds := req.Melds
	if melds == nil {
		melds = []MeldInput{}
	}
	if len(hand)+len(melds)*3+1 != 14 {
		return nil, fmt.Errorf("hand + melds + drawn must total 14 tiles (got %d)", len(hand)+len(melds)*3+1)
	}

	meldFromHand := []string{}
	for _, m := range melds {
		meldFromHand = append(meldFromHand, meldHandTiles(m)...)
	}
	tehai := append(append([]string{}, hand...), meldFromHand...)
	if len(tehai) > 13 {
		return nil, fmt.Errorf("too many tiles to fit initial deal")
	}
	discarded, err := deduceDiscardedTiles(tehai, 13-len(tehai))
	if err != nil {
		return nil, err
	}
	tehai = append(tehai, discarded...)
	tehaiMjai := majsoulTilesToMjai(tehai)

	hidden := make([]string, 13)
	for i := range hidden {
		hidden[i] = "?"
	}
	tehais := [][]string{tehaiMjai, hidden, hidden, hidden}

	doraMarker := majsoulTileToMjai(req.Dora[0])
	if doraMarker == "" {
		return nil, fmt.Errorf("invalid dora indicator")
	}

	events := []string{
		eventJSON(map[string]interface{}{
			"type":  "start_game",
			"names": []string{"You", "B", "C", "D"},
		}),
		eventJSON(map[string]interface{}{
			"type":        "start_kyoku",
			"bakaze":      "E",
			"dora_marker": doraMarker,
			"kyoku":       1,
			"honba":       0,
			"kyotaku":     0,
			"oya":         1,
			"scores":      []int{25000, 25000, 25000, 25000},
			"tehais":      tehais,
		}),
	}

	target := 1
	for _, m := range melds {
		dahaiEv, meldEv := meldToMjaiEvents(m, target)
		if dahaiEv != nil {
			events = append(events, eventJSON(dahaiEv))
		}
		if meldEv != nil {
			events = append(events, eventJSON(meldEv))
		}
		if m.Type != "ankan" {
			target++
			if target > 3 {
				target = 1
			}
		}
	}
	for _, t := range discarded {
		events = append(events, eventJSON(map[string]interface{}{
			"type": "dahai", "actor": 0, "pai": majsoulTileToMjai(t), "tsumogiri": false, "can_act": false,
		}))
	}
	for _, d := range req.Dora[1:] {
		marker := majsoulTileToMjai(d)
		if marker == "" {
			return nil, fmt.Errorf("invalid dora indicator %q", d)
		}
		events = append(events, eventJSON(map[string]interface{}{
			"type": "dora", "dora_marker": marker,
		}))
	}
	events = append(events, eventJSON(map[string]interface{}{
		"type": "tsumo", "actor": 0, "pai": majsoulTileToMjai(drawn),
	}))
	return events, nil
}

// AdviseDiscard calls Mortal and returns discard options (dahai + reach when legal).
func AdviseDiscard(client *Client, gameID string, req DiscardAdviseRequest, modelKey, modelName string) (*DiscardAdviseResult, error) {
	events, err := BuildDiscardAdviseEvents(req)
	if err != nil {
		return nil, err
	}
	_ = client.ResetGame(gameID)
	reactions, err := client.React(gameID, events)
	if err != nil {
		return nil, err
	}
	if len(reactions) == 0 {
		return nil, fmt.Errorf("mortal returned no reaction")
	}

	var meta map[string]interface{}
	var bestIdx int
	opts := []DiscardAdviseOption{}
	for _, r := range reactions {
		if r.Actor != 0 {
			continue
		}
		meta = r.Meta
		built, chosen := BuildOptionsFromReaction(r, r.Meta)
		for i := range built {
			if built[i].Type != "dahai" && built[i].Type != "reach" {
				continue
			}
			opts = append(opts, DiscardAdviseOption{
				ActionID: built[i].ActionID,
				Label:    built[i].Label,
				Type:     built[i].Type,
				Pai:      built[i].Pai,
				Q:        built[i].Q,
				Pi:       built[i].Pi,
				Score:    built[i].Score,
				Best:     built[i].Chosen,
			})
			if built[i].Chosen {
				bestIdx = i
			}
		}
		_ = bestIdx
		_ = chosen
	}
	if len(opts) == 0 {
		return nil, fmt.Errorf("no discard options from mortal")
	}
	sort.Slice(opts, func(i, j int) bool {
		if opts[i].Score != opts[j].Score {
			return opts[i].Score > opts[j].Score
		}
		return opts[i].ActionID < opts[j].ActionID
	})
	for i := range opts {
		opts[i].Best = i == 0
	}

	out := &DiscardAdviseResult{
		ModelKey:  modelKey,
		ModelName: modelName,
		Options:   opts,
	}
	if meta != nil {
		if tag, ok := meta["model_tag"].(string); ok {
			out.ModelTag = tag
		}
		if sh, ok := meta["shanten"].(float64); ok {
			v := int(sh)
			out.Shanten = &v
		}
	}
	return out, nil
}
