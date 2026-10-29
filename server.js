'use strict';
/*
 * Ország-Város – családi webes játék helyi hálózatra
 * Külső függőség nélkül fut: elég hozzá a Node.js (18+).
 * Indítás:  node server.js      (alapból a 3000-es porton, PORT=80 node server.js a 80-ason)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUB = path.join(__dirname, 'public');
const OFFLINE_GRACE_MS = 60 * 1000; // ennyit várunk a lecsatlakozott (pl. lezárt telefonú) játékosra
const DRAWER_GRACE_MS = 10 * 1000;  // ha a sorsoló ennyi ideig nincs bent, más sorsol helyette
const LATE_MS = 1200;               // lejárt idő után ennyit várunk az utolsó gépelésekre

const CATS = [
  { key: 'orszag', label: 'Ország', icon: '🌍' },
  { key: 'varos', label: 'Város', icon: '🏙️' },
  { key: 'fiu', label: 'Fiú', icon: '👦' },
  { key: 'lany', label: 'Lány', icon: '👧' },
  { key: 'noveny', label: 'Növény', icon: '🌱' },
  { key: 'allat', label: 'Állat', icon: '🐾' },
  { key: 'targy', label: 'Tárgy', icon: '🧸' },
];
const CAT_KEYS = CATS.map(c => c.key);
const ALPHABETS = {
  simple: 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' '),
  full: 'A Á B C CS D DZ DZS E É F G GY H I Í J K L LY M N NY O Ó Ö Ő P Q R S SZ T TY U Ú Ü Ű V W X Y Z ZS'.split(' '),
};
const INVALID = new Set(['Q', 'W', 'X', 'Y']); // ezekkel nem kezdődik magyar szó
const END_RULES = ['all', 'half', 'first'];

const players = new Map(); // id -> játékos
const clients = new Set(); // nyitott SSE kapcsolatok: { id, tv, res }
let g = newGameState();

/* ---------- segédfüggvények ---------- */
function newGameState(prev) {
  return {
    phase: 'lobby', // lobby | drawing | writing | review | final
    round: 0,
    maxRounds: prev ? prev.maxRounds : 0,       // 0 = végtelen
    alphabetMode: prev ? prev.alphabetMode : 'simple',
    timeLimit: prev ? prev.timeLimit : 0,       // mp, 0 = nincs időkorlát
    endRule: prev ? prev.endRule : 'all',       // all | half | first
    grace: prev ? prev.grace : 10,              // ráadásidő mp, ha a szabály zárja a kört
    endsAt: null,
    endReason: null,                            // time | rule
    usedLetters: [],
    letter: null,
    rawLetter: null,
    drawerId: null,
    lastDrawerId: null,
    marks: {},   // marks[playerId][cat] = { s: 'ok'|'x'|'pending', r, by, byName }
    history: [], // lezárt körök
  };
}
function emptyAnswers() { const o = {}; for (const k of CAT_KEYS) o[k] = ''; return o; }
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function alphabet() { return ALPHABETS[g.alphabetMode] || ALPHABETS.simple; }
function fail(msg) { const e = new Error(msg); e.user = true; throw e; }

function startsOk(text, letter, mode) {
  const t = String(text || '').trim().toLowerCase();
  if (!t || !letter) return false;
  if (mode !== 'full') return norm(t).startsWith(norm(letter));
  const L = letter.toLowerCase();
  if (!t.startsWith(L)) return false;
  // pl. C betűnél a "Csepel" nem jó, mert az CS
  for (const other of ALPHABETS.full) {
    const o = other.toLowerCase();
    if (o.length > L.length && o.startsWith(L) && t.startsWith(o)) return false;
  }
  return true;
}

function isOnline(id) {
  for (const c of clients) if (!c.tv && c.id === id) return true;
  return false;
}
function activePlayers() {
  const now = Date.now();
  return [...players.values()].filter(p =>
    isOnline(p.id) || (p.offlineSince && now - p.offlineSince < OFFLINE_GRACE_MS));
}

