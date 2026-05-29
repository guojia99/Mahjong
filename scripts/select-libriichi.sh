#!/usr/bin/env bash
# Copy the platform-matched libriichi.so into mortal-server/ for Python imports.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=libriichi-lib.sh
source "$ROOT/scripts/libriichi-lib.sh"

libriichi_install_bundled "$ROOT"
