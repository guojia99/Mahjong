package mortal

import (
	"encoding/json"
	"fmt"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

// AnalyzeGame runs Mortal review for all 4 seats and returns JSON-ready result.
func AnalyzeGame(gameID string, pd models.JSONField, client *Client, gradeTiers []GradeTier) (*AnalysisResult, error) {
	if client == nil {
		url := "http://127.0.0.1:9996"
		if config.Cfg != nil && config.Cfg.MortalBaseURL != "" {
			url = config.Cfg.MortalBaseURL
		}
		client = NewClient(url)
	}
	if err := client.Health(); err != nil {
		return nil, fmt.Errorf("mortal not reachable: %w", err)
	}
	info, err := client.Info()
	if err != nil {
		return nil, err
	}
	if info.PlayerID != 0 {
		return nil, fmt.Errorf("mortal player_id must be 0 (got %d); restart mortal with MORTAL_PLAYER_ID=0", info.PlayerID)
	}

	actions := ActionsFromPaipuData(pd)
	if len(actions) == 0 {
		return nil, fmt.Errorf("no paipu actions")
	}
	names := PlayerNamesFromPaipu(pd)
	if len(gradeTiers) == 0 {
		gradeTiers = DefaultGradeTiers()
	}

	result := &AnalysisResult{
		Version:  AnalysisVersion,
		ModelTag: info.ModelTag,
		Players:  make([]PlayerAnalysis, 0, 4),
	}

	for perspective := 0; perspective < 4; perspective++ {
		events, err := BuildMjaiEvents(actions, perspective, names)
		if err != nil {
			return nil, fmt.Errorf("game %s seat %d build mjai: %w", gameID, perspective, err)
		}
		gid := fmt.Sprintf("%s-s%d", gameID, perspective)
		_ = client.ResetGame(gid)

		kyokuIdx := -1
		var kyokus []KyokuAnalysis
		var cur *KyokuAnalysis
		var matchScores []int
		var pending *pendingHumanDecision

		for _, ev := range events {
			var evMap map[string]interface{}
			_ = json.Unmarshal([]byte(ev.JSON), &evMap)
			evType, _ := evMap["type"].(string)
			actor, _ := evMap["actor"].(int)

			if evType == "start_kyoku" {
				kyokuIdx++
				cur = &KyokuAnalysis{KyokuIndex: kyokuIdx, Decisions: []DecisionRecord{}}
				kyokus = append(kyokus, *cur)
				cur = &kyokus[len(kyokus)-1]
				pending = nil
			}

			// Score human action before applying this event (q_values are from previous react).
			if actor == 0 && pending != nil {
				if rec := resolvePendingHumanDecision(pending, evType, evMap, ev, cur, gradeTiers); rec != nil {
					matchScores = append(matchScores, rec.ChosenScore)
					pending = nil
				}
			}

			reactions, err := client.React(gid, []string{ev.JSON})
			if err != nil {
				return nil, fmt.Errorf("game %s seat %d react %s (action %d): %w", gameID, perspective, evType, ev.ActionIndex, err)
			}

			for _, r := range reactions {
				if r.Actor != 0 {
					continue
				}
				if len(QValuesFromMeta(r.Meta)) == 0 {
					continue
				}
				// Mortal's dahai on tsumo: wait for the human discard event in the log.
				if r.Type == "dahai" {
					pending = &pendingHumanDecision{
						meta:        r.Meta,
						actionIndex: ev.ActionIndex,
						kind:        ev.Kind,
						expectType:  "dahai",
					}
					continue
				}
				// Pass on a call (only none / skip legal).
				if r.Type == "none" && countMaskedActions(MaskBitsFromMeta(r.Meta)) <= 2 {
					if rec := recordImmediateHumanDecision(r.Meta, 45, ev, cur, gradeTiers); rec != nil {
						matchScores = append(matchScores, rec.ChosenScore)
					}
					continue
				}
				// Chi / pon / hora: wait for the human's call event.
				pending = &pendingHumanDecision{
					meta:        r.Meta,
					actionIndex: ev.ActionIndex,
					kind:        ev.Kind,
					expectType:  r.Type,
				}
			}
		}

		matchAvg := 0
		if len(matchScores) > 0 {
			matchAvg = AvgInt(matchScores)
		}

		for i := range kyokus {
			if len(kyokus[i].Decisions) == 0 {
				kyokus[i].Avg = 0
				kyokus[i].Grade = GradeForScore(0, gradeTiers)
			}
		}

		result.Players = append(result.Players, PlayerAnalysis{
			Seat:       perspective,
			MatchAvg:   matchAvg,
			MatchGrade: GradeForScore(float64(matchAvg), gradeTiers),
			Kyoku:      kyokus,
		})
	}

	return result, nil
}

type pendingHumanDecision struct {
	meta        map[string]interface{}
	actionIndex int
	kind        string
	expectType  string
}

func countMaskedActions(mask uint64) int {
	n := 0
	for i := 0; i < ActionSpace; i++ {
		if mask&(uint64(1)<<uint(i)) != 0 {
			n++
		}
	}
	return n
}

func resolvePendingHumanDecision(
	p *pendingHumanDecision,
	evType string,
	evMap map[string]interface{},
	ev builtEvent,
	cur *KyokuAnalysis,
	gradeTiers []GradeTier,
) *DecisionRecord {
	mask := MaskBitsFromMeta(p.meta)
	humanID, ok := HumanActionIndexForEvent(evType, evMap, mask)
	if !ok {
		return nil
	}
	return recordImmediateHumanDecision(p.meta, humanID, ev, cur, gradeTiers)
}

func recordImmediateHumanDecision(
	meta map[string]interface{},
	humanActionID int,
	ev builtEvent,
	cur *KyokuAnalysis,
	gradeTiers []GradeTier,
) *DecisionRecord {
	opts, chosenCompact := BuildOptionsForHumanAction(meta, humanActionID)
	if len(opts) == 0 {
		return nil
	}
	qvals := QValuesFromMeta(meta)
	chosen := opts[chosenCompact]
	chosenScore := FAQTurnScore(qvals, chosenCompact)

	rec := &DecisionRecord{
		ActionIndex: ev.ActionIndex,
		Kind:        ev.Kind,
		ChosenLabel: chosen.Label,
		ChosenScore: chosenScore,
		ChosenPi:    chosen.Pi,
		Options:     opts,
	}
	if cur != nil {
		cur.Decisions = append(cur.Decisions, *rec)
		var kyScores []int
		for _, d := range cur.Decisions {
			kyScores = append(kyScores, d.ChosenScore)
		}
		cur.Avg = AvgInt(kyScores)
		cur.Grade = GradeForScore(float64(cur.Avg), gradeTiers)
	}
	return rec
}

// ToJSONField converts analysis to models.JSONField.
func ToJSONField(a *AnalysisResult) (models.JSONField, error) {
	b, err := json.Marshal(a)
	if err != nil {
		return models.JSONField{}, err
	}
	return models.JSONField(string(b)), nil
}
