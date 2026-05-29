#!/usr/bin/env bash
# Create repo-root .venv and install mortal-server Python deps (Tsinghua PyPI mirror).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
REQ="$ROOT/mortal-server/requirements.txt"
STAMP="$VENV/.mortal-deps.stamp"
PIP_INDEX="https://pypi.tuna.tsinghua.edu.cn/simple"
PY="$VENV/bin/python"

pip_cmd() {
	"$PY" -m pip "$@"
}

venv_python_ready() {
	[ -x "$PY" ]
}

venv_pip_ready() {
	venv_python_ready && "$PY" -m pip --version >/dev/null 2>&1
}

ensure_venv() {
	if ! command -v python3 >/dev/null 2>&1; then
		echo "Error: python3 not found" >&2
		exit 1
	fi

	if [ -d "$VENV" ] && ! venv_python_ready; then
		echo "Removing incomplete virtualenv at $VENV"
		rm -rf "$VENV"
	fi

	if [ ! -d "$VENV" ]; then
		echo "Creating virtualenv at $VENV"
		if ! python3 -m venv "$VENV"; then
			echo "Error: failed to create venv — install system package: python3-venv" >&2
			exit 1
		fi
	fi

	if ! venv_pip_ready; then
		echo "Bootstrapping pip in $VENV"
		if ! "$PY" -m ensurepip --upgrade 2>/dev/null; then
			echo "Error: pip missing in venv — install system packages: python3-venv python3-pip" >&2
			exit 1
		fi
	fi

	if ! venv_pip_ready; then
		echo "Error: pip still unavailable in $VENV" >&2
		exit 1
	fi
}

verify_imports() {
	bash "$ROOT/scripts/select-libriichi.sh"
	(
		cd "$ROOT/mortal-server"
		"$PY" -c "
import prelude
from common import filtered_trimmed_lines
from libriichi.mjai import Bot
import tqdm
print('mortal-server imports ok')
"
	)
}

ensure_venv

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
pip_cmd install -U pip setuptools wheel -i "$PIP_INDEX"

# torch: prefer Tsinghua; fall back to official CPU wheels.
if ! pip_cmd install torch -i "$PIP_INDEX"; then
	echo "Retrying torch from PyTorch CPU wheel index..."
	pip_cmd install torch --index-url https://download.pytorch.org/whl/cpu
fi

pip_cmd install -r "$REQ" -i "$PIP_INDEX"

verify_imports
echo "$REQ_HASH" > "$STAMP"
echo "Python venv ready: $PY"