/* Betű "kerekítése": ha Q/W/X/Y-on vagy már kisorsolt betűn áll meg, a legközelebbi jót adja */
function pickLetter(index) {
  const A = alphabet();
  let used = new Set(g.usedLetters);
  const ok = l => !INVALID.has(l) && !used.has(l);
  if (!A.some(ok)) { g.usedLetters = []; used = new Set(); } // minden betű elfogyott -> újrakezdjük
  if (ok(A[index])) return A[index];
  for (let d = 1; d < A.length; d++) {
    const c = [];
    const a = A[(index + d) % A.length];
    const b = A[(index - d + A.length) % A.length];
    if (ok(a)) c.push(a);
    if (ok(b) && b !== a) c.push(b);
    if (c.length) return c[Math.floor(Math.random() * c.length)];
  }
  return A[0];
}

function pickDrawer() {
  let pool = [...players.values()].filter(p => isOnline(p.id));
  if (!pool.length) pool = [...players.values()];
  if (pool.length > 1) pool = pool.filter(p => p.id !== g.lastDrawerId);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
}

function startRound() {
  if (!players.size) fail('Nincs még játékos.');
  g.round++;
  g.phase = 'drawing';
  g.letter = null;
  g.rawLetter = null;
  g.endsAt = null;
  g.endReason = null;
  g.marks = {};
  for (const p of players.values()) { p.answers = emptyAnswers(); p.done = false; }
  g.drawerId = pickDrawer();
}

function toReview() {
  g.phase = 'review';
  g.endsAt = null;
  g.marks = {};
  for (const cat of CAT_KEYS) {
    const groups = new Map();
    for (const p of players.values()) {
      const t = norm(p.answers[cat]);
      if (!t) continue;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(p.id);
    }
    for (const p of players.values()) {
      const raw = String(p.answers[cat] || '').trim();
      if (!raw) continue;
      let m = { s: 'ok' };
      if (!startsOk(raw, g.letter, g.alphabetMode)) m = { s: 'x', r: 'letter' };
      else if (groups.get(norm(raw)).length > 1) m = { s: 'x', r: 'dup' };
      (g.marks[p.id] = g.marks[p.id] || {})[cat] = m;
    }
  }
}

function roundPoints(pid) {
  const p = players.get(pid);
  if (!p) return 0;
  let n = 0;
  for (const k of CAT_KEYS) {
    const m = (g.marks[pid] || {})[k];
    if (String(p.answers[k] || '').trim() && m && m.s !== 'x') n++;
  }
  return n;
}

function scoreRound() {
  const rows = [];
  for (const p of players.values()) {
    const pts = roundPoints(p.id);
    p.score += pts;
    rows.push({ id: p.id, name: p.name, answers: { ...p.answers }, marks: g.marks[p.id] || {}, pts });
  }
  g.history.push({ round: g.round, letter: g.letter, rows });
}

/* Kör vége ellenőrzés: mindenki kész -> azonnal; szabály (fele / első) -> ráadásidő indul */
function checkAllDone() {
  if (g.phase !== 'writing') return false;
  const act = activePlayers();
  if (!act.length) return false;
  const done = act.filter(p => p.done).length;
  if (done === act.length) { toReview(); return true; }
  const hit = (g.endRule === 'half' && done * 2 > act.length) || (g.endRule === 'first' && done >= 1);
  if (hit && g.endReason !== 'rule') {
    const end = Date.now() + g.grace * 1000;
    if (!g.endsAt || end < g.endsAt) { g.endsAt = end; g.endReason = 'rule'; return true; }
  }
  return false;
}

