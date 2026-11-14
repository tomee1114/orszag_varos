#!/usr/bin/env bash
set -euo pipefail
DIR="${1:-/root/orszag_varos}"
cd "$DIR"
for f in server.js public/app.js public/tv.js public/style.css; do [ -f "$f" ] || { echo "Hianyzik: $DIR/$f"; exit 1; }; done
cp server.js server.js.v2.2.4.bak
cp public/app.js public/app.js.v2.2.4.bak
cp public/tv.js public/tv.js.v2.2.4.bak
cp public/style.css public/style.css.v2.2.4.bak
python3 - <<'PY'
from pathlib import Path

# --- szerver: TV-admin eltávolítás + kliens értesítése ---
p=Path('server.js'); s=p.read_text()
# A TV SSE kapcsolat azonosítót is kap; a view továbbra is TV módban készül.
# A meglévő sse kód már a query id-t olvassa, ezért elég a TV kliensoldalon id-t küldeni.
if "function notifyKicked(" not in s:
    marker="function broadcast(){for(const c of clients)send(c)}"
    helper="""function notifyKicked(id){for(const c of clients)if(!c.tv&&c.id===id)try{c.res.write('event: kicked\\ndata: {}\\n\\n')}catch{}}\nfunction isTvController(id){return[...clients].some(c=>c.tv&&c.id===id)}\n"""
    if marker not in s: raise SystemExit('Nem talaltam a broadcast blokkot.')
    s=s.replace(marker,helper+marker)
# TV-ről érkező tvKick a normál játékos-hitelesítés előtt kezelődik.
needle="let me=players.get(id);if(!me)fail('Előbb lépj be!');"
if "type==='tvKick'" not in s:
    insert="""if(type==='tvKick'){if(!isTvController(id))fail('A TV vezérlő nincs csatlakozva.');if(!players.has(m.target))fail('Nincs ilyen játékos.');notifyKicked(m.target);players.delete(m.target);delete g.reviewSeen?.[m.target];doneCheck();return;}"""
    if needle not in s: raise SystemExit('Nem talaltam a jatekos ellenorzest.')
    s=s.replace(needle,insert+needle)
# A normál leave/kick is küldjön kicked eseményt.
s=s.replace("case'kick':players.delete(m.target);doneCheck();break;", "case'kick':notifyKicked(m.target);players.delete(m.target);delete g.reviewSeen?.[m.target];doneCheck();break;")
s=s.replace("case'leave':players.delete(id);doneCheck();break;", "case'leave':notifyKicked(id);players.delete(id);delete g.reviewSeen?.[id];doneCheck();break;")
p.write_text(s)

# --- játékosoldal: kicked esemény + egyértelmű kilépés ---
p=Path('public/app.js'); s=p.read_text()
if "addEventListener('kicked'" not in s:
    marker="es.onmessage=e=>{S=JSON.parse(e.data);offset=S.now-Date.now();if(!S.me&&localStorage.ov_name)act('join',{name:localStorage.ov_name});render()};"
    add=marker+"es.addEventListener('kicked',()=>{localStorage.removeItem('ov_name');localStorage.removeItem('ov_id');S=null;screen='';document.querySelector('#modal')?.classList.add('hide');document.querySelector('#app').innerHTML='<main class=\\\"join\\\"><h1>👋 Kiléptél a játékból</h1><p>A játékos helye felszabadult.</p><button class=\\\"primary big\\\" onclick=\\\"location.reload()\\\">Újra csatlakozom</button></main>';});"
    if marker not in s: raise SystemExit('Nem talaltam az EventSource onmessage sort.')
    s=s.replace(marker,add)
# Kilépési függvény megerősítéssel.
if 'function leaveGame()' not in s:
    s += "\nfunction leaveGame(){if(confirm('Biztosan kilépsz a játékból? A jelenlegi játékból eltávolítunk.'))act('leave')}\n"
# A beállítási sheetben a Bezárás előtt jól látható piros gomb.
old='<button onclick="closeMenu()">Bezárás</button></div>`}'
new='<button class="leave-game wide" onclick="leaveGame()">🚪 Kilépés a játékból</button><button onclick="closeMenu()">Bezárás</button></div>`}'
if old in s and 'leave-game wide' not in s:s=s.replace(old,new)
elif 'leave-game wide' not in s: raise SystemExit('Nem talaltam a menu Bezaras gombjat.')
p.write_text(s)

# --- TV: admin azonosító, kezelőpanel, törlés ---
p=Path('public/tv.js'); s=p.read_text()
# Az EventSource sort lecseréljük stabil TV id-re.
old="new EventSource('events?tv=1').onmessage=e=>{S=JSON.parse(e.data);offset=S.now-Date.now();render()};"
new="const TVID=sessionStorage.ov_tv_id||(sessionStorage.ov_tv_id='tv-'+Math.random().toString(36).slice(2));const tvEvents=new EventSource('events?tv=1&id='+encodeURIComponent(TVID));tvEvents.onmessage=e=>{S=JSON.parse(e.data);offset=S.now-Date.now();render()};"
if old in s:s=s.replace(old,new)
elif 'TVID=' not in s:raise SystemExit('Nem talaltam a TV EventSource sort.')
# POST helper és panel.
if 'function tvAct(' not in s:
    marker='function sidebar()'
    helpers=r'''async function tvAct(type,data={}){let r=await fetch('api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:TVID,type,...data})}),j=await r.json();if(j.error)alert(j.error);return j;}
function openTvPlayers(){let box=document.querySelector('#tvmanage');if(!box)return;box.classList.add('open');renderTvPlayers();}
function closeTvPlayers(){document.querySelector('#tvmanage')?.classList.remove('open')}
function renderTvPlayers(){let list=document.querySelector('#tvplayerlist');if(!list||!S)return;list.innerHTML=S.players.length?S.players.map(p=>`<div class="tv-player-admin ${p.online?'':'offline'}"><div><b>${esc(p.name)}</b><small>${p.online?'● online':'○ kapcsolat nélkül'} · ${p.score} pont</small></div><button onclick="removeTvPlayer('${p.id}','${esc(p.name).replace(/'/g,"\\'")}')">Eltávolítás</button></div>`).join(''):'<p>Nincs játékos a szobában.</p>';}
async function removeTvPlayer(id,name){if(!confirm(`Biztosan eltávolítod: ${name}?`))return;await tvAct('tvKick',{target:id});renderTvPlayers();}
'''
    if marker not in s:raise SystemExit('Nem talaltam a sidebar fuggvenyt.')
    s=s.replace(marker,helpers+marker)
