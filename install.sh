#!/bin/sh
# Install herdr-office to ~/.local/bin. It changes no shell config file.
set -eu

os=$(uname -s)
arch=$(uname -m)
# shellcheck disable=SC2088 # rc is display text for the hint, not a path
case "$os $arch" in
  "Darwin arm64") target=darwin-arm64; rc='~/.zshrc' ;;
  "Linux x86_64") target=linux-x64; rc='~/.bashrc' ;;
  *) echo "herdr-office: $os $arch is not supported." >&2; exit 1 ;;
esac

url=${HERDR_OFFICE_URL:-https://github.com/TheBabaYaga/herdr-office/releases/latest/download/herdr-office-$target.tar.gz}
dir=$HOME/.local/bin
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Download $url"
curl -fsSL -o "$tmp/ho.tar.gz" "$url"
tar -xzf "$tmp/ho.tar.gz" -C "$tmp"

# Write a new file and move it onto the old one. A signed binary that changes
# in place can die with "Killed: 9" on macOS.
mkdir -p "$dir"
cp "$tmp/herdr-office" "$dir/.herdr-office.new"
chmod 755 "$dir/.herdr-office.new"
mv -f "$dir/.herdr-office.new" "$dir/herdr-office"

echo "Installed $dir/herdr-office"
case ":$PATH:" in
  *":$dir:"*) ;;
  *)
    echo "$dir is not on your PATH. Add this line to $rc:"
    # shellcheck disable=SC2016 # the hint must show a literal $HOME and $PATH
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    echo "Then open a new terminal and start it with: herdr-office"
    echo "To start it now, run: $dir/herdr-office"
    exit 0
    ;;
esac
echo "Start it with: herdr-office"
