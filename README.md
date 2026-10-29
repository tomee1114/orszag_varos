# Ország-Város – családi webes játék

Csak Node.js kell (18+), külső csomag és adatbázis nincs. Az állás a memóriában van.

## Proxmox LXC (Debian)
    apt install -y nodejs
    cd /opt && sh setup.sh
    cp /opt/orszag-varos/orszagvaros.service /etc/systemd/system/
    systemctl daemon-reload && systemctl enable --now orszagvaros
Játékosok: http://IP/   ·   TV: http://IP/tv
Frissítés: új setup.sh lefuttatása /opt-ban, majd: systemctl restart orszagvaros

## NAS / Docker
docker-compose.yml (volume útvonal igazítása) → http://IP:3000/

## Telefonon "appként"
Safari: Megosztás → Főképernyőhöz adás.  Chrome/Android: ⋮ → Hozzáadás a kezdőképernyőhöz.
Teljes képernyős, saját ikonnal indul.

## Beállítások (☰ menü, játék közben is)
- Körök száma: végtelen / 3–20
- Betűk: egyszerű ABC vagy teljes magyar ábécé
- Időkorlát: nincs / 1–5 perc (a következő körtől)
- Kör vége: mindenki kész / több mint a fele kész / az első kész
- Ráadásidő: ennyi ideje marad a többieknek, ha a szabály lezárja a kört
