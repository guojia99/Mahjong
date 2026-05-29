#!/usr/bin/env bash
# Build libriichi from Rust source and install into mortal-server/lib/<platform>/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${VENV:-$ROOT/.venv}"
PY="${PY:-$VENV/bin/python}"
LIBRIICHI_SRC="${LIBRIICHI_SRC:-$ROOT/libriichi}"
MORTAL_DIR="$ROOT/mortal-server"

# shellcheck source=libriichi-lib.sh
source "$ROOT/scripts/libriichi-lib.sh"

if [ ! -f "$LIBRIICHI_SRC/Cargo.toml" ]; then
	echo "Error: libriichi source not found at $LIBRIICHI_SRC" >&2
	echo "  Symlink or copy from Mortal: ln -s /path/to/Mortal/libriichi $ROOT/libriichi" >&2
	echo "  Or set LIBRIICHI_SRC=/path/to/Mortal/libriichi make build-libriichi" >&2
	exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
	echo "Error: cargo not found — install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" >&2
	exit 1
fi

if [ ! -x "$PY" ]; then
	echo "Error: Python venv missing at $PY — run: make venv" >&2
	exit 1
fi

subdir="$(libriichi_subdir)" || {
	echo "Error: unsupported platform $(uname -s)-$(uname -m)" >&2
	exit 1
}

echo "Building libriichi from $LIBRIICHI_SRC (PYO3_PYTHON=$PY)"
export PYO3_PYTHON="$PY"

build_args=(--lib --release)
if ! (cd "$LIBRIICHI_SRC" && cargo build "${build_args[@]}"); then
	echo "Retrying without mimalloc..."
	(cd "$LIBRIICHI_SRC" && cargo build --lib --release --no-default-features --features pymod)
fi

artifact=""
for candidate in \
	"$LIBRIICHI_SRC/target/release/libriichi.so" \
	"$LIBRIICHI_SRC/target/release/libriichi.dylib"; do
	if [ -f "$candidate" ]; then
		artifact="$candidate"
		break
	fi
done

if [ -z "$artifact" ]; then
	echo "Error: build finished but libriichi artifact not found under $LIBRIICHI_SRC/target/release" >&2
	exit 1
fi

if ! libriichi_is_valid "$artifact"; then
	echo "Error: built artifact is not valid for this platform: $artifact" >&2
	file "$artifact" || true
	exit 1
fi

dest_dir="$MORTAL_DIR/lib/$subdir"
mkdir -p "$dest_dir"
cp "$artifact" "$dest_dir/libriichi.so"
cp "$artifact" "$MORTAL_DIR/libriichi.so"

echo "Built libriichi installed to:"
echo "  $dest_dir/libriichi.so"
echo "  $MORTAL_DIR/libriichi.so"

cd "$MORTAL_DIR"
"$PY" -c "import libriichi; print('libriichi import ok')"