# Sidebar kap admin gombot.
old="return`<aside><h2>🏆 Állás</h2><p>${S.round?S.round+'. kör':''}</p>${a.map((p,i)=>`<div class=\"score\" style=\"--c:${i}\"><b>${esc(p.name)}</b><span>${p.score}</span></div>`).join('')}</aside>`"
new="return`<aside><h2>🏆 Állás</h2><p>${S.round?S.round+'. kör':''}</p>${a.map((p,i)=>`<div class=\"score ${p.online?'':'offline'}\" style=\"--c:${i}\"><b>${esc(p.name)}</b><span>${p.score}</span></div>`).join('')}<button class=\"tv-manage-button\" onclick=\"openTvPlayers()\">👥 Játékosok kezelése</button></aside>`"
if old in s:s=s.replace(old,new)
elif 'tv-manage-button' not in s:raise SystemExit('Nem talaltam a sidebar return sort.')
# A TV gyökér mellé egyszer létrehozzuk a kezelőpanelt minden render után.
needle="$('#tv').innerHTML=sidebar()+main;"
inject="""if(!document.querySelector('#tvmanage'))document.body.insertAdjacentHTML('beforeend',`<div id=\"tvmanage\" class=\"tv-manage-overlay\"><section><header><div><small>TV vezérlő</small><h2>Játékosok kezelése</h2></div><button onclick=\"closeTvPlayers()\">✕</button></header><p class=\"admin-note\">Az eltávolított játékos azonnal kikerül a körből és a saját készülékén kiléptető képernyőt kap.</p><div id=\"tvplayerlist\"></div></section></div>`);if(document.querySelector('#tvmanage.open'))renderTvPlayers();"""
if needle in s and 'tv-manage-overlay' not in s:s=s.replace(needle,needle+inject)
elif 'tv-manage-overlay' not in s:raise SystemExit('Nem talaltam a TV render beszurasi pontjat.')
p.write_text(s)

# Verzió
for name in ['server.js','package.json','README.md','orszagvaros.service','install.sh']:
 q=Path(name)
 if q.exists():q.write_text(q.read_text().replace('2.2.4','2.2.5'))
PY
cat >> public/style.css <<'EOF_CSS'

/* v2.2.5 - egyértelmű kilépés és TV játékoskezelő */
.leave-game{background:linear-gradient(135deg,#db3e4d,#b82335)!important;color:#fff!important;border:0!important;margin-top:1.2rem!important;box-shadow:0 5px 16px #bd253550}.score.offline{opacity:.48;filter:grayscale(.7)}.score.offline b:after{content:' · offline';font-size:.7vw;font-weight:500;color:#c9bfdc}.tv-manage-button{display:block;width:100%;margin-top:1.2vw;background:#ffffff12;color:#fff;border:1px solid #ffffff20;padding:.65vw;border-radius:.75vw;font-size:.9vw}.tv-manage-button:hover{background:#ffffff20}.tv-manage-overlay{position:fixed;inset:0;z-index:100;background:#100a277d;backdrop-filter:blur(8px);display:none;place-items:center}.tv-manage-overlay.open{display:grid}.tv-manage-overlay>section{width:min(42vw,720px);max-height:80vh;overflow:auto;background:linear-gradient(145deg,#34256b,#211747);border:1px solid #ffffff28;border-radius:1.4vw;padding:1.3vw;box-shadow:0 2vw 6vw #0008;animation:pop .25s ease}.tv-manage-overlay header{position:static;background:transparent;box-shadow:none;padding:0 0 .8vw;border-radius:0;display:flex}.tv-manage-overlay header div{flex:1}.tv-manage-overlay header small{color:#bfb4e1;text-transform:uppercase;letter-spacing:.12em}.tv-manage-overlay header h2{margin:.15vw 0;font-size:2vw}.tv-manage-overlay header button{background:#ffffff14;color:#fff;font-size:1.2vw}.admin-note{color:#cfc6e8;font-size:.9vw}.tv-player-admin{display:flex;align-items:center;gap:1vw;background:#ffffff0d;border:1px solid #ffffff18;padding:.75vw;margin:.55vw 0;border-radius:.8vw}.tv-player-admin.offline{opacity:.65}.tv-player-admin>div{flex:1}.tv-player-admin b{display:block;font-size:1.2vw}.tv-player-admin small{display:block;color:#cfc6e8;font-size:.78vw;margin-top:.12vw}.tv-player-admin button{background:#d84250;color:white;padding:.55vw .8vw;font-size:.85vw}
EOF_CSS
node --check server.js
node --check public/app.js
node --check public/tv.js
[ ! -f public/qrcode-lite.js ] || node --check public/qrcode-lite.js
printf '\nKesz: v2.2.5 kilepes es TV jatekoskezeles itt: %s\n' "$DIR"
