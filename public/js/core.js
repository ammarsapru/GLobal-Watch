'use strict';
/* Global Watch — core: helpers, state, panel system (layouts, drag, dock), charts. Loaded first; everything else builds on it. */

// ================= helpers =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const enc = encodeURIComponent;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('gw-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gw-' + k, JSON.stringify(v)); } catch (e) {} }
};
let toastT;
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
async function api(path, opts) {
  let r;
  try { r = await fetch(path, opts); } catch (e) { throw new Error('The local server is not responding. Is "node server.js" still running?'); }
  const j = await r.json().catch(() => ({ error: 'The server sent an unreadable response (' + r.status + ').' }));
  if (!r.ok || j.error) { const e = new Error(j.error || 'Request failed (' + r.status + ')'); e.code = j.code; e.status = r.status; throw e; }
  return j;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function ago(ts) {
  if (!ts) return ''; const s = Math.max(0, (Date.now() - (typeof ts === 'number' ? ts : Date.parse(ts))) / 1000);
  if (!isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago';
}
const cacheNote = c => c ? (c.stale ? 'stale · ' : '') + 'updated ' + ago(c.at) + (c.hit ? ' · cached' : '') : '';
const fmtMoney = m => { if (m == null) return '—'; const v = m * 1e6; if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'; if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'; return '$' + (v / 1e6).toFixed(0) + 'M'; };
const fmtUSD = v => v == null ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(0) + 'M' : '$' + Math.round(v).toLocaleString('en-US');
const fmtPop = p => p >= 1e9 ? (p / 1e9).toFixed(2) + 'B' : p >= 1e6 ? (p / 1e6).toFixed(1) + 'M' : p >= 1e3 ? (p / 1e3).toFixed(0) + 'K' : String(p);
const fmtN = (v, d = 2) => v == null || isNaN(v) ? '—' : (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pad = n => String(n).padStart(2, '0');
const dayISO = o => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const mins = m => m == null ? '—' : Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
const loading = t => `<div class="loading">${esc(t)}</div>`;
const skeleton = (n = 4) => `<div class="skel">${'<i></i>'.repeat(n)}</div>`;
const errBox = e => `<p class="err">${esc(e.message || e)}</p>`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function seg(name, opts, cur, cls = 'seg') { return `<div class="${cls}" role="group" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`; }
function onSeg(root, name, fn) {
  const g = root.querySelector(`[data-seg="${name}"]`); if (!g) return;
  g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !g.contains(b)) return; g.querySelectorAll(':scope>button').forEach(x => x.setAttribute('aria-pressed', x === b)); fn(b.dataset.v, b); });
}
function countUp(el, to, fmt = v => Math.round(v).toLocaleString('en-US'), ms = 700) {
  if (reduce || to == null || !isFinite(to)) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / ms); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
}
function flash(el) { if (!el || reduce) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
function spark(vals, color = 'var(--info)', w = 120, h = 26) {
  const v = vals.filter(x => x != null && isFinite(x)); if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = vals.map((x, i) => x == null ? null : [(i / (vals.length - 1)) * w, h - 2 - ((x - mn) / r) * (h - 4)]).filter(Boolean);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2" fill="${color}"/></svg>`;
}
const ICON = {
  min: '<svg viewBox="0 0 16 16"><path d="M3 12h10"/></svg>', max: '<svg viewBox="0 0 16 16"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>', refresh: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3"/></svg>'
};
const PICON = {
  fin: '<svg viewBox="0 0 24 24"><path d="M3 20h18"/><path d="M4 16l5-6 4 4 7-8"/><path d="M16 6h4v4"/></svg>',
  travel: '<svg viewBox="0 0 24 24"><path d="M10.5 13.5L3 11l1.5-1.5 7 1 4-4.5c1-1 2.6-1.4 3.3-.7.7.7.3 2.3-.7 3.3l-4.5 4 1 7L13 21l-2.5-7.5z"/><path d="M5 19l3-3"/></svg>',
  news: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="15" height="16" rx="1.5"/><path d="M18 8h3v10.5A1.5 1.5 0 0 1 19.5 20H18"/><path d="M6.5 8h8M6.5 12h8M6.5 16h5"/></svg>',
  track: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  events: '<svg viewBox="0 0 24 24"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.5"/></svg>',
  gov: '<svg viewBox="0 0 24 24"><path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>',
  trade: '<svg viewBox="0 0 24 24"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>',
  weather: '<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3.5"/><path d="M8 2v1.5M2 9h1.5M3.8 4.8l1 1M12.2 4.8l-1 1"/><path d="M9 20h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4 1.6A2.7 2.7 0 0 0 9 20z"/></svg>',
  space: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 12H3M21 12h-6M5 9v6M19 9v6"/><circle cx="12" cy="12" r="10" stroke-dasharray="2 3"/></svg>'
};

// ================= reference data + shared state =================
const { topo, data: DATA } = PAYLOAD;
const S = { iso: null, d: null, f: null, status: null, world: false, settings: { watch: [], rules: [], passport: 'US', briefTime: '07:30' }, risk: null, hazards: null };
const BUS = new EventTarget();
const emit = (type, detail) => BUS.dispatchEvent(new CustomEvent(type, { detail }));
const on = (type, fn) => BUS.addEventListener(type, e => fn(e.detail));
const byA2 = {}; for (const [k, v] of Object.entries(DATA)) byA2[v.a2] = k;

// ================= panel system =================
const panels = {}; // id -> panel
const ORDER = ['news', 'fin', 'track', 'events', 'gov', 'trade', 'travel', 'weather', 'space'];
const LAYOUTS = {
  overview: { name: 'Overview', left: ['fin', 'events'], center: ['news'], right: ['track', 'gov'] },
  crisis: { name: 'Crisis watch', left: ['events', 'gov'], center: ['news'], right: ['track', 'space'] },
  markets: { name: 'Markets', left: ['fin', 'trade'], center: ['news'], right: ['gov', 'events'] },
  travel: { name: 'Travel', left: ['travel', 'weather'], center: ['news'], right: ['gov', 'events'] },
  orbit: { name: 'Tracking & space', left: ['space', 'events'], center: ['news'], right: ['track', 'weather'] }
};
let layout = store.get('layout2', null) || { key: 'overview', ...structuredClone(LAYOUTS.overview) };
const placed = () => [...layout.left, ...layout.center, ...layout.right];
const isOpen = id => placed().includes(id);

function makePanel(id, title, tabs, opts = {}) {
  const el = document.createElement('section');
  el.className = 'win'; el.id = 'p-' + id; el.dataset.id = id;
  el.innerHTML = `<header><h2>${title}</h2>${tabs ? seg('tab-' + id, tabs, store.get('tab-' + id, tabs[0][0]), 'htabs') : ''}<span class="meta"></span>
    <button class="ic" data-act="refresh" aria-label="Refresh ${title}" title="Refresh">${ICON.refresh}</button>
    <button class="ic" data-act="min" aria-label="Close ${title}" title="Close to the dock">${ICON.min}</button>
    <button class="ic" data-act="max" aria-label="Expand ${title}" title="Expand">${ICON.max}</button></header><div class="body"></div>`;
  const p = { id, title, short: opts.short || title, el, body: $('.body', el), meta: m => { $('.meta', el).textContent = m || ''; }, tab: tabs ? store.get('tab-' + id, tabs[0][0]) : null, onTab: null, onRefresh: null, onShow: null, onCountry: null, loadedFor: null };
  if (tabs) onSeg(el, 'tab-' + id, v => { p.tab = v; store.set('tab-' + id, v); p.onTab && p.onTab(v); });
  $('header', el).draggable = true;
  el.hidden = true; $('#left').appendChild(el); // in the document straight away so modules can query their own elements; applyLayout places it
  panels[id] = p;
  return p;
}
// header buttons
let maxed = null, scrim = null;
function closeMax() { if (!maxed) return; maxed.classList.remove('max'); const b = $('[data-act="max"]', maxed); b.innerHTML = ICON.max; b.title = 'Expand'; maxed = null; scrim?.remove(); scrim = null; }
document.addEventListener('click', e => {
  const b = e.target.closest('.win>header [data-act]'); if (!b) return;
  const w = b.closest('.win'), id = w.dataset.id, act = b.dataset.act;
  if (act === 'min') minimize(id);
  if (act === 'refresh') panels[id].onRefresh && panels[id].onRefresh();
  if (act === 'max') {
    if (maxed === w) return closeMax();
    closeMax(); w.classList.add('max'); maxed = w; b.innerHTML = ICON.close; b.title = 'Close';
    scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.onclick = closeMax; document.body.appendChild(scrim);
  }
});
const anim = (el, kf, o) => reduce || !el.animate ? { finished: Promise.resolve() } : el.animate(kf, o);
function saveLayout() { store.set('layout2', layout); }
function applyLayout() {
  for (const col of ['left', 'center', 'right']) {
    const host = col === 'center' ? $('#newsSlot') : $('#' + col);
    for (const id of layout[col]) { const p = panels[id]; if (!p) continue; p.el.hidden = false; host.appendChild(p.el); }
  }
  for (const id of ORDER) if (panels[id] && !isOpen(id)) panels[id].el.hidden = true;
  $('#main').classList.toggle('no-left', !layout.left.length);
  $('#main').classList.toggle('no-right', !layout.right.length);
  renderDock(); requestAnimationFrame(() => window.resizeGlobe && resizeGlobe());
  $('#layoutSel') && ($('#layoutSel').value = layout.key || 'custom');
  emit('panels', placed());
}
function renderDock(fresh) {
  const items = ORDER.filter(id => panels[id] && !isOpen(id));
  const d = $('#pdock'); d.hidden = !items.length; $('#stage').classList.toggle('has-dock', !!items.length);
  d.innerHTML = items.map(id => `<button type="button" data-restore="${id}" class="${id === fresh ? 'fresh' : ''}" title="Open ${esc(panels[id].title)}" aria-label="Open ${esc(panels[id].title)}"><span class="ring">${PICON[id] || ''}</span><small>${esc(panels[id].short)}</small></button>`).join('');
}
function flyGhost(fromRect, toRect, el, reverse) {
  const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2), dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
  const s = Math.max(.04, toRect.width / Math.max(fromRect.width, fromRect.height));
  const kf = [{ transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '4px' }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .15, borderRadius: '50%' }];
  return anim(el, reverse ? kf.reverse() : kf, { duration: reverse ? 480 : 440, easing: reverse ? 'cubic-bezier(.2,.8,.2,1)' : 'cubic-bezier(.55,0,.8,.3)' });
}
function minimize(id) {
  if (maxed && maxed.dataset.id === id) closeMax();
  const el = panels[id].el, from = el.getBoundingClientRect();
  const g = el.cloneNode(true); g.removeAttribute('id'); g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  g.classList.add('flyghost'); Object.assign(g.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
  for (const col of ['left', 'center', 'right']) layout[col] = layout[col].filter(x => x !== id);
  layout.key = 'custom'; saveLayout(); applyLayout(); renderDock(id);
  document.body.appendChild(g);
  const btn = $(`#pdock [data-restore="${id}"]`), to = btn ? $('.ring', btn).getBoundingClientRect() : from;
  if (btn) btn.style.visibility = 'hidden';
  flyGhost(from, to, g).finished.then(() => { g.remove(); if (!btn) return; btn.style.visibility = ''; anim($('.ring', btn), [{ transform: 'scale(.2)' }, { transform: 'scale(1.18)', offset: .65 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' }); });
}
function homeCol(id) { const L = LAYOUTS[layout.key] || LAYOUTS.overview; for (const c of ['left', 'center', 'right']) if (L[c].includes(id)) return c; return layout.left.length <= layout.right.length ? 'left' : 'right'; }
function restore(id, opts = {}) {
  if (isOpen(id)) { focusPanel(id); return; }
  const btn = $(`#pdock [data-restore="${id}"]`), from = btn ? $('.ring', btn).getBoundingClientRect() : null;
  const finish = () => {
    let col = opts.col || homeCol(id);
    if (col === 'center' && layout.center.length) { const bumped = layout.center[0]; layout.center = []; (layout.left.length <= layout.right.length ? layout.left : layout.right).push(bumped); }
    layout[col].push(id); layout.key = 'custom'; saveLayout(); applyLayout();
    const el = panels[id].el; if (from) flyGhost(el.getBoundingClientRect(), from, el, true);
    panels[id].onShow && panels[id].onShow();
    if (opts.focus) focusPanel(id);
  };
  if (btn) anim($('.ring', btn), [{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: .3 }, { transform: 'scale(.3)', opacity: 0 }], { duration: 220, easing: 'ease-in' }).finished.then(finish); else finish();
}
function focusPanel(id) { const el = panels[id]?.el; if (!el || el.hidden) return; el.classList.add('focus'); el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); setTimeout(() => el.classList.remove('focus'), 2200); }
function setLayout(key) {
  if (key === 'custom') { const c = store.get('layout-custom', null); if (c) layout = structuredClone(c); }
  else if (LAYOUTS[key]) layout = { key, ...structuredClone(LAYOUTS[key]) };
  saveLayout(); applyLayout(); for (const id of placed()) panels[id]?.onShow && panels[id].onShow();
}
$('#pdock').addEventListener('click', e => { const b = e.target.closest('[data-restore]'); if (b) restore(b.dataset.restore); });

// drag a panel by its header into another column (or the slot above the globe)
let dragId = null;
document.addEventListener('dragstart', e => { const h = e.target.closest?.('.win>header'); if (!h) return; const w = h.parentElement; if (w.classList.contains('max')) { e.preventDefault(); return; } dragId = w.dataset.id; w.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} });
document.addEventListener('dragend', () => { $$('.win.dragging').forEach(w => w.classList.remove('dragging')); $$('.drop-ok').forEach(c => c.classList.remove('drop-ok')); $$('.drop-mark').forEach(m => m.remove()); dragId = null; });
function dropTarget(e) { return e.target.closest?.('[data-col]'); }
document.addEventListener('dragover', e => {
  if (!dragId) return; const col = dropTarget(e); $$('.drop-ok').forEach(c => c !== col && c.classList.remove('drop-ok')); if (!col) return;
  e.preventDefault(); col.classList.add('drop-ok');
  $$('.drop-mark').forEach(m => m.remove());
  if (col.dataset.col !== 'center') { const after = [...col.querySelectorAll(':scope>.win:not(.dragging)')].find(w => e.clientY < w.getBoundingClientRect().top + w.offsetHeight / 2); const m = document.createElement('div'); m.className = 'drop-mark'; col.insertBefore(m, after || null); }
});
document.addEventListener('drop', e => {
  const col = dropTarget(e); if (!dragId || !col) return; e.preventDefault();
  const name = col.dataset.col; const mark = $('.drop-mark', col);
  const sibs = [...col.children]; const idx = mark ? sibs.filter(n => n.classList.contains('win') && !n.classList.contains('dragging')).indexOf(sibs.slice(sibs.indexOf(mark) + 1).find(n => n.classList.contains('win') && !n.classList.contains('dragging'))) : -1;
  const from = ['left', 'center', 'right'].find(c => layout[c].includes(dragId));
  for (const c of ['left', 'center', 'right']) layout[c] = layout[c].filter(x => x !== dragId);
  if (name === 'center') { if (layout.center.length) layout[from || 'left'].push(layout.center[0]); layout.center = [dragId]; }
  else if (idx < 0) layout[name].push(dragId); else layout[name].splice(idx, 0, dragId);
  layout.key = 'custom'; store.set('layout-custom', layout); saveLayout(); applyLayout(); toast('Layout saved as "My layout".');
});

// ================= charts =================
const chartRO = new ResizeObserver(es => { for (const e of es) { const b = e.target; if (b._chart && Math.abs(b.clientWidth - b._w) > 24) lineChart(b, ...b._chart); } });
// series: [{pts:[{x,y,label}], color, dash, area}]; opts: h, fmtY, fmtX, xTicks, onHover(i), baseline, band:[lo,hi], marks:[{x, label, color}]
function lineChart(box, series, opts = {}) {
  const { h = 150, fmtY = v => v, fmtX = v => v, xTicks = 5, onHover, baseline, band, marks = [] } = opts;
  box._chart = [series, opts]; box._w = box.clientWidth; chartRO.observe(box);
  const w = Math.max(260, Math.round(box.clientWidth) || 460), m = { l: 50, r: 10, t: 8, b: 20 };
  const all = series.flatMap(s => s.pts);
  if (all.length < 2) { box.innerHTML = '<p class="note">Not enough data to chart.</p>'; return; }
  const x = d3.scaleLinear().domain(d3.extent(all, p => p.x)).range([m.l, w - m.r]);
  const ext = d3.extent(all, p => p.y); if (baseline != null) { ext[0] = Math.min(ext[0], baseline); ext[1] = Math.max(ext[1], baseline); } if (band) { ext[0] = Math.min(ext[0], band[0]); ext[1] = Math.max(ext[1], band[1]); }
  const pd = (ext[1] - ext[0]) * 0.06 || Math.abs(ext[0]) * 0.05 || 1;
  const y = d3.scaleLinear().domain([ext[0] - pd, ext[1] + pd]).nice(4).range([h - m.b, m.t]);
  const line = d3.line().defined(p => p.y != null).x(p => x(p.x)).y(p => y(p.y));
  const area = d3.area().defined(p => p.y != null).x(p => x(p.x)).y0(h - m.b).y1(p => y(p.y));
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">`;
  y.ticks(4).forEach(t => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${m.l - 6}" y="${y(t) + 3}" text-anchor="end">${esc(fmtY(t))}</text>`; });
  if (band) s += `<rect x="${m.l}" width="${w - m.l - m.r}" y="${y(band[1])}" height="${Math.max(1, y(band[0]) - y(band[1]))}" fill="var(--info)" opacity=".08"/>`;
  const p0 = series[0].pts; const idx = d3.range(xTicks).map(i => Math.round(i * (p0.length - 1) / (xTicks - 1)));
  [...new Set(idx)].forEach(i => { const p = p0[i]; s += `<text x="${x(p.x)}" y="${h - 5}" text-anchor="${i === 0 ? 'start' : i === p0.length - 1 ? 'end' : 'middle'}">${esc(fmtX(p))}</text>`; });
  if (baseline != null) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(baseline)}" y2="${y(baseline)}" stroke="var(--muted)" stroke-dasharray="3 3" opacity=".6"/>`;
  series.forEach(sr => {
    if (sr.area) s += `<path d="${area(sr.pts)}" fill="${sr.color}" opacity=".12"/>`;
    s += `<path d="${line(sr.pts)}" fill="none" stroke="${sr.color}" stroke-width="1.8" ${sr.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    const l = sr.pts.filter(p => p.y != null).at(-1); if (l) s += `<circle cx="${x(l.x)}" cy="${y(l.y)}" r="3" fill="${sr.color}"/>`;
  });
  for (const mk of marks) { const p = p0[d3.minIndex(p0, q => Math.abs(q.x - mk.x))]; if (!p || p.y == null) continue; s += `<g class="mk"><line x1="${x(p.x)}" x2="${x(p.x)}" y1="${m.t}" y2="${h - m.b}" stroke="${mk.color || 'var(--violet)'}" opacity=".35" stroke-dasharray="2 3"/><path d="M${x(p.x)},${y(p.y) - 9} l4,4 l-4,4 l-4,-4z" fill="${mk.color || 'var(--violet)'}"><title>${esc(mk.label)}</title></path></g>`; }
  s += `<g class="hov" style="display:none"><line y1="${m.t}" y2="${h - m.b}" stroke="var(--muted)"/>${series.map(sr => `<circle r="3.5" fill="${sr.color}" stroke="var(--bg)"/>`).join('')}</g>`;
  s += `<rect x="${m.l}" y="${m.t}" width="${w - m.l - m.r}" height="${h - m.t - m.b}" fill="transparent" class="ov"/></svg>`;
  box.innerHTML = s;
  const svg = $('svg', box), hov = $('.hov', svg), ov = $('.ov', svg);
  const move = e => {
    const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * w / r.width; const xv = x.invert(px);
    const i = d3.minIndex(p0, p => Math.abs(p.x - xv)); const p = p0[i]; if (p.y == null) return; hov.style.display = '';
    $('line', hov).setAttribute('x1', x(p.x)); $('line', hov).setAttribute('x2', x(p.x));
    $$('circle', hov).forEach((c, k) => { const q = series[k].pts.find(z => z.x === p.x) || series[k].pts[d3.minIndex(series[k].pts, z => Math.abs(z.x - p.x))]; if (!q || q.y == null) return; c.setAttribute('cx', x(q.x)); c.setAttribute('cy', y(q.y)); });
    onHover && onHover(i);
  };
  ov.addEventListener('pointermove', move); ov.addEventListener('pointerdown', move);
  ov.addEventListener('pointerleave', () => { hov.style.display = 'none'; onHover && onHover(null); });
}

// ================= shared AI runner =================
async function runAI(btn, box, payload, after) {
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Thinking…'; box.hidden = false; box.innerHTML = loading('Asking ' + (S.status?.ai?.provider || 'the AI') + '…');
  let res = null, err = null;
  try { res = await post('/api/ai', payload); box.innerHTML = esc(res.text) + `<span class="src">${esc(res.provider || '')}${res.model ? ' · ' + esc(res.model) : ''}${res._cache?.hit ? ' · cached' : ''}</span>`; }
  catch (e) { err = e; box.innerHTML = e.code === 'no_ai' ? `<span class="down">AI isn't connected.</span> ${esc(e.message)}` : errBox(e); }
  btn.disabled = false; btn.textContent = label; after && after(res, err);
}
// country bounding box "w,s,e,n" (handles the antimeridian), padded
function countryBox(f, pad = 0.3) {
  if (!f) return null; const [[w, s], [e, n]] = d3.geoBounds(f);
  const W = w - pad < -180 ? w - pad + 360 : w - pad, E = e + pad > 180 ? e + pad - 360 : e + pad;
  return [W, Math.max(-90, s - pad), E, Math.min(90, n + pad)].map(v => +v.toFixed(2));
}
const inBox = (b, lon, lat) => { if (!b) return false; const [w, s, e, n] = b; if (lat < s || lat > n) return false; return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e; };
