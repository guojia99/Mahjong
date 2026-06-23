package majsoulpaipu

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const defaultRateLimitPerMinute = 20

// AuthConfig holds Majsoul login credentials for paipu.js.
type AuthConfig struct {
	Account         string
	Password        string
	AccessToken     string
	OAuth2Type      int // CN web token login, default 1
	LoginRequestB64 string // replay browser WS login request frame
}

// Client calls backend/majsoul_node/paipu.js (same as legacy Django service).
type Client struct {
	NodeBin    string
	ScriptPath string
	WorkDir    string
	Auth       AuthConfig
}

// NewClientFromConfig builds a client; configPath is db_config.json (used to locate majsoul_node).
// Prefer majsoul_access_token when set.
func NewClientFromConfig(configPath string, auth AuthConfig) (*Client, error) {
	nodeDir, script, err := ResolveNodeDir(configPath)
	if err != nil {
		return nil, err
	}
	nodeBin, err := ResolveNodeBin()
	if err != nil {
		return nil, err
	}

	auth = auth.withEnvFallback()
	if auth.LoginRequestB64 == "" && auth.AccessToken == "" &&
		(auth.Account == "" || auth.Password == "") {
		return nil, fmt.Errorf(
			"majsoul login not configured: set majsoul_login_request_b64, majsoul_access_token, " +
				"or majsoul_account + majsoul_password in db_config.json",
		)
	}
	if auth.OAuth2Type <= 0 {
		auth.OAuth2Type = 1
	}

	return &Client{
		NodeBin:    nodeBin,
		ScriptPath: script,
		WorkDir:    nodeDir,
		Auth:       auth,
	}, nil
}

func (a AuthConfig) withEnvFallback() AuthConfig {
	if strings.TrimSpace(a.AccessToken) == "" {
		a.AccessToken = strings.TrimSpace(os.Getenv("MAJSOUL_ACCESS_TOKEN"))
	}
	if strings.TrimSpace(a.Account) == "" {
		a.Account = strings.TrimSpace(os.Getenv("MAJSOUL_ACCOUNT"))
	}
	if strings.TrimSpace(a.Password) == "" {
		a.Password = strings.TrimSpace(os.Getenv("MAJSOUL_PASSWORD"))
	}
	if strings.TrimSpace(a.LoginRequestB64) == "" {
		a.LoginRequestB64 = strings.TrimSpace(os.Getenv("MAJSOUL_LOGIN_REQUEST_B64"))
	}
	if a.OAuth2Type <= 0 {
		if v := strings.TrimSpace(os.Getenv("MAJSOUL_OAUTH2_TYPE")); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				a.OAuth2Type = n
			}
		}
	}
	return a
}

func (c *Client) nodeEnv() []string {
	env := os.Environ()
	if c.Auth.LoginRequestB64 != "" {
		env = append(env, "MAJSOUL_LOGIN_REQUEST_B64="+c.Auth.LoginRequestB64)
	}
	if c.Auth.AccessToken != "" {
		env = append(env, "MAJSOUL_ACCESS_TOKEN="+c.Auth.AccessToken)
		env = append(env, fmt.Sprintf("MAJSOUL_OAUTH2_TYPE=%d", c.Auth.OAuth2Type))
	}
	if v := os.Getenv("MAJSOUL_CURRENCY_PLATFORMS"); v != "" {
		env = append(env, "MAJSOUL_CURRENCY_PLATFORMS="+v)
	}
	if v := os.Getenv("MAJSOUL_TAG"); v != "" {
		env = append(env, "MAJSOUL_TAG="+v)
	}
	return env
}

// FetchRecords calls Node with --detail when detail is true.
func (c *Client) FetchRecords(paipuInputs []string, detail bool) ([]map[string]interface{}, error) {
	if c == nil {
		return nil, fmt.Errorf("nil majsoul paipu client")
	}
	waitRateLimit()
	uuids, err := ResolvePaipuUUIDs(paipuInputs)
	if err != nil {
		return nil, err
	}
	listJSON, err := json.Marshal(uuids)
	if err != nil {
		return nil, err
	}
	args := []string{c.ScriptPath}
	if detail {
		args = append(args, "--detail")
	}
	args = append(args, string(listJSON))
	// Pass account/password when set so paipu.js can fall back from stale oauth2 token.
	if c.Auth.Account != "" && c.Auth.Password != "" {
		args = append(args, c.Auth.Account, c.Auth.Password)
	} else if c.Auth.LoginRequestB64 == "" && c.Auth.AccessToken == "" {
		args = append(args, c.Auth.Account, c.Auth.Password)
	}

	cmd := exec.Command(c.NodeBin, args...)
	cmd.Dir = c.WorkDir
	cmd.Env = c.nodeEnv()
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("paipu.js failed: %s", extractNodeError(out, err))
	}
	output := strings.TrimSpace(string(out))
	if output == "" {
		return nil, fmt.Errorf("paipu.js produced no output")
	}
	var data interface{}
	if err := json.Unmarshal([]byte(output), &data); err != nil {
		return nil, fmt.Errorf("paipu.js returned invalid JSON: %w", err)
	}
	if m, ok := data.(map[string]interface{}); ok {
		if errMsg, ok := m["error"].(string); ok && errMsg != "" {
			return nil, fmt.Errorf("%s", errMsg)
		}
	}
	list, ok := data.([]interface{})
	if !ok {
		return nil, fmt.Errorf("paipu.js returned unexpected type %T", data)
	}
	records := make([]map[string]interface{}, 0, len(list))
	for _, item := range list {
		rec, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		records = append(records, rec)
	}
	return records, nil
}

func extractNodeError(out []byte, execErr error) string {
	s := strings.TrimSpace(string(out))
	if s == "" && execErr != nil {
		return execErr.Error()
	}
	// Node main() prints JSON error on stderr
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "{") {
			continue
		}
		var m map[string]interface{}
		if json.Unmarshal([]byte(line), &m) == nil {
			if msg, ok := m["error"].(string); ok && msg != "" {
				return msg
			}
		}
	}
	if s != "" {
		return s
	}
	if execErr != nil {
		return execErr.Error()
	}
	return "unknown error"
}

// FetchDetail is shorthand for a single --detail record fetch.
func (c *Client) FetchDetail(paipuInput string) (map[string]interface{}, error) {
	records, err := c.FetchRecords([]string{paipuInput}, true)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("no paipu record returned")
	}
	return records[0], nil
}

var rateTimestamps []time.Time
var rateLimitPerMinute = defaultRateLimitPerMinute

func waitRateLimit() {
	limit := rateLimitPerMinute
	if v := os.Getenv("MAJSOUL_RATE_LIMIT_PER_MINUTE"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			limit = n
		}
	}
	now := time.Now()
	window := time.Minute
	cutoff := now.Add(-window)
	i := 0
	for i < len(rateTimestamps) {
		if rateTimestamps[i].Before(cutoff) {
			i++
			continue
		}
		break
	}
	rateTimestamps = rateTimestamps[i:]
	if len(rateTimestamps) >= limit {
		sleep := rateTimestamps[0].Add(window).Sub(now) + 100*time.Millisecond
		if sleep > 0 {
			time.Sleep(sleep)
		}
		now = time.Now()
		cutoff = now.Add(-window)
		i = 0
		for i < len(rateTimestamps) && rateTimestamps[i].Before(cutoff) {
			i++
		}
		rateTimestamps = rateTimestamps[i:]
	}
	rateTimestamps = append(rateTimestamps, time.Now())
}
