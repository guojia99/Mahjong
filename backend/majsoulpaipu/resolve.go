package majsoulpaipu

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ResolveNodeDir finds backend/majsoul_node from the db_config.json location.
// configPath may be relative (e.g. "db_config.json" from backend/).
func ResolveNodeDir(configPath string) (nodeDir string, scriptPath string, err error) {
	if env := os.Getenv("MAJSOUL_NODE_DIR"); env != "" {
		abs, err := filepath.Abs(env)
		if err != nil {
			return "", "", err
		}
		script := filepath.Join(abs, "paipu.js")
		if _, err := os.Stat(script); err != nil {
			return "", "", fmt.Errorf("paipu.js not found at %s", script)
		}
		return abs, script, nil
	}

	absConfig, err := filepath.Abs(configPath)
	if err != nil {
		return "", "", err
	}
	dir := filepath.Dir(absConfig)
	for i := 0; i < 5; i++ {
		candidate := filepath.Join(dir, "majsoul_node")
		script := filepath.Join(candidate, "paipu.js")
		if _, err := os.Stat(script); err == nil {
			return candidate, script, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", "", fmt.Errorf(
		"paipu.js not found (searched upward from %s); use -c backend/db_config.json or set MAJSOUL_NODE_DIR",
		filepath.Dir(absConfig),
	)
}

// ResolveNodeBin returns the Node.js executable for paipu.js.
// Override with MAJSOUL_NODE_BIN; otherwise looks up "node", then "nodejs".
func ResolveNodeBin() (string, error) {
	if bin := strings.TrimSpace(os.Getenv("MAJSOUL_NODE_BIN")); bin != "" {
		if _, err := os.Stat(bin); err != nil {
			return "", fmt.Errorf("MAJSOUL_NODE_BIN=%q: %w", bin, err)
		}
		return bin, nil
	}
	for _, name := range []string{"node", "nodejs"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf(
		"node executable not found in PATH (install Node.js 18+ and run: cd backend/majsoul_node && npm install; " +
			"or set MAJSOUL_NODE_BIN to the full path)",
	)
}
