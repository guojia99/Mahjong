#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
bash "$REPO_ROOT/scripts/select-libriichi.sh"

if [ ! -f "config.toml" ]; then
    echo "Error: config.toml not found"
    exit 1
fi

HOST="${MORTAL_HOST:-0.0.0.0}"
PORT="${MORTAL_PORT:-9996}"
PLAYER_ID="${MORTAL_PLAYER_ID:-0}"

echo "Starting Mortal inference server..."
echo "  host: $HOST:$PORT"
echo "  player_id: $PLAYER_ID"
echo "  config: config.toml"

export MORTAL_CFG="$SCRIPT_DIR/config.toml"

# Prefer repo-root .venv (created by `make venv` / `make mortal` / `make dev`).
PYTHON="${PYTHON:-}"
if [ -z "$PYTHON" ] && [ -x "$REPO_ROOT/.venv/bin/python" ]; then
    PYTHON="$REPO_ROOT/.venv/bin/python"
elif [ -z "$PYTHON" ] && [ -n "${VIRTUAL_ENV:-}" ] && [ -x "$VIRTUAL_ENV/bin/python" ]; then
    PYTHON="$VIRTUAL_ENV/bin/python"
elif [ -z "$PYTHON" ]; then
    echo "Error: no .venv found at $REPO_ROOT/.venv — run: make venv" >&2
    exit 1
fi

if [ ! -x "$PYTHON" ]; then
    echo "Error: python not executable: $PYTHON" >&2
    exit 1
fi

VENV_PREFIX="$("$PYTHON" -c 'import sys; print(sys.prefix)' 2>/dev/null || echo unknown)"
echo "  python: $PYTHON"
echo "  sys.prefix: $VENV_PREFIX"

exec "$PYTHON" serve.py --host "$HOST" --port "$PORT" --player-id "$PLAYER_ID"
