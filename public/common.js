/* Közös segédfüggvények (játékos és TV nézet) */
const LS = window.localStorage;
const FULL_ABC = 'A Á B C CS D DZ DZS E É F G GY H I Í J K L LY M N NY O Ó Ö Ő P Q R S SZ T TY U Ú Ü Ű V W X Y Z ZS'.split(' ');
let clockOffset = 0; // szerver órája - saját óra

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function startsExact(t, letter) {
  const L = letter.toLowerCase();
  if (!t.startsWith(L)) return false;
  for (const other of FULL_ABC) {
    const o = other.toLowerCase();
    if (o.length > L.length && o.startsWith(L) && t.startsWith(o)) return false;
  }
  return true;
}
/* letters: elfogadott kezdőbetűk tömbje, pl. ["T","TY"] */
function startsOk(text, letters, mode) {
  const t = String(text || '').trim().toLowerCase();
  if (!t || !letters || !letters.length) return false;
  if (mode !== 'full') return letters.some(l => norm(t).startsWith(norm(l)));
  return letters.some(l => startsExact(t, l));
}
function lettersOr(S) { return (S.letters && S.letters.length ? S.letters : [S.letter]).join(' vagy '); }
/* hosszú felirat (pl. "D / DZ / DZS") kisebb betűmérettel */
function bigCls(l) { const n = String(l || '').length; return n > 7 ? ' multi2' : n > 3 ? ' multi' : ''; }
function getId() {
  let id = LS.getItem('ov_id');
  if (!id) {
    id = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    LS.setItem('ov_id', id);
  }
  return id;
}
async function act(id, type, data) {
  try {
    const r = await fetch('api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ id, type }, data || {})),
    });
    const j = await r.json();
    if (j.error) toast(j.error);
    return j;
  } catch (e) {
    toast('Nincs kapcsolat a szerverrel.');
    return { error: 'net' };
  }
}
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
/* Betűpörgető: csak a kijelzést pörgeti, az eredményt a szerver dönti el */
class Spinner {
  constructor(onTick) { this.idx = Math.floor(Math.random() * 20); this.timer = null; this.len = 0; this.onTick = onTick; }
  start(len, ms) {
    this.stop();
    this.len = len;
    this.idx = this.idx % len;
    this.timer = setInterval(() => { this.idx = (this.idx + 1) % this.len; this.onTick(this.idx); }, ms || 90);
    this.onTick(this.idx);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  get running() { return !!this.timer; }
}
function letterClass(S, l) {
  if (S.invalid.includes(l)) return 'bad';
  if (S.usedLetters.includes(l)) return 'used';
  return '';
}
function setHtml(el, html) { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } }

/* --- időzítő --- */
function syncClock(S) { if (S && S.now) clockOffset = S.now - Date.now(); }
function remainingMs(S) { return S && S.endsAt ? S.endsAt - (Date.now() + clockOffset) : null; }
function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
}
function timerHtml(S) {
  const ms = remainingMs(S);
  if (ms == null) return '';
  const urgent = ms <= 10000;
  const label = S.endReason === 'rule'
    ? (S.endRule === 'first' ? 'Valaki kész! Még:' : 'Többség kész! Még:')
    : 'Hátralévő idő:';
  return `<div class="timer ${urgent ? 'urgent' : ''} ${S.endReason === 'rule' ? 'rule' : ''}">
    <span class="tl">${label}</span><span class="tv">${ms <= 0 ? 'Lejárt!' : fmtTime(ms)}</span></div>`;
}
function rulesText(S) {
  const t = S.timeLimit ? (S.timeLimit >= 60 ? (S.timeLimit / 60).toString().replace('.', ',') + ' perc' : S.timeLimit + ' mp') : 'nincs időkorlát';
  const r = { all: 'mindenki kész', half: `a többség kész (+${S.grace} mp)`, first: `az első kész (+${S.grace} mp)` }[S.endRule];
  return `⏱️ ${t} · 🏁 kör vége: ${r}`;
}
