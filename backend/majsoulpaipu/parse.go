package majsoulpaipu

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

var (
	paipuUUIDPattern = regexp.MustCompile(`^[a-zA-Z0-9]{6}-[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
	paipuUUIDPrefix  = regexp.MustCompile(`([a-zA-Z0-9]{6}-[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})`)
	paipuURLPattern  = regexp.MustCompile(`paipu[=\\]*([a-zA-Z0-9\-_]+)`)
)

// UnescapeShellURL removes zsh/bash escapes like \? and \= from pasted URLs.
func UnescapeShellURL(s string) string {
	s = strings.ReplaceAll(s, `\?`, `?`)
	s = strings.ReplaceAll(s, `\=`, `=`)
	s = strings.ReplaceAll(s, `\&`, `&`)
	return s
}

// NormalizeInputURL extracts a single http(s) token from pasted text.
func NormalizeInputURL(raw string) string {
	s := UnescapeShellURL(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	for _, needle := range []string{"https://", "http://"} {
		idx := strings.Index(lower, needle)
		if idx == -1 {
			continue
		}
		tail := strings.TrimSpace(s[idx:])
		parts := strings.Fields(tail)
		token := tail
		if len(parts) > 0 {
			token = parts[0]
		}
		token = strings.TrimRight(token, ".,;；，。）)")
		return token
	}
	return s
}

// ExtractUUID returns the paipu uuid from a URL or bare uuid string.
func ExtractUUID(raw string) string {
	if raw == "" {
		return ""
	}
	s := UnescapeShellURL(strings.TrimSpace(raw))
	if paipuUUIDPattern.MatchString(s) {
		return s
	}
	if m := paipuUUIDPrefix.FindStringSubmatch(s); len(m) >= 2 {
		return m[1]
	}
	for _, candidate := range []string{s, NormalizeInputURL(s)} {
		if candidate == "" {
			continue
		}
		m := paipuURLPattern.FindStringSubmatch(candidate)
		if len(m) >= 2 {
			return strings.Split(m[1], "_")[0]
		}
	}
	return ""
}

// ResolvePaipuUUIDs normalizes CLI/API inputs to Majsoul game uuids for paipu.js.
func ResolvePaipuUUIDs(inputs []string) ([]string, error) {
	out := make([]string, 0, len(inputs))
	for _, in := range inputs {
		u := ExtractUUID(in)
		if u == "" {
			return nil, fmt.Errorf("cannot parse paipu uuid from %q", in)
		}
		out = append(out, u)
	}
	return out, nil
}

// PlayerRow is a normalized seat for API responses.
type PlayerRow struct {
	Seat     int
	UID      int64
	Nickname string
	Score    int
}

// AnalyzeResult matches the legacy Django analyze_paipu_url payload.
type AnalyzeResult struct {
	UUID         string
	StartTime    string
	EndTime      string
	GameMode     string
	PlayerCount  int
	Players      []PlayerRow
	RawData      map[string]interface{}
}

func pointToTableHundred(finalPoint interface{}) int {
	if finalPoint == nil {
		return 0
	}
	var v float64
	switch x := finalPoint.(type) {
	case float64:
		v = x
	case int:
		v = float64(x)
	case int64:
		v = float64(x)
	default:
		return 0
	}
	return int(math.Round(v / 100.0))
}

func normalizeNodePlayersSummary(playersList []interface{}) []PlayerRow {
	out := make([]PlayerRow, 0, len(playersList))
	for seat, item := range playersList {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		uid := intFromAny(m["accountId"])
		if uid == 0 {
			uid = intFromAny(m["account_id"])
		}
		if uid == 0 {
			continue
		}
		name, _ := m["nickName"].(string)
		if name == "" {
			name, _ = m["nickname"].(string)
		}
		fp := m["finalPoint"]
		if fp == nil {
			fp = m["final_point"]
		}
		out = append(out, PlayerRow{
			Seat:     seat,
			UID:      int64(uid),
			Nickname: truncate(name, 200),
			Score:    pointToTableHundred(fp),
		})
	}
	return out
}

func normalizeNodePlayersFromDetail(rec map[string]interface{}) []PlayerRow {
	players, _ := rec["players"].([]interface{})
	resultPlayers, _ := rec["result"].(map[string]interface{})
	rPlayers, _ := resultPlayers["players"].([]interface{})
	seatToPR := make(map[int]map[string]interface{})
	for _, item := range rPlayers {
		m, ok := item.(map[string]interface{})
		if !ok || m["seat"] == nil {
			continue
		}
		seatToPR[intFromAny(m["seat"])] = m
	}
	out := make([]PlayerRow, 0, len(players))
	for _, item := range players {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		uid := intFromAny(m["accountId"])
		if uid == 0 {
			uid = intFromAny(m["account_id"])
		}
		if uid == 0 {
			continue
		}
		seat := intFromAny(m["seat"])
		name, _ := m["nickName"].(string)
		if name == "" {
			name, _ = m["nickname"].(string)
		}
		pr := seatToPR[seat]
		fp := interface{}(nil)
		if pr != nil {
			fp = pr["part_point_1"]
		}
		out = append(out, PlayerRow{
			Seat:     seat,
			UID:      int64(uid),
			Nickname: truncate(name, 200),
			Score:    pointToTableHundred(fp),
		})
	}
	sortPlayerRows(out)
	return out
}

func sortPlayerRows(rows []PlayerRow) {
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].Seat < rows[i].Seat {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
}

func normalizePlayersFromRecord(rec map[string]interface{}) []PlayerRow {
	players, _ := rec["players"].([]interface{})
	if len(players) == 0 {
		return nil
	}
	first, _ := players[0].(map[string]interface{})
	if first == nil {
		return nil
	}
	if _, ok := first["finalPoint"]; ok {
		return normalizeNodePlayersSummary(players)
	}
	if _, ok := first["final_point"]; ok {
		return normalizeNodePlayersSummary(players)
	}
	if _, ok := first["accountId"]; ok {
		return normalizeNodePlayersFromDetail(rec)
	}
	if _, ok := first["account_id"]; ok {
		return normalizeNodePlayersFromDetail(rec)
	}
	return normalizeNodePlayersSummary(players)
}

// ValidateDetailRecord checks Node --detail JSON structure.
func ValidateDetailRecord(rec map[string]interface{}, expectedUUID string) (bool, []string) {
	var errors []string
	if rec == nil {
		return false, []string{"record_not_object"}
	}
	if errVal, ok := rec["error"]; ok && errVal != nil && errVal != "" {
		return false, []string{"record_has_error_field"}
	}
	if expectedUUID != "" {
		got, _ := rec["uuid"].(string)
		if got != "" && got != expectedUUID {
			errors = append(errors, fmt.Sprintf("uuid_mismatch expected=%q got=%q", expectedUUID, got))
		}
	}
	acts, hasActs := rec["actions"]
	if !hasActs || acts == nil {
		errors = append(errors, "actions_missing")
	} else if list, ok := acts.([]interface{}); !ok {
		errors = append(errors, "actions_not_list")
	} else if len(list) == 0 {
		errors = append(errors, "actions_empty")
	} else {
		for i, a := range list {
			m, ok := a.(map[string]interface{})
			if !ok {
				errors = append(errors, fmt.Sprintf("action_%d_not_object", i))
				continue
			}
			if name, _ := m["name"].(string); name == "" {
				errors = append(errors, fmt.Sprintf("action_%d_missing_name", i))
			}
			if _, ok := m["step"]; !ok {
				errors = append(errors, fmt.Sprintf("action_%d_missing_step", i))
			}
			if _, ok := m["data"]; !ok {
				errors = append(errors, fmt.Sprintf("action_%d_missing_data", i))
			}
		}
	}
	pl, _ := rec["players"].([]interface{})
	if len(pl) == 0 {
		errors = append(errors, "players_missing_or_invalid")
	}
	return len(errors) == 0, errors
}

// BuildRecordDetailBlob is stored under Game.paipu_data.majsoul_record_detail.
func BuildRecordDetailBlob(rec map[string]interface{}, validationOK bool, validationErrors []string) map[string]interface{} {
	return map[string]interface{}{
		"version":            1,
		"fetched_at":         time.Now().UTC().Format(time.RFC3339),
		"validation_ok":      validationOK,
		"validation_errors":  append([]string(nil), validationErrors...),
		"uuid":               rec["uuid"],
		"start_time":         rec["start_time"],
		"end_time":           rec["end_time"],
		"players":            rec["players"],
		"result":             rec["result"],
		"actions":            rec["actions"],
	}
}

func detectGameMode(uuidVal string) string {
	if uuidVal == "" {
		return "half_match"
	}
	prefix := uuidVal
	if i := strings.Index(uuidVal, "-"); i > 0 {
		prefix = uuidVal[:i]
	} else if len(uuidVal) > 0 {
		prefix = uuidVal[:1]
	}
	modeMap := map[string]string{
		"1": "half_match", "2": "half_match", "3": "east_wind",
		"4": "east_wind", "5": "east_wind", "6": "half_match",
	}
	if len(prefix) > 0 {
		if m, ok := modeMap[prefix[:1]]; ok {
			return m
		}
	}
	return "half_match"
}

func timestampToStr(ts interface{}) string {
	if ts == nil {
		return ""
	}
	sec := int64FromAny(ts)
	if sec == 0 {
		return ""
	}
	return time.Unix(sec, 0).In(time.Local).Format("2006-01-02 15:04")
}

// TimestampToTime converts Unix seconds from Node detail JSON to local time.
func TimestampToTime(ts interface{}) *time.Time {
	if ts == nil {
		return nil
	}
	sec := int64FromAny(ts)
	if sec == 0 {
		return nil
	}
	t := time.Unix(sec, 0).In(time.Local)
	return &t
}

// AnalyzeURL fetches --detail for one paipu link and returns API-ready metadata.
func AnalyzeURL(client *Client, sourceURL string) (*AnalyzeResult, error) {
	url := NormalizeInputURL(sourceURL)
	if url == "" {
		return nil, fmt.Errorf("empty or invalid paipu URL")
	}
	paipuUUID := ExtractUUID(url)
	if paipuUUID == "" {
		paipuUUID = url
	}
	records, err := client.FetchRecords([]string{url}, true)
	if err != nil {
		return nil, fmt.Errorf("paipu fetch failed: %w", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("no paipu data returned; check the link")
	}
	rec := records[0]
	if errMsg, _ := rec["error"].(string); errMsg != "" {
		return nil, fmt.Errorf("%s", errMsg)
	}
	valid, valErrors := ValidateDetailRecord(rec, paipuUUID)
	players := normalizePlayersFromRecord(rec)
	if len(players) == 0 {
		return nil, fmt.Errorf("no valid player rows parsed")
	}
	n := len(players)
	uuidOut, _ := rec["uuid"].(string)
	if uuidOut == "" {
		uuidOut = paipuUUID
	}
	startVal := rec["start_time"]
	endVal := rec["end_time"]
	rawData := map[string]interface{}{
		"source":             "majsoul_local_node",
		"detail":             true,
		"url":                url,
		"uuid":               rec["uuid"],
		"start_time":         startVal,
		"end_time":           endVal,
		"players":            rec["players"],
		"result":             rec["result"],
		"actions":            rec["actions"],
		"validation_ok":      valid,
		"validation_errors":  valErrors,
	}
	return &AnalyzeResult{
		UUID:        truncate(uuidOut, 80),
		StartTime:   timestampToStr(startVal),
		EndTime:     timestampToStr(endVal),
		GameMode:    detectGameMode(uuidOut),
		PlayerCount: n,
		Players:     players,
		RawData:     rawData,
	}, nil
}

// DetailJSON returns the raw Node --detail record (for CLI pretty output).
func DetailJSON(client *Client, sourceURL string) (map[string]interface{}, error) {
	url := NormalizeInputURL(sourceURL)
	if url == "" {
		return nil, fmt.Errorf("empty or invalid paipu URL")
	}
	rec, err := client.FetchDetail(url)
	if err != nil {
		return nil, err
	}
	if errMsg, _ := rec["error"].(string); errMsg != "" {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return rec, nil
}

func intFromAny(v interface{}) int {
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

func int64FromAny(v interface{}) int64 {
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

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
