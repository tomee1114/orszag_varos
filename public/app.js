/* Ország-Város – játékos nézet (telefon / tablet / laptop) */
const ID = getId();
let S = null;            // utolsó állapot a szervertől
let screenKey = '';      // melyik képernyő van felépítve
let joining = false;
let popup = null;        // { target, cat } – megnyitott szó a kiértékelésnél
let menuOpen = false;
let stopping = false;
let lastDone = null, lastDrawer = null;
let flushed = false, locked = false;
const saveTimers = {};
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const spinner = new Spinner(paintSpin);

function A(type, data) { return act(ID, type, data); }
function nameOf(id) { const p = S && S.players.find(x => x.id === id); return p ? p.name : '?'; }
function catOf(key) { return S.cats.find(c => c.key === key); }

/* ---------- kapcsolat ---------- */
function connect() {
  const es = new EventSource('events?id=' + encodeURIComponent(ID));
  es.onmessage = e => { S = JSON.parse(e.data); syncClock(S); onState(); };
  es.addEventListener('kicked', () => { LS.removeItem('ov_name'); toast('Kikerültél a játékból.'); });
  es.onopen = () => document.body.classList.remove('offline');
  es.onerror = () => document.body.classList.add('offline');
}
function onState() {
  const name = LS.getItem('ov_name');
  if (!S.me && name && !joining) {
    joining = true;
    A('join', { name }).then(j => {
      joining = false;
      if (j.error && j.error !== 'net') { LS.removeItem('ov_name'); render(); }
    });
  }
  render();
}

/* ---------- képernyők ---------- */
function screen(key, build, update) {
  if (screenKey !== key) {
    screenKey = key;
    spinner.stop();
    lastDone = null; lastDrawer = null;
    if (build) build();
  }
  if (update) update();
}
function ensureShell() {
  if (!document.getElementById('main')) {
    app.innerHTML = '<header id="top"></header><main id="main"></main>';
    screenKey = '';
  }
}

function render() {
  if (!S) return;
  if (!S.me) {
    menuOpen = false; popup = null; renderOverlay();
    if (LS.getItem('ov_name')) {
      if (screenKey !== 'wait') { screenKey = 'wait'; spinner.stop(); app.innerHTML = '<div class="center pad muted">Csatlakozás…</div>'; }
    } else if (screenKey !== 'join') {
      screenKey = 'join'; spinner.stop();
      app.innerHTML = joinHtml();
      const inp = document.getElementById('name');
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
      inp.focus();
    }
    return;
  }
  ensureShell();
  setHtml(document.getElementById('top'), topHtml());
  const m = document.getElementById('main');
  if (S.phase !== 'review') popup = null;
  switch (S.phase) {
    case 'lobby': screen('lobby', null, () => setHtml(m, lobbyHtml())); break;
    case 'drawing': screen('draw-' + S.round, () => buildDrawing(m), updateDrawing); break;
    case 'writing': screen('write-' + S.round, () => buildWriting(m), updateWriting); break;
    case 'review': screen('review-' + S.round, () => { m.__html = null; window.scrollTo(0, 0); }, () => setHtml(m, reviewHtml())); break;
    case 'final': screen('final', () => { m.__html = null; }, () => setHtml(m, finalHtml())); break;
  }
  renderOverlay();
}

/* --- belépés --- */
function joinHtml() {
  return `<div class="join">
    <div class="logo-big">🌍🏙️👦👧🌱🐾🧸</div>
    <h1>Ország-Város</h1>
    <p class="muted">Írd be a neved, és már bent is vagy!</p>
    <input id="name" maxlength="20" placeholder="A neved" autocomplete="off" autocapitalize="words">
    <button class="btn huge primary" data-act="join">Belépés</button>
    <a class="link small" href="tv" target="_blank">📺 TV / eredményjelző nézet megnyitása</a>
  </div>`;
}
function doJoin() {
  const name = document.getElementById('name').value.trim();
  if (!name) { toast('Írd be a neved!'); return; }
  LS.setItem('ov_name', name);
  A('join', { name }).then(j => { if (j.error) LS.removeItem('ov_name'); render(); });
}

