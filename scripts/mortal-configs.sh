#!/usr/bin/env bash
# Discover mortal-server/*.toml and map filename → port.
#   config.toml       → 9996
#   config-9995.toml  → 9995
# Skips *.toml.example (copy to *.toml first).
set -euo pipefail

MORTAL_DEFAULT_PORT="${MORTAL_DEFAULT_PORT:-9996}"

# mortal_port_from_basename "config-9995" → 9995
mortal_port_from_basename() {
	local stem="$1"
	if [ "$stem" = "config" ]; then
		echo "$MORTAL_DEFAULT_PORT"
		return 0
	fi
	if [[ "$stem" =~ -([0-9]+)$ ]]; then
		echo "${BASH_REMATCH[1]}"
		return 0
	fi
	return 1
}

# mortal_port_from_file /path/to/mortal-server/config-9995.toml
mortal_port_from_file() {
	local path="$1"
	local base
	base="$(basename "$path" .toml)"
	mortal_port_from_basename "$base"
}

# Prints lines: PORT<TAB>CFG_BASENAME (sorted by port numerically)
mortal_list_configs() {
	local dir="${1:-}"
	if [ -z "$dir" ]; then
		echo "mortal_list_configs: missing directory" >&2
		return 1
	fi
	local f stem port
	for f in "$dir"/*.toml; do
		[ -f "$f" ] || continue
		stem="$(basename "$f" .toml)"
		if ! port="$(mortal_port_from_basename "$stem")"; then
			echo "skip: $(basename "$f") (no port suffix; use config.toml or name-PORT.toml)" >&2
			continue
		fi
		printf '%s\t%s\n' "$port" "$(basename "$f")"
	done | sort -t$'\t' -k1,1n
}

# mortal_foreach_config DIR callback(port, cfg_basename) — returns 1 if any callback fails
mortal_foreach_config() {
	local dir="$1"
	local callback="$2"
	local port cfg rc=0
	while IFS=$'\t' read -r port cfg; do
		[ -n "$port" ] || continue
		if ! "$callback" "$port" "$cfg"; then
			rc=1
		fi
	done < <(mortal_list_configs "$dir")
	return "$rc"
}

mortal_config_count() {
	mortal_list_configs "${1:-}" | wc -l | tr -d ' '
}
