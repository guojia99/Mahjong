package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveConfigPath(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "db_config.json")
	if err := os.WriteFile(cfg, []byte(`{"database":{"sqlite_path":"x.db"}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	orig, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)
	t.Cleanup(func() { _ = os.Chdir(orig) })

	if got := ResolveConfigPath("db_config.json"); got != "db_config.json" {
		t.Fatalf("got %q want db_config.json", got)
	}
	if got := ResolveConfigPath(filepath.Join("backend", "db_config.json")); got != "db_config.json" {
		t.Fatalf("backend/db_config.json from backend/ cwd: got %q want db_config.json", got)
	}
}
