#!/usr/bin/env bash
# Mortal inference — local development.
# Scans mortal-server/*.toml and starts one process per config (port from filename).
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
MORTAL_DIR="${MORTAL_DIR:-$ROOT_DIR/mortal-server}"
VENV_PYTHON="${VENV_PYTHON:-$ROOT_DIR/.venv/bin/python}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# shellcheck source=mortal-configs.sh
source "$SCRIPT_DIR/mortal-configs.sh"

ACTION="${1:-}"

usage() {
	cat <<EOF
Usage: $0 <start|stop|status|list>

Auto-discovers mortal-server/*.toml (not *.toml.example):
  config.toml      → port ${MORTAL_DEFAULT_PORT:-9996}
  config-9995.toml → port 9995

Per-instance env (optional, single-instance only):
  MORTAL_PORT, MORTAL_CFG
EOF
	exit 1
}

pid_file_for_port() {
	echo "/tmp/mahjong_mortal_dev_${1}.pid"
}

log_file_for_port() {
	echo "/tmp/mahjong_mortal_dev_${1}.log"
}

port_listener_pids() {
	lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

is_pid_alive() {
	local pid="$1"
	[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

free_port() {
	local port="$1"
	local pids
	pids="$(port_listener_pids "$port")"
	if [ -z "$pids" ]; then
		return 0
	fi
	echo "Releasing :$port (pid $pids)..."
	kill -TERM $pids 2>/dev/null || true
	sleep 1
	pids="$(port_listener_pids "$port")"
	if [ -n "$pids" ]; then
		kill -KILL $pids 2>/dev/null || true
		sleep 0.5
	fi
}

start_one() {
	local port="$1"
	local cfg="$2"
	local pid_file log_file old_pid
	pid_file="$(pid_file_for_port "$port")"
	log_file="$(log_file_for_port "$port")"

	if [ ! -f "$MORTAL_DIR/$cfg" ]; then
		echo "Missing $MORTAL_DIR/$cfg" >&2
		return 1
	fi

	old_pid=""
	[ -f "$pid_file" ] && old_pid="$(cat "$pid_file")"
	if is_pid_alive "$old_pid"; then
		echo "  :$port already running (pid $old_pid, $cfg)"
		return 0
	fi
	rm -f "$pid_file"

	free_port "$port"

	cd "$MORTAL_DIR"
	nohup env \
		MORTAL_DEV=1 \
		PYTHON="$VENV_PYTHON" \
		MORTAL_PORT="$port" \
		MORTAL_CFG="$cfg" \
		./start.sh >>"$log_file" 2>&1 </dev/null &
	echo $! >"$pid_file"
	sleep 2
	if is_pid_alive "$(cat "$pid_file" 2>/dev/null || true)"; then
		echo "  :$port started (pid $(cat "$pid_file"), $cfg)"
		echo "    curl http://127.0.0.1:$port/health"
	else
		echo "  :$port failed — see $log_file" >&2
		rm -f "$pid_file"
		return 1
	fi
}

stop_one() {
	local port="$1"
	local cfg="$2"
	local pid_file pid
	pid_file="$(pid_file_for_port "$port")"
	pid=""
	[ -f "$pid_file" ] && pid="$(cat "$pid_file")"
	if is_pid_alive "$pid"; then
		echo "  Stopping :$port (pid $pid, $cfg)..."
		kill -TERM "$pid" 2>/dev/null || true
		sleep 1
		is_pid_alive "$pid" && kill -KILL "$pid" 2>/dev/null || true
	fi
	rm -f "$pid_file"
	free_port "$port"
}

status_one() {
	local port="$1"
	local cfg="$2"
	local pid_file pid listeners
	pid_file="$(pid_file_for_port "$port")"
	pid=""
	[ -f "$pid_file" ] && pid="$(cat "$pid_file")"
	listeners="$(port_listener_pids "$port")"
	if is_pid_alive "$pid"; then
		echo "  :$port running (pid $pid, $cfg)"
	elif [ -n "$listeners" ]; then
		echo "  :$port in use (pid $listeners, $cfg) — not tracked"
	else
		echo "  :$port stopped ($cfg)"
	fi
}

cmd_list() {
	echo "Mortal configs in $MORTAL_DIR:"
	local n
	n="$(mortal_config_count "$MORTAL_DIR")"
	if [ "$n" = "0" ]; then
		echo "  (none — add config.toml or copy config-9995.toml.example → config-9995.toml)"
		return 1
	fi
	mortal_foreach_config "$MORTAL_DIR" _list_line
}

_list_line() {
	printf '  :%-5s  %s\n' "$1" "$2"
}

cmd_start() {
	if [ ! -x "$VENV_PYTHON" ]; then
		echo "Missing $VENV_PYTHON — run: make venv" >&2
		exit 1
	fi
	if [ -n "${MORTAL_CFG:-}" ] && [ -n "${MORTAL_PORT:-}" ]; then
		echo "Starting mortal-dev (single)..."
		start_one "$MORTAL_PORT" "$MORTAL_CFG"
		return
	fi
	local n
	n="$(mortal_config_count "$MORTAL_DIR")"
	if [ "$n" = "0" ]; then
		echo "No mortal-server/*.toml found." >&2
		echo "  cp mortal-server/config-9995.toml.example mortal-server/config-9995.toml" >&2
		exit 1
	fi
	echo "Starting mortal-dev ($n instance(s))..."
	local failed=0
	mortal_foreach_config "$MORTAL_DIR" _start_cb || failed=1
	[ "$failed" = "0" ] || exit 1
}

_start_cb() {
	start_one "$1" "$2" || return 1
}

cmd_stop() {
	if [ -n "${MORTAL_CFG:-}" ] && [ -n "${MORTAL_PORT:-}" ]; then
		stop_one "$MORTAL_PORT" "$MORTAL_CFG"
		return
	fi
	echo "Stopping mortal-dev..."
	mortal_foreach_config "$MORTAL_DIR" stop_one || true
	for f in /tmp/mahjong_mortal_dev_*.pid; do
		[ -f "$f" ] || continue
		local port="${f##*_}"
		port="${port%.pid}"
		stop_one "$port" "(orphan)" 2>/dev/null || true
	done
	echo "mortal-dev stopped."
}

cmd_status() {
	local n
	n="$(mortal_config_count "$MORTAL_DIR")"
	if [ "$n" = "0" ]; then
		echo "No mortal-server/*.toml configured."
		return 1
	fi
	echo "mortal-dev status ($n config(s)):"
	mortal_foreach_config "$MORTAL_DIR" status_one
}

case "$ACTION" in
start) cmd_start ;;
stop) cmd_stop ;;
status) cmd_status ;;
list) cmd_list ;;
*) usage ;;
esac
