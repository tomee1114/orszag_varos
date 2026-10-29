#!/usr/bin/env bash
set -euo pipefail
REPO="${REPO:-https://github.com/tomee1114/orszag_varos.git}"; VERSION="${1:-v2.2.2}"; DIR="${DIR:-/opt/orszag-varos}"; PORT="${PORT:-80}"
[ "$(id -u)" -eq 0 ] || { echo "Rootként futtasd"; exit 1; }
apt-get update -qq && apt-get install -y -qq nodejs git ca-certificates >/dev/null
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch --tags --force; else rm -rf "$DIR"; git clone "$REPO" "$DIR"; fi
git -C "$DIR" -c advice.detachedHead=false checkout -f "$VERSION"
sed "s/Environment=PORT=80/Environment=PORT=$PORT/" "$DIR/orszagvaros.service" > /etc/systemd/system/orszagvaros.service
systemctl daemon-reload; systemctl enable --now orszagvaros; systemctl restart orszagvaros
sleep 1; systemctl is-active --quiet orszagvaros
echo "Kész: $(git -C "$DIR" describe --tags --always)"; hostname -I
