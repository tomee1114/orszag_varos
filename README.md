# 🌍 Ország-Város

Családi, többjátékos Ország-Város böngészőben – telefonon, tableten, laptopon és TV-n.
Helyi hálózatra készült. Csak Node.js 18+ kell, külső csomag és adatbázis nincs.

## Funkciók
- Belépés névvel, közös link
- Véletlenszerű betűsorsoló, pörgő ABC + STOP (Q/W/X/Y és a már kihúzott betűk "kerekítve")
- Oszlopok: Ország, Város, Fiú, Lány, Növény, Állat, Tárgy
- „Kész” gomb; kör vége: mindenki kész / többség kész / első kész + ráadásidő
- Opcionális időkorlát
- Kiértékelés: azonos és rossz betűs szavak előre kihúzva, kihúzás a szó gazdájának jóváhagyásával, 1 pont / ki nem húzott szó
- Végtelen vagy beállítható körszám, „Játék vége” bármikor
- TV / eredményjelző nézet: `/tv`
- Főképernyőre tehető (PWA)

## Telepítés Debian/Ubuntu LXC-be (root)
```bash
apt update && apt install -y curl
curl -fsSL https://raw.githubusercontent.com/tomee1114/orszag_varos/main/install.sh | bash -s v2.0.0
```
Frissítés vagy visszaállás másik verzióra:
```bash
bash /opt/orszag-varos/install.sh v2.1.0
```
Más port: `PORT=8080 bash /opt/orszag-varos/install.sh v2.0.0`

## Docker
```bash
docker build -t orszag-varos . && docker run -d -p 3000:3000 --restart unless-stopped orszag-varos
```

## Kézi indítás
```bash
node server.js          # http://IP:3000/
```
