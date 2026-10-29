/* Ország-Város – TV / eredményjelző nézet (csak megjelenít, nem játszik) */
let S = null;
let key = '';
const root = document.getElementById('tv');
const spinner = new Spinner(paint);

function nameOf(id) { const p = S.players.find(x => x.id === id); return p ? p.name : '?'; }

function connect() {
  const es = new EventSource('events?tv=1');
  es.onmessage = e => { S = JSON.parse(e.data); syncClock(S); render(); };
  es.onopen = () => document.body.classList.remove('offline');
  es.onerror = () => document.body.classList.add('offline');
}

function render() {
  if (!key) { root.innerHTML = '<aside id="score"></aside><section id="stage"></section>'; key = 'shell'; }
  setHtml(document.getElementById('score'), scoreHtml());
  const st = document.getElementById('stage');
  const k = S.phase + '-' + S.round;
  if (S.phase === 'drawing') {
    if (st.dataset.k !== k) {
      st.dataset.k = k; st.__html = null;
      st.innerHTML = `<div class="tv-round">${S.round}. kör</div><div class="tv-info" id="tvinfo"></div>
        <div class="spinbox tvspin"><div class="sp side" id="sp-prev"></div><div class="sp main" id="sp-cur">?</div><div class="sp side" id="sp-next"></div></div>
        <div class="tv-rules">${rulesText(S)}</div><div id="tvlast"></div>`;
      spinner.start(S.alphabet.length);
    }
    if (spinner.len !== S.alphabet.length) spinner.start(S.alphabet.length);
    setHtml(document.getElementById('tvinfo'), `🎲 <b>${esc(nameOf(S.drawerId))}</b> sorsolja a betűt…`);
    const last = S.history[S.history.length - 1];
    setHtml(document.getElementById('tvlast'), last ? `<h3>Előző kör (${esc(last.letter)})</h3>` + roundTable(last.rows, S.cats, true) : '');
    return;
  }
  spinner.stop();
  st.dataset.k = k;
  let html = '';
  if (S.phase === 'lobby') html = lobbyHtml();
  else if (S.phase === 'writing') html = writingHtml();
  else if (S.phase === 'review') html = reviewHtml();
  else if (S.phase === 'final') html = finalHtml();
  setHtml(st, html);
  tvTick();
}
function tvTick() {
  const el = document.getElementById('tvtimer');
  if (el && S && S.phase === 'writing') setHtml(el, timerHtml(S));
}
setInterval(tvTick, 200);

function paint(i) {
  const cur = document.getElementById('sp-cur');
  if (!cur) return;
  const pool = ['A','CS','É','GY','K','NY','Ó','P','SZ','TY','Ü','ZS','✦','?','●','◆'];
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const set = (el, v) => { el.textContent = v; el.classList.remove('bad', 'used'); };
  set(cur, pick()); set(document.getElementById('sp-prev'), pick()); set(document.getElementById('sp-next'), pick());
  const box = document.querySelector('.spinbox');
  if (box) box.dataset.fx = String(Math.floor(i / 7) % 3);
}

function scoreHtml() {
  const ranked = [...S.players].sort((a, b) => (b.score + (b.roundPts || 0)) - (a.score + (a.roundPts || 0)));
  const rows = ranked.map(p => {
    let status = '';
    if (S.phase === 'writing') status = p.done ? '✅' : `✏️ ${p.filled}/${S.cats.length}`;
    if (S.phase === 'review') status = `+${p.roundPts}`;
    return `<li class="${p.online ? '' : 'off'}"><span class="nm">${esc(p.name)}</span><span class="stt">${status}</span><b>${p.score}</b></li>`;
  }).join('');
  const r = S.round ? `${S.round}. kör${S.maxRounds ? ' / ' + S.maxRounds : ''}` : '';
  return `<h2>🏆 Állás</h2><div class="muted">${r}</div><ul class="tvscore">${rows || '<li class="muted">Még senki sincs bent</li>'}</ul>`;
}

function lobbyHtml() {
  const url = location.origin + location.pathname.replace(/tv(\.html)?$/, '');
  return `<div class="tv-title">🌍 Ország-Város 🏙️</div>
    <div class="tv-join">Csatlakozás telefonról / tabletről:<div class="url big">${esc(url)}</div></div>
    <div class="tv-players">${S.players.map(p => `<span class="chip big">${esc(p.name)}</span>`).join('') || '<span class="muted">Várjuk a játékosokat…</span>'}</div>
    <div class="tv-rules">${rulesText(S)}</div>`;
}

function writingHtml() {
  const bars = S.players.map(p => {
    const pct = Math.round(p.filled / S.cats.length * 100);
    return `<div class="bar ${p.done ? 'done' : ''}"><span class="bn">${esc(p.name)}</span>
      <span class="bt"><span style="width:${pct}%"></span></span><span class="bs">${p.done ? '✅ Kész' : p.filled + '/' + S.cats.length}</span></div>`;
  }).join('');
  return `<div class="tv-letter-wrap"><div class="big-letter tvbig pop${bigCls(S.letter)}">${esc(S.letter)}</div>
    <div class="tv-info">${S.round}. kör · sorsolta: <b>${esc(nameOf(S.drawerId))}</b></div>
    <div id="tvtimer" class="tvtimer"></div></div>
    <div class="bars">${bars}</div>`;
}

function reviewHtml() {
  const rows = S.players.map(p => ({ id: p.id, name: p.name, answers: S.answers[p.id] || {}, marks: S.marks[p.id] || {}, pts: p.roundPts }));
  return `<div class="tv-round">${S.round}. kör – <span class="big-letter sm${bigCls(S.letter)}">${esc(S.letter)}</span> – kiértékelés</div>` + roundTable(rows, S.cats, false);
}

function roundTable(rows, cats, compact) {
  const head = cats.map(c => `<th>${c.icon} ${esc(c.label)}</th>`).join('');
  const body = rows.map(r => `<tr><th class="pn">${esc(r.name)}</th>${cats.map(c => {
    const t = String(r.answers[c.key] || '').trim();
    if (!t) return '<td class="empty">—</td>';
    const m = r.marks[c.key] || {};
    const cls = m.s === 'x' ? 'st-x' : m.s === 'pending' ? 'st-pending' : 'st-ok';
    return `<td class="${cls}">${esc(t)}${m.s === 'pending' ? ' <small>❓</small>' : ''}${m.s === 'x' && m.r === 'dup' ? ' <small>(=)</small>' : ''}</td>`;
  }).join('')}<td class="pts">+${r.pts}</td></tr>`).join('');
  return `<div class="tablewrap"><table class="tvtable ${compact ? 'compact' : ''}"><thead><tr><th></th>${head}<th>Pont</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function finalHtml() {
  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  let rank = 0, prev = null;
  const rows = ranked.map((p, i) => {
    if (p.score !== prev) { rank = i; prev = p.score; }
    return `<div class="rank r${rank + 1}"><span class="medal">${medals[rank] || (rank + 1) + '.'}</span><span class="rn">${esc(p.name)}</span><b>${p.score} pont</b></div>`;
  }).join('');
  return `<div class="tv-title">🏆 Eredményhirdetés</div><div class="tv-info">${S.history.length} kör után</div><div class="ranks tvranks">${rows}</div>`;
}

connect();
