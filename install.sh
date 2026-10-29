#!/usr/bin/env bash
# Ország-Város telepítő / frissítő Debian/Ubuntu LXC-hez (rootként futtasd)
#   Telepítés:  bash install.sh            -> a legfrissebb (main) verzió
#               bash install.sh v2.1.0     -> adott verzió (git tag)
#   Frissítés / visszaállás: ugyanez, másik verziószámmal
#   Port:       PORT=8080 bash install.sh v2.1.0   (alap: 80)
set -euo pipefail

REPO="${REPO:-https://github.com/tomee1114/orszag_varos.git}"
VERSION="${1:-${VERSION:-main}}"
DIR="${DIR:-/opt/orszag-varos}"
PORT="${PORT:-80}"
SERVICE=orszagvaros

[ "$(id -u)" -eq 0 ] || { echo "Rootként futtasd!"; exit 1; }

echo "==> Csomagok (nodejs, git)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nodejs git ca-certificates >/dev/null

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || { echo "Node.js 18+ kell, ez: $(node -v)"; exit 1; }

echo "==> Kód letöltése: $REPO ($VERSION)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet --tags --force origin
else
  rm -rf "$DIR"
  git clone --quiet "$REPO" "$DIR"
fi
if git -C "$DIR" show-ref --verify --quiet "refs/remotes/origin/$VERSION"; then
  git -C "$DIR" checkout --quiet --force -B "$VERSION" "origin/$VERSION"   # ág (pl. main)
else
  git -C "$DIR" -c advice.detachedHead=false checkout --quiet --force "$VERSION"  # tag (pl. v2.1.0)
fi
CURRENT="$(git -C "$DIR" describe --tags --always)"

echo "==> Szolgáltatás (port: $PORT)"
cat > /etc/systemd/system/$SERVICE.service <<UNIT
[Unit]
Description=Orszag-Varos jatek
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=/usr/bin/node server.js
Environment=PORT=$PORT
DynamicUser=yes
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --quiet $SERVICE
systemctl restart $SERVICE
sleep 1
systemctl is-active --quiet $SERVICE || { journalctl -u $SERVICE -n 20 --no-pager; exit 1; }

SUFFIX=""; [ "$PORT" = "80" ] || SUFFIX=":$PORT"
echo
echo "Kész! Verzió: $CURRENT"
for ip in $(hostname -I); do
  case "$ip" in *:*) continue;; esac
  echo "  Játékosok: http://$ip$SUFFIX/"
  echo "  TV nézet:  http://$ip$SUFFIX/tv"
done
