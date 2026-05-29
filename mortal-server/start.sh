#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
bash "$REPO_ROOT/scripts/select-libriichi.sh"

MORTAL_CFG_FILE="${MORTAL_CFG:-config.toml}"
if [ "${MORTAL_CFG_FILE#/}" = "$MORTAL_CFG_FILE" ]; then
    MORTAL_CFG_FILE="$SCRIPT_DIR/$MORTAL_CFG_FILE"
fi
if [ ! -f "$MORTAL_CFG_FILE" ]; then
    echo "Error: config not found: $MORTAL_CFG_FILE"
    exit 1
fi

HOST="${MORTAL_HOST:-0.0.0.0}"
PORT="${MORTAL_PORT:-9996}"
PLAYER_ID="${MORTAL_PLAYER_ID:-0}"

if [ "${MORTAL_DEV:-}" = "1" ]; then
	echo "Starting Mortal inference server [dev]..."
else
	echo "Starting Mortal inference server..."
fi
echo "  host: $HOST:$PORT"
echo "  player_id: $PLAYER_ID"
echo "  config: $MORTAL_CFG_FILE"

export MORTAL_CFG="$MORTAL_CFG_FILE"

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

exec "$PYTHON" serve.py --host "$HOST" --port "$PORT" --player-id "$PLAYER_ID" --config "$MORTAL_CFG"