/* --- fejléc --- */
function topHtml() {
  const r = S.round ? `${S.round}. kör${S.maxRounds ? ' / ' + S.maxRounds : ''}` : '';
  const letter = (S.phase === 'writing' || S.phase === 'review') && S.letter ? `<span class="mini-letter">${esc(S.letter)}</span>` : '';
  return `<div class="tb-left"><b>Ország-Város</b></div>
    <div class="tb-mid">${letter}<span>${r}</span></div>
    <div class="tb-right"><span class="me">${esc(S.me.name)} · <b>${S.me.score}</b> p</span>
    <button class="icon" data-act="menu" aria-label="Menü">☰</button></div>`;
}

/* --- váróterem --- */
function lobbyHtml() {
  const pl = S.players.map(p => `<li><span class="dot ${p.online ? 'on' : ''}"></span>${esc(p.name)}${p.id === ID ? ' <small>(te)</small>' : ''}</li>`).join('');
  return `<section class="card">
      <h2>👋 Szia, ${esc(S.me.name)}!</h2>
      <p>Várjuk, hogy mindenki belépjen. Ezen a címen lehet csatlakozni:</p>
      <div class="url">${esc(location.origin + location.pathname)}</div>
    </section>
    <section class="card"><h3>Játékosok (${S.players.length})</h3><ul class="plist">${pl}</ul></section>
    <section class="card small">⚙️ ${settingsText()}<br>${rulesText(S)}<br><button class="link" data-act="menu">beállítások módosítása</button></section>
    <button class="btn huge primary" data-act="start">▶️ Indulhat a játék!</button>
    <p class="muted center small">Bárki elindíthatja. Minden körben a gép választja ki, ki sorsolja a betűt.</p>`;
}
function settingsText() {
  return `${S.maxRounds ? S.maxRounds + ' kör' : 'Végtelen kör (amíg kedvünk van)'} · ${S.alphabetMode === 'full' ? 'teljes magyar ábécé' : 'egyszerű ABC'}`;
}

/* --- betűsorsolás --- */
function buildDrawing(m) {
  m.innerHTML = `<div class="draw">
    <div class="round-title">${S.round}. kör</div>
    <div id="drawinfo" class="drawinfo"></div>
    <div class="spinbox" data-act="stop">
      <div class="sp side" id="sp-prev"></div>
      <div class="sp main" id="sp-cur">?</div>
      <div class="sp side" id="sp-next"></div>
    </div>
    <div id="drawact"></div>
    <div class="abc" id="abc"></div>
    <p class="muted small">${rulesText(S)}</p>
  </div>`;
  m.__html = null;
  stopping = false;
  spinner.start(S.alphabet.length);
}
function paintSpin(i) {
  const cur = document.getElementById('sp-cur');
  if (!cur || !S) return;
  const Ab = S.alphabet, n = Ab.length;
  const set = (el, l) => { el.textContent = l; el.classList.remove('bad', 'used'); const c = letterClass(S, l); if (c) el.classList.add(c); };
  set(cur, Ab[i % n]);
  set(document.getElementById('sp-prev'), Ab[(i - 1 + n) % n]);
  set(document.getElementById('sp-next'), Ab[(i + 1) % n]);
}
function updateDrawing() {
  if (spinner.len !== S.alphabet.length && !stopping) spinner.start(S.alphabet.length);
  const amDrawer = S.drawerId === ID;
  if (lastDrawer !== S.drawerId) {
    lastDrawer = S.drawerId;
    document.getElementById('drawinfo').innerHTML = amDrawer
      ? '🎲 <b>Te sorsolod a betűt!</b><br>Nyomd meg a STOP gombot, amikor szeretnéd.'
      : `🎲 <b>${esc(nameOf(S.drawerId))}</b> sorsolja a betűt…`;
    document.getElementById('drawact').innerHTML = amDrawer ? '<button class="btn huge stop" data-act="stop">✋ STOP</button>' : '';
    document.querySelector('.spinbox').classList.toggle('clickable', amDrawer);
  }
  setHtml(document.getElementById('abc'),
    S.alphabet.map(l => `<span class="${letterClass(S, l)}">${esc(l)}</span>`).join(''));
}
function doStop() {
  if (!S || S.phase !== 'drawing' || S.drawerId !== ID || stopping) return;
  stopping = true;
  spinner.stop();
  document.querySelector('.spinbox').classList.add('stopped');
  A('stopSpin', { index: spinner.idx }).then(j => {
    if (j.error) { stopping = false; document.querySelector('.spinbox')?.classList.remove('stopped'); spinner.start(S.alphabet.length); }
  });
}