function removePlayer(pid) {
  players.delete(pid);
  delete g.marks[pid];
  for (const c of clients) {
    if (c.id === pid && !c.tv) { try { c.res.write('event: kicked\ndata: {}\n\n'); } catch (e) { /* */ } }
  }
  if (g.phase === 'drawing' && g.drawerId === pid) g.drawerId = pickDrawer();
  if (!players.size && g.phase !== 'lobby') { g = newGameState(g); }
  checkAllDone();
}

function setAnswers(p, obj) {
  for (const k of CAT_KEYS) if (typeof obj[k] === 'string') p.answers[k] = obj[k].slice(0, 40);
}

/* ---------- akciók ---------- */
function handle(msg) {
  const id = msg && msg.id;
  const type = msg && msg.type;
  if (typeof id !== 'string' || !id || id.length > 80) fail('Hiányzó azonosító.');

  if (type === 'join') {
    const name = String(msg.name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) fail('Adj meg egy nevet!');
    const other = [...players.values()].find(p => p.id !== id && norm(p.name) === norm(name));
    let p = players.get(id);
    if (other) {
      if (isOnline(other.id) || p) fail('Ez a név már foglalt, válassz másikat!');
      // ugyanazzal a névvel visszatérő játékos (pl. másik böngészőből): átveszi a régi helyét és pontjait
      const oldId = other.id;
      players.delete(oldId);
      other.id = id;
      players.set(id, other);
      if (g.marks[oldId]) { g.marks[id] = g.marks[oldId]; delete g.marks[oldId]; }
      if (g.drawerId === oldId) g.drawerId = id;
      if (g.lastDrawerId === oldId) g.lastDrawerId = id;
      p = other;
    }
    if (p) p.name = name;
    else {
      p = { id, name, score: 0, answers: emptyAnswers(), done: false, joined: Date.now(), offlineSince: null };
      players.set(id, p);
    }
    p.offlineSince = isOnline(id) ? null : Date.now();
    return;
  }

  const me = players.get(id);
  if (!me) fail('Előbb lépj be a játékba!');

  switch (type) {
    case 'start':
      if (g.phase === 'final') { resetGame(); }
      if (g.phase !== 'lobby') fail('A játék már megy.');
      startRound();
      break;

    case 'stopSpin': {
      if (g.phase !== 'drawing') fail('Most nem lehet sorsolni.');
      if (g.drawerId !== id) fail('Most nem te sorsolsz.');
      const A = alphabet();
      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= A.length) fail('Hibás betű.');
      g.rawLetter = A[idx];
      g.letter = pickLetter(idx);
      g.usedLetters.push(g.letter);
      g.lastDrawerId = id;
      g.phase = 'writing';
      g.endsAt = g.timeLimit ? Date.now() + g.timeLimit * 1000 : null;
      g.endReason = g.timeLimit ? 'time' : null;
      break;
    }

    case 'answer':
      if (g.phase !== 'writing' || me.done) return;
      if (msg.answers && typeof msg.answers === 'object') { setAnswers(me, msg.answers); break; }
      if (!CAT_KEYS.includes(msg.cat)) fail('Hibás oszlop.');
      me.answers[msg.cat] = String(msg.text || '').slice(0, 40);
      break;

    case 'done':
      if (g.phase !== 'writing') fail('A kör már lezárult.');
      if (msg.answers && typeof msg.answers === 'object') setAnswers(me, msg.answers);
      me.done = true;
      checkAllDone();
      break;

    case 'undone':
      if (g.phase !== 'writing') fail('A kör már lezárult.');
      me.done = false;
      break;

    case 'forceEnd':
      if (g.phase !== 'writing') fail('Most nincs mit lezárni.');
      toReview();
      break;

    case 'challenge': {
      if (g.phase !== 'review') fail('Most nem lehet kihúzni.');
      const m = (g.marks[msg.target] || {})[msg.cat];
      if (!m) fail('Ezt a szót nem lehet kihúzni.');
      if (m.s !== 'ok') fail('Ez már ki van húzva vagy jóváhagyásra vár.');
      if (msg.target === id) g.marks[id][msg.cat] = { s: 'x', r: 'self' };
      else g.marks[msg.target][msg.cat] = { s: 'pending', by: id, byName: me.name };
      break;
    }

    case 'respond': {
      if (g.phase !== 'review') fail('Most nem lehet.');
      const m = (g.marks[msg.target] || {})[msg.cat];
      if (!m || m.s !== 'pending') fail('Ez már nem vár jóváhagyásra.');
      if (msg.target === id) {
        g.marks[id][msg.cat] = msg.accept
          ? { s: 'x', r: 'manual', byName: m.byName }
          : { s: 'ok', r: 'rejected', byName: m.byName };
      } else if (m.by === id && !msg.accept) {
        g.marks[msg.target][msg.cat] = { s: 'ok' }; // a kihúzó visszavonta
      } else {
        fail('Ezt csak a szó gazdája hagyhatja jóvá.');
      }
      break;
    }

    case 'restore': {
      if (g.phase !== 'review') fail('Most nem lehet.');
      const m = (g.marks[msg.target] || {})[msg.cat];
      if (!m || m.s !== 'x') fail('Ez nincs kihúzva.');
      g.marks[msg.target][msg.cat] = { s: 'ok', r: 'restored', byName: me.name };
      break;
    }

    case 'next': {
      if (g.phase !== 'review') fail('Most nem lehet továbblépni.');
      const pending = Object.values(g.marks).some(o => Object.values(o).some(m => m.s === 'pending'));
      if (pending) fail('Még van jóváhagyásra váró kihúzás.');
      scoreRound();
      if (g.maxRounds && g.round >= g.maxRounds) g.phase = 'final';
      else startRound();
      break;
    }

    case 'end':
      if (g.phase === 'review') scoreRound(); // a függő kihúzások jónak számítanak
      g.phase = 'final';
      g.endsAt = null;
      break;

    case 'newGame':
      resetGame();
      break;

    case 'settings': {
      if (msg.maxRounds !== undefined) {
        const n = parseInt(msg.maxRounds, 10);
        if (!Number.isInteger(n) || n < 0 || n > 99) fail('Hibás körszám.');
        g.maxRounds = n;
      }
      if (msg.alphabetMode !== undefined) {
        if (!ALPHABETS[msg.alphabetMode]) fail('Hibás betűkészlet.');
        if (msg.alphabetMode !== g.alphabetMode) { g.alphabetMode = msg.alphabetMode; g.usedLetters = []; }
      }
      if (msg.timeLimit !== undefined) {
        const n = parseInt(msg.timeLimit, 10);
        if (!Number.isInteger(n) || n < 0 || n > 1800) fail('Hibás időkorlát.');
        g.timeLimit = n; // a következő körtől él
      }
      if (msg.grace !== undefined) {
        const n = parseInt(msg.grace, 10);
        if (!Number.isInteger(n) || n < 3 || n > 120) fail('Hibás ráadásidő.');
        g.grace = n;
      }
      if (msg.endRule !== undefined) {
        if (!END_RULES.includes(msg.endRule)) fail('Hibás szabály.');
        g.endRule = msg.endRule;
        checkAllDone();
      }
      break;
    }

    case 'kick':
      if (!players.has(msg.target)) fail('Nincs ilyen játékos.');
      removePlayer(msg.target);
      break;

    case 'leave':
      removePlayer(id);
      break;

    default:
      fail('Ismeretlen művelet.');
  }
}

