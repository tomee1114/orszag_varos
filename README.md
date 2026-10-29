# 🌍 Ország-Város

Családi, többjátékos Ország-Város böngészőben – telefonon, tableten, laptopon és TV-n.
Helyi hálózatra készült. Csak Node.js 18+ kell, külső csomag és adatbázis nincs.

## Funkciók
- Belépés névvel, közös link
- Véletlenszerű betűsorsoló, pörgő ABC + STOP (Q/W/X/Y és a már kihúzott betűk "kerekítve")
- Teljes magyar ábécé **betűpárokkal**: bármelyik tagjánál áll meg, a pár minden tagja jó
  (A/Á, C/CS, D/DZ/DZS, E/É, G/GY, I/Í, L/LY, N/NY, O/Ó, Ö/Ő, S/SZ, T/TY, U/Ú, Ü/Ű, Z/ZS)
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
curl -fsSL https://raw.githubusercontent.com/tomee1114/orszag_varos/main/install.sh | bash -s v2.1.0
```
Frissítés vagy visszaállás másik verzióra:
```bash
bash /opt/orszag-varos/install.sh v2.1.0
```
Más port: `PORT=8080 bash /opt/orszag-varos/install.sh v2.1.0`

## Docker
```bash
docker compose up -d --build      # http://IP:3000/
```

## Változások
- **v2.1.0** – teljes magyar ábécé az alapértelmezett, betűpárokkal (T/TY, S/SZ, …)
- **v2.0.0** – időkorlát, „kör vége ha…” szabály + ráadásidő, PWA