/* --- kitöltés --- */
function buildWriting(m) {
  flushed = false; locked = false;
  const rounded = S.rawLetter && S.rawLetter !== S.letter
    ? `<div class="note">A(z) <b>${esc(S.rawLetter)}</b> betűnél állt meg, ${S.invalid.includes(S.rawLetter) ? 'azzal nem kezdődik magyar szó' : 'az már volt'}, ezért a legközelebbi: <b>${esc(S.letter)}</b></div>` : '';
  m.innerHTML = `<div class="letterbar">
      <div class="big-letter pop">${esc(S.letter)}</div>
      <div><div class="lb-title">Minden szó <b>${esc(S.letter)}</b> betűvel kezdődjön!</div>
      <div class="muted small">${S.round}. kör · sorsolta: ${esc(nameOf(S.drawerId))}</div>${rounded}</div>
    </div>
    <div id="wtimer" class="sticky-timer"></div>
    <form id="wform" class="fields" autocomplete="off" onsubmit="return false">
      ${S.cats.map((c, i) => `<label class="field" data-cat="${c.key}">
        <span class="fl">${c.icon} ${esc(c.label)}</span>
        <input data-cat="${c.key}" data-i="${i}" value="${esc(S.me.answers[c.key] || '')}" maxlength="40"
          autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="${i < S.cats.length - 1 ? 'next' : 'done'}">
        <span class="hint"></span></label>`).join('')}
    </form>
    <div id="wact"></div>
    <section class="card"><h3>Ki hol tart?</h3><div id="wstatus" class="chips"></div></section>`;
  m.__html = null;
  m.querySelectorAll('#wform input').forEach(inp => {
    hint(inp);
    inp.addEventListener('input', () => {
      hint(inp);
      const cat = inp.dataset.cat;
      clearTimeout(saveTimers[cat]);
      saveTimers[cat] = setTimeout(() => A('answer', { cat, text: inp.value }), 300);
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const nx = m.querySelector(`#wform input[data-i="${+inp.dataset.i + 1}"]`);
      if (nx) nx.focus(); else inp.blur();
    });
  });
  tick();
}
function hint(inp) {
  const f = inp.closest('.field');
  const v = inp.value.trim();
  const ok = startsOk(v, S.letter, S.alphabetMode);
  f.classList.toggle('good', !!v && ok);
  f.classList.toggle('bad', !!v && !ok);
  f.querySelector('.hint').textContent = v && !ok ? `Nem ${S.letter} betűvel kezdődik` : '';
}
function formValues() {
  const vals = {};
  document.querySelectorAll('#wform input').forEach(i => { vals[i.dataset.cat] = i.value; });
  return vals;
}
function updateWriting() {
  const done = S.me.done;
  if (lastDone !== done) {
    lastDone = done;
    document.querySelectorAll('#wform input').forEach(i => { i.disabled = done || locked; });
    document.getElementById('wact').innerHTML = done
      ? '<div class="donebox">✅ Kész vagy! Várjuk a többieket…</div><button class="btn ghost wide" data-act="undone">✏️ Mégis javítanék</button>'
      : '<button class="btn huge primary" data-act="done">✅ Kész!</button>';
  }
  setHtml(document.getElementById('wstatus'), S.players.map(p =>
    `<span class="chip ${p.done ? 'done' : ''} ${p.online ? '' : 'off'}">${p.done ? '✅' : '✏️'} ${esc(p.name)}${p.done ? '' : ` <small>${p.filled}/${S.cats.length}</small>`}</span>`).join(''));
  tick();
}
/* időzítő frissítése + utolsó pillanatban minden beírt szó elküldése */
function tick() {
  if (!S || S.phase !== 'writing') return;
  const el = document.getElementById('wtimer');
  if (!el) return;
  setHtml(el, timerHtml(S));
  const ms = remainingMs(S);
  if (ms == null || S.me.done) return;
  if (ms <= 800 && !flushed) {
    flushed = true;
    Object.values(saveTimers).forEach(clearTimeout);
    A('answer', { answers: formValues() });
  }
  if (ms <= 0 && !locked) {
    locked = true;
    document.querySelectorAll('#wform input').forEach(i => { i.disabled = true; i.blur(); });
    const b = document.querySelector('#wact [data-act=done]');
    if (b) { b.disabled = true; b.textContent = '⏰ Lejárt az idő!'; }
  }
}
setInterval(tick, 200);