function resetGame() {
  g = newGameState(g);
  for (const p of players.values()) { p.score = 0; p.answers = emptyAnswers(); p.done = false; }
}

/* ---------- állapot küldése a klienseknek ---------- */
function view(forId, tv) {
  const me = players.get(forId);
  const list = [...players.values()].sort((a, b) => a.joined - b.joined).map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    online: isOnline(p.id),
    done: p.done,
    filled: CAT_KEYS.filter(k => String(p.answers[k] || '').trim()).length,
    roundPts: g.phase === 'review' ? roundPoints(p.id) : null,
  }));
  const reveal = g.phase === 'review';
  return {
    phase: g.phase,
    round: g.round,
    maxRounds: g.maxRounds,
    alphabetMode: g.alphabetMode,
    timeLimit: g.timeLimit,
    endRule: g.endRule,
    grace: g.grace,
    endsAt: g.endsAt,
    endReason: g.endReason,
    now: Date.now(),
    alphabet: alphabet(),
    invalid: [...INVALID],
    usedLetters: g.usedLetters,
    letter: g.letter,
    rawLetter: g.rawLetter,
    drawerId: g.drawerId,
    cats: CATS,
    players: list,
    me: (me && !tv) ? { id: me.id, name: me.name, score: me.score, answers: me.answers, done: me.done } : null,
    answers: reveal ? Object.fromEntries([...players.values()].map(p => [p.id, p.answers])) : null,
    marks: reveal ? g.marks : null,
    history: g.history,
  };
}
function send(c) {
  try { c.res.write(`data: ${JSON.stringify(view(c.id, c.tv))}\n\n`); } catch (e) { /* */ }
}
function broadcast() { for (const c of clients) send(c); }

