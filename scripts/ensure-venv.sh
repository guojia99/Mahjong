#!/usr/bin/env bash
# Create repo-root .venv and install mortal-server Python deps (Tsinghua PyPI mirror).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
REQ="$ROOT/mortal-server/requirements.txt"
STAMP="$VENV/.mortal-deps.stamp"
PIP_INDEX="https://pypi.tuna.tsinghua.edu.cn/simple"

verify_imports() {
  (
    cd "$ROOT/mortal-server"
    "$VENV/bin/python" -c "
import prelude
from common import filtered_trimmed_lines
from libriichi.mjai import Bot
import tqdm
print('mortal-server imports ok')
"
  )
}

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 not found" >&2
  exit 1
fi

if [ ! -d "$VENV" ]; then
  echo "Creating virtualenv at $VENV"
  python3 -m venv "$VENV"
fi

REQ_HASH=""
if [ -f "$REQ" ]; then
  REQ_HASH=$(shasum -a 256 "$REQ" 2>/dev/null | awk '{print $1}' || md5 -q "$REQ" 2>/dev/null || echo "unknown")
fi

if [ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$REQ_HASH" ]; then
  if verify_imports 2>/dev/null; then
    exit 0
  fi
  echo "Stamp matched but imports failed; reinstalling deps..."
fi

echo "Installing mortal-server dependencies into $VENV (mirror: $PIP_INDEX)"
"$VENV/bin/pip" install -U pip setuptools wheel -i "$PIP_INDEX"

# torch: prefer Tsinghua; fall back to official CPU wheels.
if ! "$VENV/bin/pip" install torch -i "$PIP_INDEX"; then
  echo "Retrying torch from PyTorch CPU wheel index..."
  "$VENV/bin/pip" install torch --index-url https://download.pytorch.org/whl/cpu
fi

"$VENV/bin/pip" install -r "$REQ" -i "$PIP_INDEX"

verify_imports
echo "$REQ_HASH" > "$STAMP"
echo "Python venv ready: $VENV/bin/python"
