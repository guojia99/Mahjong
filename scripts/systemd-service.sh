#!/usr/bin/env bash
# Install or remove Linux systemd units for Mahjong production / Mortal AI.
# Usage: systemd-service.sh <prod|mortal> <install|remove>
set -euo pipefail

SERVICE_KIND="${1:-}"
ACTION="${2:-}"

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-9997}"
GATEWAY_PORT="${GATEWAY_PORT:-9999}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
PROD_LOG="${PROD_LOG:-$LOG_DIR/mahjong-prod.log}"

usage() {
	echo "Usage: $0 <prod|mortal> <install|remove>" >&2
	exit 1
}

require_linux() {
	if [ "$(uname -s)" != "Linux" ]; then
		echo "systemd service is Linux-only (current OS: $(uname -s))" >&2
		exit 1
	fi
	if ! command -v systemctl >/dev/null 2>&1; then
		echo "systemctl not found; is systemd available?" >&2
		exit 1
	fi
}

require_sudo() {
	if [ "$(id -u)" -eq 0 ]; then
		SUDO=""
	else
		if ! command -v sudo >/dev/null 2>&1; then
			echo "sudo is required to manage systemd services" >&2
			exit 1
		fi
		SUDO="sudo"
	fi
}

service_name() {
	case "$SERVICE_KIND" in
	prod) echo "mahjong-prod" ;;
	mortal) echo "mahjong-mortal" ;;
	*) usage ;;
	esac
}

resolve_run_user() {
	# Use project directory owner — avoids SUDO_USER=ubuntu + project in /root/ CHDIR failures.
	RUN_USER="$(stat -c '%U' "$ROOT_DIR")"
	RUN_GROUP="$(stat -c '%G' "$ROOT_DIR")"
}

assert_dir_access() {
	local dir="$1"
	if [ ! -d "$dir" ]; then
		echo "Directory missing: $dir" >&2
		exit 1
	fi
	if [ "$(id -u)" -eq 0 ]; then
		if ! runuser -u "$RUN_USER" -- test -d "$dir" 2>/dev/null; then
			echo "User $RUN_USER cannot access: $dir" >&2
			exit 1
		fi
	elif ! sudo -u "$RUN_USER" test -d "$dir" 2>/dev/null; then
		echo "User $RUN_USER cannot access: $dir" >&2
		exit 1
	fi
}

# Resolve Node.js for majsoul_node/paipu.js (systemd has a minimal PATH).
# Override detection when running make prod: MAJSOUL_NODE_BIN=/path/to/node make prod
resolve_node_bin() {
	local bin=""

	if [ -n "${MAJSOUL_NODE_BIN:-}" ] && [ -x "${MAJSOUL_NODE_BIN}" ]; then
		echo "${MAJSOUL_NODE_BIN}"
		return 0
	fi

	for bin in "$(command -v node 2>/dev/null)" "$(command -v nodejs 2>/dev/null)"; do
		if [ -n "$bin" ] && [ -x "$bin" ]; then
			echo "$bin"
			return 0
		fi
	done

	local run_user_home
	run_user_home="$(getent passwd "$RUN_USER" 2>/dev/null | cut -d: -f6)"
	if [ -n "$run_user_home" ]; then
		if [ "$(id -u)" -eq 0 ]; then
			bin="$(runuser -u "$RUN_USER" -- bash -lc 'command -v node 2>/dev/null || command -v nodejs 2>/dev/null' 2>/dev/null || true)"
		else
			bin="$(sudo -u "$RUN_USER" bash -lc 'command -v node 2>/dev/null || command -v nodejs 2>/dev/null' 2>/dev/null || true)"
		fi
		if [ -n "$bin" ] && [ -x "$bin" ]; then
			echo "$bin"
			return 0
		fi

		local nvm_dir="${run_user_home}/.nvm/versions/node"
		local latest=""
		if [ -d "$nvm_dir" ]; then
			latest="$(ls -1d "${nvm_dir}"/*/bin/node 2>/dev/null | sort -V | tail -n1)"
			if [ -n "$latest" ] && [ -x "$latest" ]; then
				echo "$latest"
				return 0
			fi
		fi
	fi

	for bin in /usr/bin/node /usr/local/bin/node /usr/bin/nodejs; do
		if [ -x "$bin" ]; then
			echo "$bin"
			return 0
		fi
	done

	return 1
}