function doDone() {
  const vals = formValues();
  const empty = Object.values(vals).filter(v => !v.trim()).length;
  if (empty && !confirm(`${empty} mező még üres. Biztosan kész vagy?`)) return;
  Object.values(saveTimers).forEach(clearTimeout);
  A('done', { answers: vals });
}

/* --- kiértékelés --- */
function markInfo(m) {
  if (!m) return { cls: '', txt: '' };
  if (m.s === 'pending') return { cls: 'st-pending', txt: `${esc(m.byName)} szerint rossz – jóváhagyásra vár` };
  if (m.s === 'x') {
    const t = { dup: 'ugyanaz, mint másnál', letter: 'rossz kezdőbetű', self: 'kihúzta magának', manual: `${esc(m.byName)} kihúzta` }[m.r] || 'kihúzva';
    return { cls: 'st-x', txt: t };
  }
  if (m.r === 'restored') return { cls: 'st-ok', txt: `✓ ${esc(m.byName)} visszaadta` };
  if (m.r === 'rejected') return { cls: 'st-ok', txt: 'nem fogadta el a kihúzást' };
  return { cls: 'st-ok', txt: '' };
}
function reviewHtml() {
  const myMarks = S.marks[ID] || {};
  const myPending = S.cats.filter(c => (myMarks[c.key] || {}).s === 'pending');
  let pendingCount = 0;
  Object.values(S.marks).forEach(o => Object.values(o).forEach(m => { if (m.s === 'pending') pendingCount++; }));

  const banner = myPending.length ? `<div class="alert">⚠️ ${myPending.map(c =>
    `<b>${esc((myMarks[c.key] || {}).byName)}</b> kihúzná ezt: „${esc(S.answers[ID][c.key])}” (${esc(c.label)})`).join('<br>')}
    <br><small>Koppints a szóra, és döntsd el!</small></div>` : '';

  const cards = S.cats.map(c => {
    const chips = S.players.map(p => {
      const text = ((S.answers[p.id] || {})[c.key] || '').trim();
      if (!text) return `<span class="chip empty">${esc(p.name)}: —</span>`;
      const mi = markInfo((S.marks[p.id] || {})[c.key]);
      return `<button class="chip word ${mi.cls} ${p.id === ID ? 'mine' : ''}" data-act="chip" data-t="${esc(p.id)}" data-c="${c.key}">
        <span class="cn">${esc(p.name)}</span><span class="cw">${esc(text)}</span>${mi.txt ? `<span class="cr">${mi.txt}</span>` : ''}</button>`;
    }).join('');
    return `<section class="card cat"><h3>${c.icon} ${esc(c.label)}</h3><div class="chips">${chips}</div></section>`;
  }).join('');

  const pts = [...S.players].sort((a, b) => b.roundPts - a.roundPts).map(p =>
    `<li><span>${esc(p.name)}</span><b>+${p.roundPts}</b><small>össz.: ${p.score + p.roundPts}</small></li>`).join('');

  return `<div class="review-head"><span class="big-letter sm">${esc(S.letter)}</span>
      <div><b>${S.round}. kör – kiértékelés</b><div class="muted small">Koppints egy szóra: ✗ ha rossz vagy ugyanaz, ✓ ha mégis jó.
      Ha valaki a te szavadat húzná ki, neked kell jóváhagynod.</div></div></div>
    ${banner}${cards}
    <section class="card"><h3>Pontok ebben a körben</h3><ul class="pts">${pts}</ul></section>
    ${pendingCount ? `<p class="muted center small">Még ${pendingCount} kihúzás vár jóváhagyásra.</p>` : ''}
    <button class="btn huge primary" data-act="next" ${pendingCount ? 'disabled' : ''}>
      ${S.maxRounds && S.round >= S.maxRounds ? '🏁 Pontok rögzítése és eredményhirdetés' : '➡️ Pontok rögzítése, jöhet a következő kör'}</button>`;
}
function popupHtml() {
  const { target, cat } = popup;
  const m = (S.marks[target] || {})[cat];
  const text = ((S.answers[target] || {})[cat] || '').trim();
  if (!m || !text) { popup = null; return ''; }
  const c = catOf(cat), mine = target === ID, owner = nameOf(target);
  let body = '';
  if (m.s === 'ok') {
    body = mine
      ? `<button class="btn big danger" data-act="pop-x">✗ Kihúzom, ez nem jó</button>`
      : `<p class="muted small">Ha kihúzod, ${esc(owner)} jóváhagyása kell hozzá.</p>
         <button class="btn big danger" data-act="pop-x">✗ Rossz vagy ugyanaz – kihúznám</button>`;
  } else if (m.s === 'x') {
    body = `<p>Most ki van húzva (${markInfo(m).txt}).</p><button class="btn big good" data-act="pop-ok">✓ Mégis jó, adjuk vissza</button>`;
  } else if (m.s === 'pending') {
    if (mine) body = `<p><b>${esc(m.byName)}</b> szerint ez nem jó. Mit szólsz?</p>
        <button class="btn big danger" data-act="pop-accept">👍 Igaza van, húzzuk ki</button>
        <button class="btn big good" data-act="pop-reject">🙅 Szerintem jó</button>`;
    else if (m.by === ID) body = `<p>Várjuk, hogy ${esc(owner)} jóváhagyja.</p><button class="btn big ghost" data-act="pop-reject">↩️ Visszavonom</button>`;
    else body = `<p>${esc(m.byName)} kihúzná, ${esc(owner)} jóváhagyására vár.</p>`;
  }
  return `<div class="sheet">
    <div class="muted small">${c.icon} ${esc(c.label)} · ${mine ? 'a te szavad' : esc(owner) + ' szava'}</div>
    <div class="sheet-word">${esc(text)}</div>
    ${body}
    <button class="btn ghost wide" data-act="close">Bezárás</button></div>`;
}

