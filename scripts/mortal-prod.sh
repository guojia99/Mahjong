#!/usr/bin/env bash
# Install/remove systemd units for each mortal-server/*.toml (mahjong-mortal-<port>.service).
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"
MORTAL_DIR="${MORTAL_DIR:-$ROOT_DIR/mortal-server}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-}"

# shellcheck source=mortal-configs.sh
source "$SCRIPT_DIR/mortal-configs.sh"

usage() {
	echo "Usage: $0 <install|remove>" >&2
	exit 1
}

require_linux() {
	[ "$(uname -s)" = "Linux" ] || { echo "Linux only" >&2; exit 1; }
	command -v systemctl >/dev/null 2>&1 || { echo "systemctl not found" >&2; exit 1; }
}

require_sudo() {
	if [ "$(id -u)" -eq 0 ]; then
		SUDO=""
	else
		command -v sudo >/dev/null 2>&1 || { echo "sudo required" >&2; exit 1; }
		SUDO="sudo"
	fi
}

resolve_run_user() {
	RUN_USER="$(stat -c '%U' "$ROOT_DIR")"
	RUN_GROUP="$(stat -c '%G' "$ROOT_DIR")"
}

unit_name_for_port() {
	echo "mahjong-mortal-${1}"
}

write_mortal_unit() {
	local unit_path="$1"
	local port="$2"
	local cfg="$3"
	cat >"$unit_path" <<EOF
[Unit]
Description=Mahjong Mortal AI inference (:${port}, ${cfg})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${ROOT_DIR}/mortal-server
Environment=PYTHON=${ROOT_DIR}/.venv/bin/python
Environment=MORTAL_PORT=${port}
Environment=MORTAL_CFG=${cfg}
ExecStart=${ROOT_DIR}/mortal-server/start.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

remove_unit() {
	local name="$1"
	if $SUDO systemctl is-active --quiet "${name}.service" 2>/dev/null; then
		echo "  Stopping ${name}.service..."
		$SUDO systemctl stop "${name}.service"
	fi
	if $SUDO systemctl is-enabled --quiet "${name}.service" 2>/dev/null; then
		$SUDO systemctl disable "${name}.service" 2>/dev/null || true
	fi
	if [ -f "/etc/systemd/system/${name}.service" ]; then
		$SUDO rm -f "/etc/systemd/system/${name}.service"
	fi
}

remove_legacy() {
	remove_unit "mahjong-mortal"
}

cmd_install() {
	require_linux
	require_sudo
	resolve_run_user

	if [ ! -x "$ROOT_DIR/.venv/bin/python" ]; then
		echo "Missing .venv — run: make venv" >&2
		exit 1
	fi
	if [ ! -x "$ROOT_DIR/mortal-server/start.sh" ]; then
		echo "Missing mortal-server/start.sh" >&2
		exit 1
	fi

	local n
	n="$(mortal_config_count "$MORTAL_DIR")"
	if [ "$n" = "0" ]; then
		echo "No mortal-server/*.toml — add config.toml or config-PORT.toml" >&2
		exit 1
	fi

	remove_legacy

	echo "Installing $n Mortal systemd unit(s) (user=${RUN_USER})..."
	local port cfg name tmp_unit failed=0
	mortal_foreach_config "$MORTAL_DIR" _install_one || failed=1
	$SUDO systemctl daemon-reload
	if [ "$failed" != "0" ]; then
		exit 1
	fi
	echo ""
	echo "Installed:"
	mortal_foreach_config "$MORTAL_DIR" _print_installed
	echo "  Logs: journalctl -u mahjong-mortal-<port>.service -f"
	echo "  Stop: make mortal-prod-stop"
}

_install_one() {
	local port="$1"
	local cfg="$2"
	local name tmp_unit
	name="$(unit_name_for_port "$port")"
	tmp_unit="$(mktemp)"
	write_mortal_unit "$tmp_unit" "$port" "$cfg"
	$SUDO cp "$tmp_unit" "/etc/systemd/system/${name}.service"
	rm -f "$tmp_unit"
	$SUDO systemctl enable "${name}.service" >/dev/null
	$SUDO systemctl restart "${name}.service"
	sleep 1
	if $SUDO systemctl is-active --quiet "${name}.service"; then
		echo "  ${name}.service  :${port}  ${cfg}  OK"
	else
		echo "  ${name}.service  :${port}  ${cfg}  FAILED" >&2
		$SUDO systemctl status "${name}.service" --no-pager || true
		return 1
	fi
}

_print_installed() {
	printf '    %-24s :%s  %s\n' "$(unit_name_for_port "$1").service" "$1" "$2"
}

cmd_remove() {
	require_linux
	require_sudo
	echo "Removing Mortal systemd units..."
	remove_legacy
	local f name
	for f in /etc/systemd/system/mahjong-mortal-*.service; do
		[ -f "$f" ] || continue
		name="$(basename "$f" .service)"
		remove_unit "$name"
		echo "  removed ${name}.service"
	done
	$SUDO systemctl daemon-reload
	echo "Mortal prod services removed."
}

case "$ACTION" in
install) cmd_install ;;
remove) cmd_remove ;;
*) usage ;;
esac
