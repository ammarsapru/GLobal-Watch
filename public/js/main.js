'use strict';
/* Country selection, world mode, search, clock, boot. Everything that changes the country goes through the 'country' event. */
const WORLD_OK = new Set(['news', 'events', 'space']);
let localTZ = [];
function header() {
  const box = $('#country');
  if (!S.iso) { box.innerHTML = `<h1>World</h1><span class="eyebrow">All countries · ${new Date().toUTCString().slice(0, 16)}</span><div class="facts"><span>Pick a country on the globe or press <kbd>Ctrl K</kbd></span></div>`; document.title = 'Global Watch'; return; }
  const d = S.d;
  box.innerHTML = `<h1>${esc(d.n)} <span class="risk" id="riskBadge" hidden></span></h1><span class="eyebrow">${S.iso} · ${esc(d.cont)}</span><div class="facts"><span>Capital <b>${esc(d.cap || '—')}</b></span><span>Pop. <b>${d.p ? fmtPop(d.p[1]) : '—'}</b></span><span>Currency <b>${esc(d.cur || '—')}</b></span><span id="localTime"></span></div>`;
  document.title = d.n + ' · Global Watch';
}
function tickClock() {
  const now = new Date(); $('#clock').textContent = now.toISOString().slice(11, 19) + ' UTC';
  const el = $('#localTime'); if (!el || !localTZ.length) return;
  const off = tz => { try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(now).map(x => [x.type, x.value])); return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes())) / 60e3; } catch (e) { return null; } };
  const offs = [...new Set(localTZ.map(off).filter(v => v != null))].sort((a, b) => a - b); if (!offs.length) return;
  const at = o => { const d = new Date(now.getTime() + o * 60e3); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
  const first = at(offs[0]), last = offs.length > 1 ? at(offs.at(-1)) : null;
  el.innerHTML = `Local <b>${first}${last ? '…' + last : ''}</b>${offs.length > 1 ? ` <span class="dim" title="${esc(localTZ.join(', '))}">${offs.length} zones</span>` : ''}`;
}
function revealPanels() {
  if (reduce) return;
  placed().forEach((id, k) => { const w = panels[id]?.el; if (!w) return; w.style.setProperty('--d', k * 70 + 'ms'); w.classList.remove('arrive'); void w.offsetWidth; w.classList.add('arrive'); setTimeout(() => w.classList.remove('arrive'), 900 + k * 70); });
}
function select(iso) {
  const d = DATA[iso]; if (!d) return;
  const same = iso === S.iso && !S.world;
  S.iso = iso; S.d = d; S.f = featByIso[iso] || null; S.world = false; store.set('last', iso);
  if (S.f) flyTo(S.f.c, Math.max(1, Math.min(G.zoom, 1.4)));
  if (same) return;
  header(); localTZ = []; tickClock(); showCard(null); $$('.win.nocountry').forEach(w => w.classList.remove('nocountry'));
  GL.sel = null; GL.trail = null; GL.satTrack = null; GL.data.places = []; GL.data.unrest = []; GL.data.arcs = [];
  for (const id of ORDER) { const p = panels[id]; if (!p) continue; p.body.scrollTop = 0; if (isOpen(id)) { try { p.onCountry && p.onCountry(); } catch (e) { console.error(id, e); } p.pending = false; } else p.pending = true; }
  revealPanels();
  api('/api/ref?iso=' + iso).then(r => { if (S.iso === iso) { localTZ = r.tz || []; tickClock(); } }).catch(() => {});
  setTimeout(() => { if (S.iso === iso) computeRisk().then(renderRisk).catch(() => {}); }, 1200);
}
function worldMode() {
  S.iso = null; S.d = null; S.f = null; S.world = true; store.set('last', 'WLD');
  G.fly = { i: d3.interpolate(G.rot.slice(), [G.rot[0], -15, 0]), z: d3.interpolate(G.zoom, 1), t0: performance.now(), dur: reduce ? 1 : 900 };
  header(); localTZ = []; showCard(null); GL.sel = null; GL.trail = null; GL.satTrack = null; GL.data.air = []; GL.data.arcs = []; GL.data.places = []; GL.data.unrest = [];
  for (const id of ORDER) { const p = panels[id]; if (!p) continue; p.el.classList.toggle('nocountry', !WORLD_OK.has(id)); if (WORLD_OK.has(id) && isOpen(id)) { p.onCountry && p.onCountry(); p.pending = false; } else if (WORLD_OK.has(id)) p.pending = true; }
  if (GL.choro === 'off') setChoro('advisory');
  emit('world'); loadStrip();
}
on('country', iso => select(iso));
on('panels', ids => { for (const id of ids) { const p = panels[id]; if (p?.pending && (S.iso || WORLD_OK.has(id))) { p.pending = false; try { p.onCountry && p.onCountry(); } catch (e) { console.error(id, e); } } } });
$('#worldBtn').onclick = worldMode;

// ---------------- search box ----------------
const qEl = $('#q'), resEl = $('#results');
const clist = Object.entries(DATA).map(([k, v]) => ({ k, n: v.n })).sort((a, b) => a.n.localeCompare(b.n));
let hits = [], hiI = 0;
function showRes() { const t = qEl.value.trim().toLowerCase(); if (!t) { resEl.hidden = true; return; } hits = clist.filter(x => x.n.toLowerCase().includes(t) || x.k.toLowerCase() === t).sort((a, b) => b.n.toLowerCase().startsWith(t) - a.n.toLowerCase().startsWith(t)).slice(0, 8); hiI = 0; resEl.innerHTML = hits.length ? hits.map((h, i) => `<button type="button" data-k="${h.k}" class="${i === 0 ? 'on' : ''}">${esc(h.n)}<small>${h.k}</small></button>`).join('') : '<p class="note" style="padding:8px 10px">No country matches that name.</p>'; resEl.hidden = false; }
qEl.addEventListener('input', showRes);
qEl.addEventListener('keydown', e => { if (e.key === 'Escape') { resEl.hidden = true; qEl.blur(); return; } if (resEl.hidden || !hits.length) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hiI = (hiI + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; [...resEl.children].forEach((b, i) => b.classList.toggle('on', i === hiI)); } if (e.key === 'Enter') chooseRes(hits[hiI].k); });
resEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) chooseRes(b.dataset.k); });
function chooseRes(k) { qEl.value = ''; resEl.hidden = true; qEl.blur(); emit('country', k); }
document.addEventListener('click', e => { if (!e.target.closest('.search')) resEl.hidden = true; });

// ---------------- boot ----------------
(async function boot() {
  applyLayout(); startGlobe(); refreshStatus();
  S.settings = await api('/api/settings').catch(() => S.settings);
  setInterval(tickClock, 1000); setInterval(refreshStatus, 120e3);
  loadStrip(); setInterval(loadStrip, 5 * 60e3);
  pollAlerts(); setInterval(pollAlerts, 60e3);
  armNewsTimer();
  let start = store.get('last', 'JPN');
  if (start === 'WLD') { worldMode(); }
  else { if (!DATA[start]) start = 'JPN'; if (featByIso[start]) { const c = featByIso[start].c; G.rot = [-c[0] + 25, -c[1], 0]; } select(start); }
  if (!store.get('seenVoiceHint', false)) { setTimeout(() => toast('Tip: press P and ask a question out loud. Ctrl+K opens the command palette.', 7000), 2500); store.set('seenVoiceHint', true); }
})();