/* --- eredményhirdetés --- */
function finalHtml() {
  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  let rank = 0, prev = null;
  const medals = ['🥇', '🥈', '🥉'];
  const rows = ranked.map((p, i) => {
    if (p.score !== prev) { rank = i; prev = p.score; }
    return `<div class="rank r${rank + 1}"><span class="medal">${medals[rank] || (rank + 1) + '.'}</span><span class="rn">${esc(p.name)}</span><b>${p.score} pont</b></div>`;
  }).join('');
  return `<h2 class="center">🏆 Eredményhirdetés</h2>
    <p class="center muted">${S.history.length} kör után</p>
    <div class="ranks">${rows}</div>
    ${historyTable(S)}
    <button class="btn huge primary" data-act="newgame">🔄 Új játék</button>`;
}
function historyTable(S) {
  if (!S.history.length) return '';
  const cols = S.players;
  const head = cols.map(p => `<th>${esc(p.name)}</th>`).join('');
  const body = S.history.map(h => `<tr><td>${h.round}.</td><td><b>${esc(h.letter)}</b></td>${cols.map(p => {
    const r = h.rows.find(x => x.id === p.id) || h.rows.find(x => x.name === p.name);
    return `<td>${r ? r.pts : '–'}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="tablewrap"><table class="hist"><thead><tr><th>Kör</th><th>Betű</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* --- menü / felugró ablak --- */
function sel(name, cur, opts) {
  const list = opts.slice();
  if (!list.some(o => String(o[0]) === String(cur))) list.push([cur, String(cur)]);
  return `<select data-set="${name}">${list.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
}
function menuHtml() {
  const pl = S.players.map(p => `<li><span class="dot ${p.online ? 'on' : ''}"></span>${esc(p.name)} <small>${p.score} p</small>
    ${p.id !== ID ? `<button class="link danger" data-act="kick" data-t="${esc(p.id)}">eltávolítás</button>` : '<small>(te)</small>'}</li>`).join('');
  const inGame = S.phase !== 'lobby' && S.phase !== 'final';
  return `<div class="sheet">
    <h3>Menü</h3>
    <h4>Játékosok</h4><ul class="plist">${pl}</ul>
    <h4>Beállítások <small class="muted">(játék közben is módosítható)</small></h4>
    <label class="row">Körök száma
      ${sel('maxRounds', S.maxRounds, [[0, 'Végtelen'], [3, '3 kör'], [5, '5 kör'], [7, '7 kör'], [10, '10 kör'], [15, '15 kör'], [20, '20 kör']])}</label>
    <label class="row">Betűk
      ${sel('alphabetMode', S.alphabetMode, [['simple', 'Egyszerű ABC (A–Z)'], ['full', 'Teljes magyar (Á, CS, GY, SZ…)']])}</label>
    <label class="row">⏱️ Időkorlát
      ${sel('timeLimit', S.timeLimit, [[0, 'Nincs'], [60, '1 perc'], [90, '1,5 perc'], [120, '2 perc'], [180, '3 perc'], [240, '4 perc'], [300, '5 perc']])}</label>
    <p class="muted small sm-note">Az időkorlát a következő körtől érvényes.</p>
    <label class="row">🏁 Kör vége, ha…
      ${sel('endRule', S.endRule, [['all', 'mindenki kész'], ['half', 'több mint a fele kész'], ['first', 'az első kész']])}</label>
    ${S.endRule !== 'all' ? `<label class="row">⏳ Ráadásidő a többieknek
      ${sel('grace', S.grace, [[5, '5 mp'], [10, '10 mp'], [15, '15 mp'], [20, '20 mp'], [30, '30 mp'], [60, '1 perc']])}</label>` : ''}
    <h4>Játék</h4>
    ${S.phase === 'writing' ? '<button class="btn wide" data-act="force">⏭️ Kör lezárása most (nem várunk tovább)</button>' : ''}
    ${inGame ? '<button class="btn wide" data-act="end">🏁 Játék vége – eredményhirdetés</button>' : ''}
    <a class="btn wide ghost" href="tv" target="_blank">📺 TV / eredményjelző nézet</a>
    <button class="btn wide ghost" data-act="leave">🚪 Kilépés a játékból</button>
    <button class="btn wide" data-act="close">Bezárás</button>
  </div>`;
}
function renderOverlay() {
  let html = '';
  if (S && S.me && popup) html = popupHtml();
  if (!html && S && S.me && menuOpen) html = menuHtml();
  overlay.classList.toggle('hidden', !html);
  setHtml(overlay, html);
}
function closeOverlay() { popup = null; menuOpen = false; renderOverlay(); }

/* ---------- események ---------- */
const handlers = {
  join: doJoin,
  start: () => A('start'),
  stop: doStop,
  done: doDone,
  undone: () => A('undone'),
  menu: () => { menuOpen = true; popup = null; renderOverlay(); },
  close: closeOverlay,
  chip: b => { popup = { target: b.dataset.t, cat: b.dataset.c }; renderOverlay(); },
  'pop-x': () => { const p = popup; closeOverlay(); A('challenge', p); },
  'pop-ok': () => { const p = popup; closeOverlay(); A('restore', p); },
  'pop-accept': () => { const p = popup; closeOverlay(); A('respond', Object.assign({ accept: true }, p)); },
  'pop-reject': () => { const p = popup; closeOverlay(); A('respond', Object.assign({ accept: false }, p)); },
  next: () => A('next'),
  force: () => { if (confirm('Lezárjuk a kört? Akik még írnak, azoknak is vége.')) { closeOverlay(); A('forceEnd'); } },
  end: () => { if (confirm('Biztosan vége a játéknak? Jöhet az eredményhirdetés?')) { closeOverlay(); A('end'); } },
  newgame: () => A('newGame'),
  kick: b => { if (confirm(`Eltávolítod ${nameOf(b.dataset.t)} játékost?`)) A('kick', { target: b.dataset.t }); },
  leave: () => {
    if (!confirm('Biztosan kilépsz? (A pontjaid elvesznek.)')) return;
    closeOverlay();
    A('leave').then(() => { LS.removeItem('ov_name'); screenKey = ''; render(); });
  },
};
document.addEventListener('click', e => {
  if (e.target === overlay) { closeOverlay(); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const h = handlers[b.dataset.act];
  if (h) { e.preventDefault(); h(b, e); }
});
document.addEventListener('change', e => {
  const s = e.target.closest('[data-set]');
  if (s) A('settings', { [s.dataset.set]: s.value });
});

connect();
