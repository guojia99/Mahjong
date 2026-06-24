package mortal

import "mahjong-backend/models"

func ActionsFromPaipuData(pd models.JSONField) []map[string]interface{} {
	if pd.IsNil() {
		return nil
	}
	pdMap := pd.AsMap()
	if pdMap == nil {
		return nil
	}
	actions := pdMap["actions"]
	if actions == nil {
		if nested, ok := pdMap["majsoul_record_detail"].(map[string]interface{}); ok {
			actions = nested["actions"]
		}
	}
	arr, ok := actions.([]interface{})
	if !ok {
		return nil
	}
	result := make([]map[string]interface{}, 0, len(arr))
	for _, a := range arr {
		if m, ok := a.(map[string]interface{}); ok {
			result = append(result, m)
		}
	}
	return result
}

func paipuPlayersList(pd models.JSONField) []interface{} {
	if pd.IsNil() {
		return nil
	}
	pdMap := pd.AsMap()
	if pdMap == nil {
		return nil
	}
	var pl interface{}
	if nested, ok := pdMap["majsoul_record_detail"].(map[string]interface{}); ok {
		pl = nested["players"]
	}
	if pl == nil {
		pl = pdMap["players"]
	}
	arr, ok := pl.([]interface{})
	if !ok {
		return nil
	}
	return arr
}

// PaipuAccountIDsBySeat maps majsoul seat 0–3 to accountId from stored paipu JSON.
func PaipuAccountIDsBySeat(pd models.JSONField) map[int]int64 {
	out := map[int]int64{}
	for _, p := range paipuPlayersList(pd) {
		m, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		seat := toInt(m["seat"])
		if seat < 0 || seat > 3 {
			continue
		}
		uid := toInt64(m["accountId"])
		if uid == 0 {
			uid = toInt64(m["account_id"])
		}
		if uid > 0 {
			out[seat] = uid
		}
	}
	return out
}

func PlayerNamesFromPaipu(pd models.JSONField) [4]string {
	names := [4]string{"P0", "P1", "P2", "P3"}
	for _, p := range paipuPlayersList(pd) {
		m, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		seat := toInt(m["seat"])
		if seat < 0 || seat > 3 {
			continue
		}
		nick := ""
		if v, ok := m["nickName"].(string); ok && v != "" {
			nick = v
		} else if v, ok := m["nickname"].(string); ok && v != "" {
			nick = v
		}
		if nick != "" {
			names[seat] = nick
		}
	}
	return names
}

func toInt(v interface{}) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	}
	return 0
}

func toInt64(v interface{}) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int:
		return int64(x)
	case int64:
		return x
	}
	return 0
}

func toBool(v interface{}) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	}
	return false
}

func toString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func stringSlice(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func endsWith(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}