write_prod_unit() {
	local unit_path="$1"
	local node_env_line="${MAJSOUL_NODE_BIN_LINE:-}"
	mkdir -p "$LOG_DIR"
	cat >"$unit_path" <<EOF
[Unit]
Description=Mahjong Assistant (production)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
${node_env_line}
WorkingDirectory=${ROOT_DIR}/backend
ExecStart=${ROOT_DIR}/backend/mahjong-prodsupervisor \\
	--backend-bin ${ROOT_DIR}/backend/mahjong-backend \\
	--gateway-bin ${ROOT_DIR}/backend/mahjong-gateway \\
	--static-dir ${ROOT_DIR}/frontend/dist \\
	--config ${ROOT_DIR}/backend/db_config.json \\
	--backend-port ${BACKEND_PORT} \\
	--gateway-port ${GATEWAY_PORT} \\
	--log ${PROD_LOG} \\
	--quiet
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

install_service() {
	require_linux
	require_sudo

	local name
	name="$(service_name)"
	resolve_run_user

	case "$SERVICE_KIND" in
	prod)
		if [ ! -x "$ROOT_DIR/backend/mahjong-prodsupervisor" ]; then
			echo "Missing backend/mahjong-prodsupervisor — run: make build-prod" >&2
			exit 1
		fi
		if [ ! -f "$ROOT_DIR/backend/db_config.json" ]; then
			echo "Missing backend/db_config.json" >&2
			echo "  cp backend/db_config.example.json backend/db_config.json" >&2
			exit 1
		fi
		assert_dir_access "$ROOT_DIR/backend"
		mkdir -p "$LOG_DIR"
		chown "$RUN_USER:$RUN_GROUP" "$LOG_DIR" 2>/dev/null || true
		;;
	esac

	if [ "$SERVICE_KIND" = "mortal" ]; then
		exec bash "$ROOT_DIR/scripts/mortal-prod.sh" install
	fi

	echo "Installing ${name}.service (user=${RUN_USER}, root=${ROOT_DIR})"

	MAJSOUL_NODE_BIN_LINE=""
	if node_bin="$(resolve_node_bin)"; then
		MAJSOUL_NODE_BIN_LINE="Environment=MAJSOUL_NODE_BIN=${node_bin}"
		echo "  Node: ${node_bin}"
	else
		echo "  Warning: node not found; set MAJSOUL_NODE_BIN=... make prod or install Node.js for paipu fetch" >&2
	fi

	local tmp_unit
	tmp_unit="$(mktemp)"
	trap "rm -f '$tmp_unit'" EXIT

	write_prod_unit "$tmp_unit"

	$SUDO cp "$tmp_unit" "/etc/systemd/system/${name}.service"
	$SUDO systemctl daemon-reload
	$SUDO systemctl enable "${name}.service"
	$SUDO systemctl restart "${name}.service"

	sleep 1
	if $SUDO systemctl is-active --quiet "${name}.service"; then
		echo "${name}.service installed and running"
		echo "  App:  http://0.0.0.0:${GATEWAY_PORT}"
		echo "  Log:  ${PROD_LOG}"
		echo "  Stop: make prod-stop"
		rm -f "$tmp_unit"
		trap - EXIT
	else
		echo "Failed to start ${name}.service" >&2
		$SUDO systemctl status "${name}.service" --no-pager || true
		exit 1
	fi
}

remove_service() {
	require_linux
	require_sudo

	if [ "$SERVICE_KIND" = "mortal" ]; then
		exec bash "$ROOT_DIR/scripts/mortal-prod.sh" remove
	fi

	local name
	name="$(service_name)"

	if $SUDO systemctl is-active --quiet "${name}.service" 2>/dev/null; then
		echo "Stopping ${name}.service..."
		$SUDO systemctl stop "${name}.service"
	fi
	if $SUDO systemctl is-enabled --quiet "${name}.service" 2>/dev/null; then
		$SUDO systemctl disable "${name}.service"
	fi
	if [ -f "/etc/systemd/system/${name}.service" ]; then
		$SUDO rm -f "/etc/systemd/system/${name}.service"
	fi
	$SUDO systemctl daemon-reload
	echo "${name}.service removed"
}

case "$ACTION" in
install) install_service ;;
remove) remove_service ;;
*) usage ;;
esac
