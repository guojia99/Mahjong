#!/usr/bin/env bash
# Shared helpers for selecting / building libriichi native libraries.

libriichi_subdir() {
	local os arch
	os="$(uname -s)"
	arch="$(uname -m)"
	case "$os" in
	Darwin)
		case "$arch" in
		arm64) echo "darwin_arm64" ;;
		x86_64) echo "darwin_amd64" ;;
		*) return 1 ;;
		esac
		;;
	Linux)
		case "$arch" in
		x86_64) echo "linux_amd64" ;;
		*) return 1 ;;
		esac
		;;
	*) return 1 ;;
	esac
}

libriichi_file_pattern() {
	case "$(uname -s)-$(uname -m)" in
	Linux-x86_64) echo "ELF .*x86-64" ;;
	Darwin-arm64) echo "Mach-O .*arm64" ;;
	Darwin-x86_64) echo "Mach-O .*x86_64" ;;
	*) echo "^$" ;;
	esac
}

libriichi_is_valid() {
	local file="$1"
	[ -f "$file" ] || return 1
	file "$file" 2>/dev/null | grep -Eq "$(libriichi_file_pattern)"
}

libriichi_bundled_src() {
	local root="${1:?}"
	local mortal_dir="${2:-$root/mortal-server}"
	local subdir

	subdir="$(libriichi_subdir)" || {
		echo "unsupported platform: $(uname -s)-$(uname -m)" >&2
		return 1
	}

	if [ "$subdir" = "darwin_amd64" ] && [ ! -f "$mortal_dir/lib/darwin_amd64/libriichi.so" ]; then
		echo "Warning: darwin_amd64 not bundled, using darwin_arm64" >&2
		subdir="darwin_arm64"
	fi

	echo "$mortal_dir/lib/$subdir/libriichi.so"
}

libriichi_install_bundled() {
	local root="${1:?}"
	local mortal_dir="${2:-$root/mortal-server}"
	local dest="${3:-$mortal_dir/libriichi.so}"
	local src

	src="$(libriichi_bundled_src "$root" "$mortal_dir")" || return 1
	if ! libriichi_is_valid "$src"; then
		echo "Error: bundled libriichi missing or wrong platform: $src" >&2
		echo "  Build from source: LIBRIICHI_SRC=/path/to/libriichi make build-libriichi" >&2
		return 1
	fi

	cp "$src" "$dest"
	echo "Installed libriichi for $(uname -s)-$(uname -m): $src -> $dest"
}
