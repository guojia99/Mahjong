package mortal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Cooldown after each Mortal API call (except /health): short on success, long on failure.
const (
	requestCooldownSuccess = 1 * time.Millisecond
	requestCooldownFailure = 3 * time.Second
)

type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewClient(baseURL string) *Client {
	if baseURL == "" {
		baseURL = "http://127.0.0.1:9996"
	}
	return &Client{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

func (c *Client) pauseAfterRequest(success bool) {
	if success {
		time.Sleep(requestCooldownSuccess)
	} else {
		time.Sleep(requestCooldownFailure)
	}
}

func (c *Client) Health() error {
	resp, err := c.HTTPClient.Get(c.BaseURL + "/health")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("mortal health: status %d", resp.StatusCode)
	}
	return nil
}

type InfoResponse struct {
	PlayerID int    `json:"player_id"`
	ModelTag string `json:"model_tag"`
}

func (c *Client) Info() (info *InfoResponse, err error) {
	ok := false
	defer func() { c.pauseAfterRequest(ok) }()
	resp, err := c.HTTPClient.Get(c.BaseURL + "/info")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mortal info: %s", string(body))
	}
	var parsed InfoResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	ok = true
	return &parsed, nil
}

type ReactRequest struct {
	GameID string   `json:"game_id"`
	Events []string `json:"events"`
}

type Reaction struct {
	Type      string                 `json:"type"`
	Actor     int                    `json:"actor"`
	Pai       string                 `json:"pai"`
	Tsumogiri bool                   `json:"tsumogiri"`
	Meta      map[string]interface{} `json:"meta"`
}

type ReactResponse struct {
	Reactions []Reaction `json:"reactions"`
}

func (c *Client) React(gameID string, events []string) (reactions []Reaction, err error) {
	ok := false
	defer func() { c.pauseAfterRequest(ok) }()
	reqBody, _ := json.Marshal(ReactRequest{GameID: gameID, Events: events})
	resp, err := c.HTTPClient.Post(c.BaseURL+"/react", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mortal react: %s", string(body))
	}
	var out ReactResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	ok = true
	return out.Reactions, nil
}

func (c *Client) ResetGame(gameID string) (err error) {
	ok := false
	defer func() { c.pauseAfterRequest(ok) }()
	reqBody, _ := json.Marshal(map[string]string{"game_id": gameID, "action": "reset"})
	resp, err := c.HTTPClient.Post(c.BaseURL+"/game", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mortal reset: %s", string(b))
	}
	ok = true
	return nil
}

func QValuesFromMeta(meta map[string]interface{}) []float64 {
	if meta == nil {
		return nil
	}
	raw, ok := meta["q_values"]
	if !ok {
		return nil
	}
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]float64, 0, len(arr))
	for _, v := range arr {
		switch x := v.(type) {
		case float64:
			out = append(out, x)
		case float32:
			out = append(out, float64(x))
		}
	}
	return out
}