/* ---------- HTTP ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
function serveStatic(pathname, res) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/tv') pathname = '/tv.html';
  let file;
  try { file = path.normalize(path.join(PUB, decodeURIComponent(pathname))); } catch (e) { res.writeHead(400); return res.end(); }
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nincs ilyen oldal'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function sse(req, res, u) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const c = { id: u.searchParams.get('id') || '', tv: u.searchParams.get('tv') === '1', res };
  clients.add(c);
  const p = players.get(c.id);
  if (p && !c.tv) p.offlineSince = null;
  broadcast();
  req.on('close', () => {
    clients.delete(c);
    const pl = players.get(c.id);
    if (pl && !isOnline(pl.id)) pl.offlineSince = Date.now();
    broadcast();
  });
}

function action(req, res) {
  let body = '';
  req.on('data', d => { body += d; if (body.length > 20000) req.destroy(); });
  req.on('end', () => {
    const reply = obj => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    let msg;
    try { msg = JSON.parse(body); } catch (e) { return reply({ error: 'Hibás kérés.' }); }
    try {
      handle(msg);
      reply({ ok: true });
      broadcast();
    } catch (e) {
      if (!e.user) console.error(e);
      reply({ error: e.user ? e.message : 'Szerverhiba.' });
    }
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/events') return sse(req, res, u);
  if (u.pathname === '/api/action' && req.method === 'POST') return action(req, res);
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  serveStatic(u.pathname, res);
});

// életjel + időzített ellenőrzések (lecsatlakozott sorsoló / mindenki kész)
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch (e) { /* */ } } }, 20000);
setInterval(() => {
  let changed = false;
  if (g.phase === 'drawing') {
    const d = players.get(g.drawerId);
    const gone = !d || (!isOnline(d.id) && d.offlineSince && Date.now() - d.offlineSince > DRAWER_GRACE_MS);
    if (gone) {
      const n = pickDrawer();
      if (n && n !== g.drawerId && isOnline(n)) { g.drawerId = n; changed = true; }
    }
  }
  if (checkAllDone()) changed = true;
  if (changed) broadcast();
}, 3000);
// lejárt idő: kis késleltetéssel zárunk, hogy a kliensek utolsó gépelése is beérjen
setInterval(() => {
  if (g.phase === 'writing' && g.endsAt && Date.now() >= g.endsAt + LATE_MS) { toReview(); broadcast(); }
}, 250);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ország-Város fut a ${PORT}-es porton.`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) {
      console.log(`  Játékosok:  http://${a.address}:${PORT}/`);
      console.log(`  TV nézet:   http://${a.address}:${PORT}/tv`);
    }
  }
});
