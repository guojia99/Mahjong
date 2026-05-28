#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
    Darwin)
        if [ "$ARCH" = "arm64" ]; then
            LIB_DIR="lib/darwin_arm64"
        else
            LIB_DIR="lib/darwin_amd64"
            echo "Warning: darwin_amd64 not bundled, attempting darwin_arm64"
            LIB_DIR="lib/darwin_arm64"
        fi
        ;;
    Linux)
        if [ "$ARCH" = "x86_64" ]; then
            LIB_DIR="lib/linux_amd64"
        else
            echo "Error: unsupported architecture $ARCH on Linux"
            exit 1
        fi
        ;;
    *)
        echo "Error: unsupported OS $OS"
        exit 1
        ;;
esac

if [ ! -f "$LIB_DIR/libriichi.so" ]; then
    echo "Error: $LIB_DIR/libriichi.so not found"
    exit 1
fi

cp "$LIB_DIR/libriichi.so" ./libriichi.so

if [ ! -f "config.toml" ]; then
    echo "Error: config.toml not found"
    exit 1
fi

HOST="${MORTAL_HOST:-127.0.0.1}"
PORT="${MORTAL_PORT:-9996}"
PLAYER_ID="${MORTAL_PLAYER_ID:-0}"

echo "Starting Mortal inference server..."
echo "  host: $HOST:$PORT"
echo "  player_id: $PLAYER_ID"
echo "  config: config.toml"

export MORTAL_CFG="$SCRIPT_DIR/config.toml"
exec python3 serve.py --host "$HOST" --port "$PORT" --player-id "$PLAYER_ID"
