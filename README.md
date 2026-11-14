# Ország-Város v2.4.0-alpha1

Helyi hálózatos, többjátékos családi webjáték. Adatbázis és külső Node csomag nélkül.

## v2.4.0-alpha1
- titkos, animált betűsorsolás; magyar betűcsoportok
- dinamikus TV-s folyamatjelző, kategóriaikonok és kész animáció
- külön animált köreredmény
- animált dobogó és konfetti
- játék végi, memóriából számolt statisztikák
- csökkentett animáció opció

## Indítás
`node server.js` → játék: `http://IP:3000/`, TV: `http://IP:3000/tv`

## LXC frissítés Git tagből
`bash /opt/orszag-varos/install.sh v2.4.0-alpha1`

## v2.4.0-alpha2.3

- Több, egymástól elkülönített játékszoba
- Véletlenszerű, kattintható szobanevek
- Négyjegyű belépési PIN
- Belépés után is látható szobanév és PIN
- Meghívó másolása gomb
- Egy szobához külön Node.js játékfolyamat
- Legfeljebb 10 egyidejű aktív szoba
- Két óra inaktivitás után automatikus szobatörlés
