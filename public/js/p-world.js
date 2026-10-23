'use strict';
/* World panels: Events (hazards · unrest · internet outages) · Government (leaders · advisories · risk score) ·
   Trade (partners and products, drawn as arcs) · Weather (now, 7 days, climate) · Space (satellites as live dots). */
const near = (lat, lon, pad = 4) => S.f && inBox(countryBox(S.f, pad), lon, lat);
const sevCls = s => s === 'crit' || s === 'Red' ? 'crit' : s === 'warn' || s === 'Orange' ? 'warn' : 'info';

// ===================== EVENTS =====================
const ev = makePanel('events', 'Events', [['haz', 'Hazards'], ['unrest', 'Unrest'], ['net', 'Internet']], { short: 'Events' });
ev.body.innerHTML = `<div class="view" data-tab="haz"><div id="evHaz"></div></div><div class="view" data-tab="unrest" hidden><div id="evUnrest"></div></div><div class="view" data-tab="net" hidden><div id="evNet"></div></div>`;
ev.onTab = v => { $$('#p-events .view[data-tab]').forEach(x => x.hidden = x.dataset.tab !== v); ({ haz: loadHazards, unrest: loadUnrest, net: loadNet })[v](); };
ev.onRefresh = () => ({ haz: () => loadHazards(true), unrest: () => loadUnrest(true), net: () => loadNet(true) })[ev.tab]();
ev.onCountry = () => { E.unrestFor = null; E.netFor = null; ev.onTab(ev.tab); };
ev.onShow = () => ev.onTab(ev.tab);
const E = { haz: null, kind: 'all' };
async function loadHazards(force) {
  const box = $('#evHaz'); if (!E.haz || force) box.innerHTML = skeleton(5);
  try {
    if (!E.haz || force) { E.haz = await api('/api/hazards' + (force ? '?force=1' : '')); }
    const r = E.haz; S.hazards = r;
    const all = [...r.alerts, ...r.quakes, ...r.events].map(h => ({ ...h, near: near(h.lat, h.lon) || (h.iso3 && h.iso3 === S.iso) }));
    GL.data.hazards = all;
    const list = all.filter(h => E.kind === 'all' || h.kind === E.kind).sort((a, b) => (b.near - a.near) || (Date.parse(b.time) - Date.parse(a.time)));
    const nNear = all.filter(h => h.near).length;
    box.innerHTML = `<div class="tiles"><div><small>Earthquakes M4.5+ (7 d)</small><strong>${r.quakes.length}</strong></div><div><small>Disaster alerts</small><strong class="${r.alerts.some(a => a.level === 'Red') ? 'down' : ''}">${r.alerts.length}</strong></div><div><small>Natural events</small><strong>${r.events.length}</strong></div><div><small>${S.iso ? 'Near ' + esc(S.d.n) : 'Near selection'}</small><strong class="${nNear ? 'warn' : ''}">${S.iso ? nNear : '—'}</strong></div></div>
      <div class="bar">${seg('hkind', [['all', 'ALL'], ['alert', 'GDACS ALERTS'], ['quake', 'QUAKES'], ['event', 'FIRES · STORMS · VOLCANOES']], E.kind)}</div>
      ${r.errors?.length ? `<p class="note">Partly unavailable: ${esc(r.errors.join('; '))}</p>` : ''}
      <div class="list">${list.slice(0, 60).map((h, i) => `<div class="alert-row click" data-h="${i}"><span class="sev ${h.kind === 'quake' ? (h.mag >= 7 ? 'crit' : h.mag >= 6 ? 'warn' : 'info') : h.kind === 'alert' ? sevCls(h.level) : 'info'}">${h.kind === 'quake' ? 'M' + h.mag.toFixed(1) : h.kind === 'alert' ? esc(h.level) : esc((h.cat || '').split(' ')[0])}</span>
        <div class="grow"><b>${esc(h.kind === 'alert' ? h.type + ' · ' + h.title : h.kind === 'quake' ? h.place : h.title)}</b>${h.near ? ' <span class="tag warn">NEAR</span>' : ''}${h.tsunami ? ' <span class="tag down">TSUNAMI FLAG</span>' : ''}
        <div class="note">${esc(ago(h.time))}${h.kind === 'quake' ? ' · depth ' + Math.round(h.depth) + ' km' : ''}${h.country ? ' · ' + esc(h.country) : ''}</div></div>
        ${h.url ? `<a class="ext" href="${esc(h.url)}" target="_blank" rel="noopener">source</a>` : ''}</div>`).join('') || '<div class="empty">Nothing in this category.</div>'}</div>
      <p class="note">USGS earthquakes, NASA EONET natural events and GDACS disaster alerts. All are drawn on the globe when the Hazards layer is on.</p>`;
    onSeg(box, 'hkind', v => { E.kind = v; loadHazards(); });
    $$('#evHaz [data-h]').forEach(el => el.onclick = e => { if (e.target.closest('a')) return; const h = list[+el.dataset.h]; flyTo([h.lon, h.lat], Math.max(G.zoom, 2.6)); lift(); sink(5000); hazardCard(h); });
    ev.meta(cacheNote(r._cache));
  } catch (e) { box.innerHTML = errBox(e); }
}
function hazardCard(h) {
  showCard(`<b>${esc(h.kind === 'quake' ? 'M' + h.mag + ' earthquake' : h.kind === 'alert' ? h.level + ' alert · ' + h.type : h.cat)}</b><p>${esc(h.kind === 'quake' ? h.place : h.title)}</p><p class="note">${esc(ago(h.time))}${h.depth != null ? ' · depth ' + Math.round(h.depth) + ' km' : ''}${h.severity ? ' · ' + esc(h.severity) : ''}</p>${h.url ? `<a class="ext" href="${esc(h.url)}" target="_blank" rel="noopener">Details</a>` : ''}`);
}
async function loadUnrest(force) {
  const box = $('#evUnrest'); if (!S.iso) { box.innerHTML = '<div class="empty">Pick a country to see protests, strikes and clashes reported in the news.</div>'; GL.data.unrest = []; return; }
  if (E.unrestFor === S.iso && !force) return; const iso = S.iso; box.innerHTML = skeleton(4);
  try {
    const r = await api('/api/unrest?iso=' + iso + (force ? '&force=1' : '')); if (iso !== S.iso) return; E.unrestFor = iso;
    GL.data.unrest = r.points || [];
    const v = r.volume.map(x => x.v); const now = v.slice(-4).reduce((a, b) => a + b, 0) / 4, before = v.slice(0, -4).reduce((a, b) => a + b, 0) / Math.max(1, v.length - 4);
    S.unrest = { iso, trend: before ? now / before : 1 };
    box.innerHTML = `<div class="minis"><div class="mini"><small>Unrest coverage · 7 days</small><strong class="${now > before * 1.4 ? 'down' : ''}">${before ? (now / before > 1 ? '+' : '') + Math.round((now / before - 1) * 100) + '%' : '—'}</strong>${spark(v, 'var(--violet)')}<em class="note">share of all coverage about protests, strikes, riots and clashes</em></div><div class="mini"><small>Places mentioned</small><strong>${(r.points || []).length}</strong><em class="note">shown as violet dots on the globe</em></div></div>
      <div class="list">${r.items.map(i => `<div class="story"><div class="h"><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a></div><div class="s"><span>${esc(i.source)}</span><span>${esc(ago(i.date))}</span>${i.state ? '<span class="tag warn">STATE MEDIA</span>' : ''}</div></div>`).join('') || '<div class="empty">No reports of unrest in the last few days.</div>'}</div>
      <p class="note">GDELT, filtered to protest, strike, riot and clash themes. Coverage measures attention, not the size of events.</p>`;
    ev.meta(cacheNote(r._cache)); emit('riskRender');
  } catch (e) { box.innerHTML = errBox(e); }
}
async function loadNet(force) {
  const box = $('#evNet'); const iso = S.iso; box.innerHTML = skeleton(4);
  try {
    if (!iso) {
      const r = await api('/api/outages' + (force ? '?force=1' : ''));
      const rows = r.rows.filter(x => x.score > 0).sort((a, b) => b.score - a.score);
      box.innerHTML = `<span class="eyebrow">Countries with internet disruption · last 24 h</span><div class="bars">${rows.slice(0, 15).map(x => `<div class="click" data-cc="${esc(x.cc)}"><span>${esc(x.name)}</span><b style="width:${Math.min(100, Math.log10(1 + x.score) / 6 * 100)}%;background:var(--warn)"></b><span class="dim">${fmtN(x.score, 0)}</span></div>`).join('')}</div><p class="note">IODA (Georgia Tech) outage scores combine BGP routing, active probing and telescope traffic.</p>`;
      $$('#evNet [data-cc]').forEach(el => el.onclick = () => { const i = byA2[el.dataset.cc]; if (i) emit('country', i); });
      return;
    }
    const r = await api('/api/outages?iso=' + iso + (force ? '&force=1' : '')); if (iso !== S.iso) return;
    const LBL = { bgp: 'Routing (BGP)', 'ping-slash24': 'Active probing', 'merit-nt': 'Telescope', gtr: 'Google traffic' };
    const COL = { bgp: 'var(--info)', 'ping-slash24': 'var(--ok)', 'merit-nt': 'var(--violet)', gtr: 'var(--accent)' };
    box.innerHTML = `${r.alerts.length ? `<div class="list">${r.alerts.slice(0, 10).map(a => `<div class="alert-row"><span class="sev ${a.level === 'critical' ? 'crit' : 'warn'}">${esc(a.level || 'alert')}</span><div class="grow"><b>${esc(LBL[a.source] || a.source)} dropped</b><div class="note">${esc(ago(a.time * 1000 || a.time))}${a.entity ? ' · ' + esc(a.entity) : ''}</div></div></div>`).join('')}</div>` : `<p class="note up">No outage alerts for ${esc(S.d.n)} in the last 48 hours.</p>`}
      <span class="eyebrow">Connectivity signals · 48 h (normalised)</span><div id="netChart"></div>
      <div class="chiplist">${r.series.map(s => `<span class="tag n"><i class="dot" style="background:${COL[s.source] || 'var(--muted)'}"></i> ${esc(LBL[s.source] || s.source)}</span>`).join('')}</div>
      <p class="note">A sudden drop in several signals at once usually means a shutdown or a major cable or power failure. Source: IODA.</p>`;
    const series = r.series.filter(s => s.values?.length > 2).map(s => { const mx = Math.max(...s.values.filter(v => v != null)) || 1; return { pts: s.values.map((v, i) => ({ x: (s.from + i * s.step) * 1000, y: v == null ? null : v / mx * 100 })).filter(p => p.y != null), color: COL[s.source] || 'var(--muted)' }; });
    if (series.length) lineChart($('#netChart'), series, { h: 110, fmtY: v => Math.round(v) + '%', fmtX: p => new Date(p.x).toLocaleString([], { weekday: 'short', hour: '2-digit' }), xTicks: 4 });
    ev.meta(cacheNote(r._cache));
  } catch (e) { box.innerHTML = errBox(e); }
}
on('pick', ({ kind, item }) => {
  if (kind === 'hazard') hazardCard(item);
  if (kind === 'unrest') showCard(`<b>${esc(item.name)}</b><p class="note">${item.count} report${item.count > 1 ? 's' : ''} of unrest mention this place.</p><div class="note">${String(item.html || '').replace(/<(?!\/?(a|br)\b)[^>]*>/g, '')}</div>`);
  if (kind === 'place') showCard(`<b>${esc(item.name)}</b><p class="note">Mentioned in ${item.count} recent article${item.count > 1 ? 's' : ''}.</p><div class="note">${String(item.html || '').replace(/<(?!\/?(a|br)\b)[^>]*>/g, '')}</div>`);
  if (kind === 'arc') showCard(`<b>${esc(item.label)}</b><p class="note">${esc(item.detail || '')}</p>`);
});
on('layers', L => { if (L.unrest && S.iso && isOpen('events')) loadUnrest(); if (L.hazards && !E.haz) loadHazards(); });

// ===================== GOVERNMENT =====================
const gov = makePanel('gov', 'Government', [['gov', 'Leaders'], ['adv', 'Advisories'], ['risk', 'Risk']], { short: 'Gov' });
gov.body.innerHTML = `<div class="view" data-tab="gov"><div id="gGov"></div></div><div class="view" data-tab="adv" hidden><div id="gAdv"></div></div><div class="view" data-tab="risk" hidden><div id="gRisk"></div></div>`;
gov.onTab = v => { $$('#p-gov .view[data-tab]').forEach(x => x.hidden = x.dataset.tab !== v); ({ gov: loadGov, adv: loadAdv, risk: () => computeRisk().then(renderRisk) })[v](); };
gov.onRefresh = () => { Gv.for = null; Gv.advFor = null; gov.onTab(gov.tab); };
gov.onCountry = () => { Gv.for = null; Gv.advFor = null; gov.onTab(gov.tab); };
const Gv = {};
async function loadGov() {
  const box = $('#gGov'); if (!S.iso) { box.innerHTML = '<div class="empty">Pick a country.</div>'; return; }
  if (Gv.for === S.iso) return; const iso = S.iso; box.innerHTML = skeleton(5);
  try {
    const r = await api('/api/gov?iso=' + iso); if (iso !== S.iso) return; Gv.for = iso; Gv.gov = r;
    const up = r.elections.filter(e => e.upcoming), past = r.elections.filter(e => !e.upcoming);
    box.innerHTML = `<div class="reveal"><div class="body">
      ${r.people.map(p => `<div class="person">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc(p.name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>`}<div><small>${esc(p.role)}</small><b>${esc(p.name)}</b><span class="note">${p.since ? 'since ' + esc(new Date(p.since).getFullYear()) : ''}${p.party ? ' · ' + esc(p.party) : ''}</span></div>${p.wiki ? `<a class="ext" href="${esc(p.wiki)}" target="_blank" rel="noopener">Wikidata</a>` : ''}</div>`).join('') || '<p class="note">No leaders recorded.</p>'}
      <div class="stats one"><div class="row"><span>System</span><span>${esc(r.system.join(', ') || '—')}</span></div><div class="row"><span>Legislature</span><span>${esc(r.legislature.join(', ') || '—')}</span></div>
      ${up.length ? `<div class="row"><span>Next election</span><span class="warn">${esc(up[0].name)} · ${esc(up[0].date)}</span></div>` : ''}${past[0] ? `<div class="row"><span>Last election</span><span>${esc(past.at(-1).name)} · ${esc(past.at(-1).date)}</span></div>` : ''}</div>
      ${r.members.length ? `<span class="eyebrow">Member of</span><div class="chiplist">${r.members.slice(0, 18).map(m => `<span class="tag n">${esc(m)}</span>`).join('')}</div>` : ''}
      <p class="note">From Wikidata, which can lag behind events by days. <a class="ext" href="${esc(r.wikidata)}" target="_blank" rel="noopener">Open record</a></p></div></div>`;
    $$('#gGov .reveal>.body>*').forEach((el, i) => el.style.setProperty('--i', i));
    gov.meta(cacheNote(r._cache));
  } catch (e) { box.innerHTML = errBox(e); }
}
async function loadAdv() {
  const box = $('#gAdv'); if (!S.iso) { box.innerHTML = '<div class="empty">Pick a country.</div>'; return; }
  if (Gv.advFor === S.iso) return; const iso = S.iso; box.innerHTML = skeleton(4);
  try {
    const r = await api('/api/advisory?iso=' + iso); if (iso !== S.iso) return; Gv.advFor = iso; Gv.adv = r;
    const us = r.us, uk = r.uk, lv = us?.level;
    box.innerHTML = `<div class="minis"><div class="mini"><small>United States</small><strong class="${ADV[lv]?.[1] || ''}">${lv ? 'Level ' + lv : '—'}</strong><em class="note">${esc(lv ? ADV[lv][0] : r.usError || 'Not listed')}</em></div>
      <div class="mini"><small>United Kingdom</small><strong class="${uk?.alert?.length ? 'down' : ''}">${uk?.alert?.length ? 'Warnings' : uk && !uk.error ? 'Advice' : '—'}</strong><em class="note">${esc(uk?.alert?.join(' · ') || (uk?.error ? uk.error : 'See below'))}</em></div></div>
      ${us ? `<div class="detail"><div class="bar"><b>${esc(us.title)}</b><span class="grow"></span><a class="ext" href="${esc(us.link)}" target="_blank" rel="noopener">State Dept</a></div><p class="note">${esc(us.summary)}</p><p class="note">Updated ${esc(ago(us.updated))}</p></div>` : ''}
      ${uk && !uk.error ? `<div class="detail"><div class="bar"><b>${esc(uk.title)}</b><span class="grow"></span><a class="ext" href="${esc(uk.link)}" target="_blank" rel="noopener">GOV.UK</a></div><p class="note">${esc(uk.summary)}</p>${(uk.parts || []).map(p => `<details><summary>${esc(p.title)}</summary><p class="note">${esc(String(p.text).slice(0, 900))}</p></details>`).join('')}<p class="note">Updated ${esc(ago(uk.updated))}</p></div>` : ''}
      <p class="note">Advisories are a diplomatic signal as much as a safety one: a sudden level change often follows a political event. The collector alerts you when the US level changes.</p>`;
  } catch (e) { box.innerHTML = errBox(e); }
}
// ---- country risk score (0–100). Transparent and simple on purpose: each part shows its inputs.
let advLevels = null, outRows = null;
async function computeRisk() {
  if (!S.iso) return null; const iso = S.iso;
  if (!advLevels) advLevels = (await api('/api/advisories').catch(() => ({ levels: {} }))).levels;
  if (!outRows) outRows = (await api('/api/outages').catch(() => ({ rows: [] }))).rows;
  const econ = await loadEcon().catch(() => null); if (iso !== S.iso) return null;
  const code = (S.d?.cur || '').split(',')[0].trim();
  const fx = F$.fxFor === iso ? F$.fx : code ? await api('/api/fx?code=' + code).catch(() => null) : null; if (iso !== S.iso) return null;
  const last = id => econ?.wb?.series?.[id]?.at(-1)?.[1];
  const clamp = v => Math.max(0, Math.min(1, v));
  const lv = advLevels[iso], inf = last('FP.CPI.TOTL.ZG'), debt = last('GC.DOD.TOTL.GD.ZS'), gr = last('NY.GDP.MKTP.KD.ZG');
  const out = outRows.find(r => r.cc === S.d.a2)?.score || 0; const fxc = fx?.change365;
  const hz = (S.hazards ? [...S.hazards.alerts, ...S.hazards.quakes] : []).filter(h => near(h.lat, h.lon, 2) && (h.kind === 'alert' ? h.level !== 'Green' : h.mag >= 6)).length;
  const un = S.unrest?.iso === iso ? S.unrest.trend : null;
  const parts = [
    ['Travel advisory', 30, lv ? clamp((lv - 1) / 3) : null, lv ? 'US level ' + lv : 'not listed'],
    ['Inflation', 15, inf != null ? clamp((inf - 2) / 25) : null, inf != null ? fmtN(inf, 1) + '%' : '—'],
    ['Currency (1 y vs USD)', 15, fxc != null ? clamp(-fxc / 40) : null, fxc != null ? (fxc > 0 ? '+' : '') + fmtN(fxc, 1) + '%' : '—'],
    ['Government debt', 10, debt != null ? clamp((debt - 60) / 120) : null, debt != null ? fmtN(debt, 0) + '% of GDP' : '—'],
    ['Growth', 10, gr != null ? clamp((1 - gr) / 6) : null, gr != null ? fmtN(gr, 1) + '%' : '—'],
    ['Internet disruption', 10, clamp((Math.log10(1 + out) - 3) / 3), out ? 'IODA ' + fmtN(out, 0) : 'none'],
    ['Unrest trend', 5, un != null ? clamp((un - 1) / 1.5) : null, un != null ? (un > 1 ? '+' : '') + Math.round((un - 1) * 100) + '% coverage' : 'open Events › Unrest'],
    ['Natural hazards', 5, clamp(hz / 2), hz + ' major nearby']];
  const have = parts.filter(p => p[2] != null); const w = have.reduce((a, p) => a + p[1], 0);
  const score = w ? Math.round(have.reduce((a, p) => a + p[1] * p[2], 0) / w * 100) : null;
  S.risk = { iso, score, parts, level: score == null ? 0 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0 };
  emit('risk', S.risk); return S.risk;
}
function riskHTML(r) {
  if (!r || r.score == null) return '<p class="note">Not enough data to score this country yet.</p>';
  const word = ['Low', 'Moderate', 'Elevated', 'High'][r.level];
  return `<div class="bar"><span class="risk l${r.level}" style="font-size:22px">${r.score}</span><b>${word} risk</b><span class="note grow">0 calm · 100 severe</span></div>
    <div class="bars">${r.parts.map(([n, wt, v, txt]) => `<div title="weight ${wt}%"><span>${esc(n)}</span><b style="width:${v == null ? 0 : Math.max(2, v * 100)}%;background:${v == null ? 'transparent' : v > .66 ? 'var(--warn)' : v > .33 ? 'var(--accent)' : 'var(--ok)'}"></b><span class="dim">${esc(txt)}</span></div>`).join('')}</div>
    <p class="note">Weighted blend of the inputs above (weights in the tooltip); missing inputs are left out rather than guessed. It is a quick screen, not a rating.</p>`;
}
function renderRisk(r) { if (!r || r.iso !== S.iso) return; const g = $('#gRisk'); if (g) g.innerHTML = riskHTML(r); const b = $('#riskBox'); if (b) b.innerHTML = riskHTML(r); }
on('riskRender', () => { if ((gov.tab === 'risk' && isOpen('gov')) || $('#riskBox')) computeRisk().then(renderRisk); });

// ===================== TRADE =====================
const trd = makePanel('trade', 'Trade', [['exp', 'Exports'], ['imp', 'Imports'], ['prod', 'Products']], { short: 'Trade' });
trd.body.innerHTML = `<div id="tdBox"></div>`;
const T = { for: null, data: null };
trd.onTab = () => renderTrade(); trd.onRefresh = () => loadTrade(true); trd.onCountry = () => { T.for = null; GL.data.arcs = []; if (isOpen('trade')) loadTrade(); }; trd.onShow = () => loadTrade();
async function loadTrade(force) {
  const box = $('#tdBox'); if (!S.iso) { box.innerHTML = '<div class="empty">Pick a country.</div>'; return; }
  if (T.for === S.iso && !force) return renderTrade(); const iso = S.iso; box.innerHTML = skeleton(5);
  try { const r = await api('/api/trade?iso=' + iso + (force ? '&force=1' : '')); if (iso !== S.iso) return; T.for = iso; T.data = r; renderTrade(); trd.meta(cacheNote(r._cache)); }
  catch (e) { box.innerHTML = errBox(e); GL.data.arcs = []; }
}
function renderTrade() {
  const r = T.data, box = $('#tdBox'); if (!r || T.for !== S.iso) return;
  const tab = trd.tab, flow = tab === 'imp' ? r.imports : r.exports;
  const bal = (r.exports?.total || 0) - (r.imports?.total || 0);
  const head = `<div class="tiles"><div><small>Exports ${r.year}</small><strong>${fmtUSD(r.exports?.total)}</strong></div><div><small>Imports ${r.year}</small><strong>${fmtUSD(r.imports?.total)}</strong></div><div><small>Balance</small><strong class="${bal >= 0 ? 'up' : 'down'}">${r.imports?.total == null ? '—' : (bal >= 0 ? '+' : '−') + fmtUSD(Math.abs(bal))}</strong></div></div>`;
  if (tab === 'prod') {
    const p = r.products || []; const mx = p[0]?.value || 1;
    box.innerHTML = head + `<span class="eyebrow">Top exported products</span><div class="bars">${p.map(x => `<div><span>${esc(x.name)}</span><b style="width:${x.value / mx * 100}%"></b><span class="dim">${fmtUSD(x.value)}</span></div>`).join('') || '<p class="note">No product breakdown.</p>'}</div><p class="note">UN Comtrade, HS chapters.</p>`;
    GL.data.arcs = []; return;
  }
  if (flow?.error) { box.innerHTML = head + `<p class="note">Import figures didn\u2019t load (${esc(flow.error)}). They are retried automatically in a few minutes; press refresh to try now.</p>`; GL.data.arcs = []; return; }
  const ps = flow?.partners || []; const mx = ps[0]?.value || 1;
  box.innerHTML = head + `<span class="eyebrow">${tab === 'imp' ? 'Where imports come from' : 'Where exports go'}</span><div class="bars">${ps.map(x => `<div class="click" data-iso="${esc(x.iso)}"><span>${esc(x.name)}</span><b style="width:${x.value / mx * 100}%;background:${tab === 'imp' ? 'var(--info)' : 'var(--accent)'}"></b><span class="dim">${fmtUSD(x.value)} · ${flow.total ? Math.round(x.value / flow.total * 100) : '?'}%</span></div>`).join('') || '<p class="note">No partner data.</p>'}</div>
    <p class="note">UN Comtrade (${r.year}). Flows are drawn as moving arcs on the globe when the Trade arcs layer is on. Click a partner to open it.</p>`;
  $$('#tdBox [data-iso]').forEach(el => el.onclick = () => emit('country', el.dataset.iso));
  const from = featByIso[S.iso]?.c;
  GL.data.arcs = from ? ps.filter(x => featByIso[x.iso]).map(x => { const c = featByIso[x.iso].c; return tab === 'imp' ? { from: c, to: from, dir: 1, color: '#6ea8d6', w: 0.8 + 3 * x.value / mx, label: `${x.name} → ${S.d.n}`, detail: fmtUSD(x.value) + ' of imports, ' + r.year } : { from, to: c, dir: 1, color: '#e6a23c', w: 0.8 + 3 * x.value / mx, label: `${S.d.n} → ${x.name}`, detail: fmtUSD(x.value) + ' of exports, ' + r.year }; }) : [];
}
on('panels', () => { if (!isOpen('trade')) GL.data.arcs = []; else if (T.data) renderTrade(); });

// ===================== WEATHER =====================
const wxp = makePanel('weather', 'Weather', [['now', 'Now'], ['clim', 'Climate']], { short: 'Weather' });
wxp.body.innerHTML = `<div id="wxBox"></div>`;
const W = { for: null };
wxp.onTab = () => loadWx(); wxp.onRefresh = () => { W.for = null; loadWx(true); }; wxp.onCountry = () => { W.for = null; if (isOpen('weather')) loadWx(); }; wxp.onShow = () => loadWx();
async function loadWx(force) {
  const box = $('#wxBox'); if (!S.iso) { box.innerHTML = '<div class="empty">Pick a country.</div>'; return; }
  const iso = S.iso, key = iso + wxp.tab; if (W.for === key && !force) return; box.innerHTML = skeleton(4);
  try {
    if (wxp.tab === 'now') {
      const r = await api('/api/weather?iso=' + iso + (force ? '&force=1' : '')); if (iso !== S.iso) return; W.for = key;
      const c = r.current, d = r.daily, w = WX(c.weather_code);
      box.innerHTML = `<div class="bar"><span style="font-size:34px;line-height:1">${w[1]}</span><div><b style="font-size:24px" class="mono">${Math.round(c.temperature_2m)}°C</b><div class="note">${esc(w[0])} in ${esc(r.place.name)} · ${new Date().toLocaleTimeString('en-GB', { timeZone: r.tz || r.place.tz, hour: '2-digit', minute: '2-digit' })} local</div></div></div>
        <div class="tiles"><div><small>Feels like</small><strong>${Math.round(c.apparent_temperature)}°</strong></div><div><small>Humidity</small><strong>${c.relative_humidity_2m}%</strong></div><div><small>Wind</small><strong>${Math.round(c.wind_speed_10m)}<span class="dim" style="font-size:11px"> km/h</span></strong></div><div><small>Rain now</small><strong>${c.precipitation} mm</strong></div></div>
        <span class="eyebrow">7 days</span><div class="days">${d.time.map((t, i) => { const x = WX(d.weather_code[i]); return `<div title="${esc(x[0])} · rain ${d.precipitation_sum[i]} mm · wind ${Math.round(d.wind_speed_10m_max[i])} km/h · UV ${d.uv_index_max?.[i] ?? '—'}"><small>${new Date(t + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })}</small><span class="wx">${x[1]}</span><b>${Math.round(d.temperature_2m_max[i])}°</b><span class="dim">${Math.round(d.temperature_2m_min[i])}°</span><small class="${d.precipitation_probability_max[i] > 50 ? 'info' : 'dim'}">${d.precipitation_probability_max[i]}%</small></div>`; }).join('')}</div>
        <div id="wxChart"></div><p class="note">Open-Meteo forecast for the capital.</p>`;
      lineChart($('#wxChart'), [{ pts: d.time.map((t, i) => ({ x: i, y: d.temperature_2m_max[i] })), color: 'var(--accent)' }, { pts: d.time.map((t, i) => ({ x: i, y: d.temperature_2m_min[i] })), color: 'var(--info)' }], { h: 80, fmtY: v => Math.round(v) + '°', fmtX: p => new Date(d.time[p.x] + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' }), xTicks: 7 });
      wxp.meta(cacheNote(r.place._cache));
    } else {
      const r = await api('/api/climate?iso=' + iso); if (iso !== S.iso) return; W.for = key;
      const best = r.months.slice().sort((a, b) => b.score - a.score).slice(0, 3).map(m => m.m); const mxR = Math.max(...r.months.map(m => m.rain)) || 1;
      box.innerHTML = `<table class="tbl"><thead><tr><th>Month</th><th class="n">Avg °C</th><th>Rain</th><th class="n">Wet days</th><th></th></tr></thead><tbody>${r.months.map(m => `<tr class="${best.includes(m.m) ? 'on' : ''}"><td>${MONTHS[m.m]}</td><td class="n">${Math.round(m.temp)}</td><td><span style="display:inline-block;height:6px;border-radius:2px;background:var(--info);width:${m.rain / mxR * 60}px"></span> <span class="dim">${Math.round(m.rain)} mm</span></td><td class="n">${m.wetDays}</td><td>${best.includes(m.m) ? '<span class="tag ok">BEST</span>' : ''}</td></tr>`).join('')}</tbody></table>
        <p class="note">Averages over ${esc(r.years || 'recent')} years (ERA5 reanalysis via Open-Meteo) for the capital. "Best" favours 18–26 °C and few wet days.</p>`;
    }
  } catch (e) { box.innerHTML = errBox(e); }
}

// ===================== SPACE =====================
const spc = makePanel('space', 'Space', [['sats', 'Satellites'], ['stations', 'Stations']], { short: 'Space' });
spc.body.innerHTML = `<div id="spBox"></div>`;
const SP = { for: null, data: null, recs: [], group: 'all', timer: null, sel: null, q: '' };
const SP_MAX = 2500;
spc.onTab = () => renderSpace(); spc.onRefresh = () => { SP.for = null; loadSpace(); }; spc.onCountry = () => { SP.for = null; SP.sel = null; GL.satTrack = null; if (isOpen('space')) loadSpace(); else stopSats(); };
spc.onShow = () => loadSpace();
async function loadSpace() {
  const box = $('#spBox'); const a2 = S.d?.a2 || ''; const key = S.iso || 'WLD';
  if (SP.for === key) { renderSpace(); startSats(); return; }
  box.innerHTML = skeleton(5);
  try {
    const r = await api('/api/space' + (S.iso ? '?iso=' + S.iso : '')); if ((S.iso || 'WLD') !== key) return;
    SP.for = key; SP.data = r; SP.recs = [];
    const mk = s => { try { return { ...s, rec: satellite.twoline2satrec(s.l1, s.l2) }; } catch (e) { return null; } };
    SP.all = r.owned.map(mk).filter(Boolean); SP.st = r.stations.map(s => mk({ ...s, group: 'Station' })).filter(Boolean);
    renderSpace(); startSats(); spc.meta('CelesTrak · ' + ago(r.at));
  } catch (e) { box.innerHTML = errBox(e); }
}
function satPool() {
  if (spc.tab === 'stations') return SP.st || [];
  const g = SP.group; let L = (SP.all || []).filter(s => g === 'all' || s.group === g);
  if (SP.q) L = L.filter(s => (s.n + ' ' + s.id).toUpperCase().includes(SP.q));
  if (L.length > SP_MAX) { const k = L.length / SP_MAX; L = Array.from({ length: SP_MAX }, (_, i) => L[Math.floor(i * k)]); }
  const ids = new Set(L.map(s => s.id)); for (const s of SP.st || []) if (!ids.has(s.id)) L.push(s);
  return L;
}
function propagate(s, date) {
  try { const pv = satellite.propagate(s.rec, date); if (!pv || !pv.position) return null; const g = satellite.eciToGeodetic(pv.position, satellite.gstime(date)); const v = pv.velocity; return { lon: satellite.degreesLong(g.longitude), lat: satellite.degreesLat(g.latitude), alt: g.height, v: v ? Math.hypot(v.x, v.y, v.z) : null }; } catch (e) { return null; }
}
function tickSats() {
  if (!isOpen('space') || !GL.layers.sats || document.hidden) { GL.data.sats = []; return; }
  const now = new Date(); const out = [];
  for (const s of satPool()) { const p = propagate(s, now); if (p && isFinite(p.lat)) out.push({ ...p, n: s.n, id: s.id, group: s.group || 'Other', s }); }
  GL.data.sats = out;
  if (SP.sel) { const cur = out.find(x => x.id === SP.sel); const el = $('#spSel'); if (cur && el) el.textContent = `${Math.round(cur.alt).toLocaleString('en-US')} km · ${cur.lat.toFixed(1)}, ${cur.lon.toFixed(1)} · ${cur.v ? cur.v.toFixed(2) + ' km/s' : ''}`; }
}
function startSats() { stopSats(); tickSats(); SP.timer = setInterval(tickSats, 2000); }
function stopSats() { clearInterval(SP.timer); SP.timer = null; GL.data.sats = []; }
on('panels', () => { if (isOpen('space') && SP.data) startSats(); else stopSats(); });
on('layers', () => { if (isOpen('space')) tickSats(); });
function renderSpace() {
  const r = SP.data, box = $('#spBox'); if (!r) return;
  if (spc.tab === 'stations') {
    box.innerHTML = `<div class="list">${(SP.st || []).map(s => `<div class="alert-row click" data-sat="${s.id}"><span class="sev info">ISS</span><div class="grow"><b>${esc(s.n)}</b><div class="note">${esc(DATA[byA2[s.own]]?.n || s.own || '')} · ${s.period ? Math.round(s.period) + ' min orbit' : ''}</div></div></div>`).join('')}</div><p class="note">Crewed stations shown as large yellow dots with their ground track when selected.</p>`;
  } else {
    const groups = Object.entries(r.groups || {}).sort((a, b) => b[1] - a[1]);
    box.innerHTML = `<div class="tiles"><div><small>${S.iso ? 'Operated by ' + esc(S.d.n) : 'Active satellites'}</small><strong>${(S.iso ? r.owned.length : r.total).toLocaleString('en-US')}</strong></div><div><small>Shown on globe</small><strong id="spShown">${Math.min(SP_MAX, (SP.all || []).length).toLocaleString('en-US')}</strong></div><div><small>Groups</small><strong>${groups.length}</strong></div></div>
      ${r.owned.length ? `<div class="bar">${seg('sgroup', [['all', 'ALL'], ...groups.slice(0, 6).map(([g, n]) => [g, g.toUpperCase() + ' ' + n])], SP.group, 'chips')}</div>
      <div class="bar"><input id="spQ" class="inp grow" placeholder="Search name or NORAD id" value="${esc(SP.q)}"></div>
      <div id="spDetail"></div>
      <table class="tbl"><thead><tr><th>Name</th><th>Group</th><th class="n">Perigee km</th><th>Launched</th></tr></thead><tbody>${satPool().filter(s => s.group !== 'Station').slice(0, 120).map(s => `<tr class="click ${SP.sel === s.id ? 'on' : ''}" data-sat="${s.id}"><td>${esc(s.n)}</td><td class="dim">${esc(s.group || '')}</td><td class="n">${s.perigee ? Math.round(s.perigee).toLocaleString('en-US') : '—'}</td><td class="dim">${esc(String(s.launch || '').slice(0, 4))}</td></tr>`).join('')}</tbody></table>`
      : `<p class="note">${S.iso ? `No active satellites are registered to ${esc(S.d.n)} in the CelesTrak catalogue.` : ''}</p>`}
      ${!S.iso && r.topOwners?.length ? `<span class="eyebrow">Largest operators</span><div class="bars">${r.topOwners.map(([o, n]) => `<div><span>${esc(DATA[byA2[o]]?.n || o)}</span><b style="width:${n / r.topOwners[0][1] * 100}%;background:var(--violet)"></b><span class="dim">${n.toLocaleString('en-US')}</span></div>`).join('')}</div>` : ''}
      <p class="note">Positions are computed in your browser every 2 s from CelesTrak orbital elements (SGP4). ${(SP.all || []).length > SP_MAX ? `Large fleets are thinned to ${SP_MAX.toLocaleString('en-US')} dots; pick a group to see all of it.` : ''} Click a dot on the globe for details and its ground track.</p>`;
    onSeg(box, 'sgroup', v => { SP.group = v; renderSpace(); tickSats(); });
    const q = $('#spQ'); if (q) q.oninput = e => { SP.q = e.target.value.trim().toUpperCase(); clearTimeout(SP.qt); SP.qt = setTimeout(() => { renderSpace(); tickSats(); const n = $('#spQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  }
  $$('#spBox [data-sat]').forEach(el => el.onclick = () => selectSat(+el.dataset.sat, true));
  renderSatDetail();
}
function selectSat(id, fly) {
  const s = [...(SP.all || []), ...(SP.st || [])].find(x => x.id === id); if (!s) return;
  SP.sel = id; GL.sel = { kind: 'sat', id };
  const now = Date.now(), per = (s.period || 95) * 60e3; GL.satTrack = d3.range(-0.5, 1.0001, 1 / 90).map(k => propagate(s, new Date(now + k * per))).filter(Boolean).map(p => [p.lon, p.lat]);
  const p = propagate(s, new Date()); if (fly && p) { flyTo([p.lon, p.lat], Math.max(G.zoom, 1.6)); lift(); sink(6000); }
  renderSatDetail(); $$('#spBox tr[data-sat]').forEach(tr => tr.classList.toggle('on', +tr.dataset.sat === id));
  showCard(satCard(s, p));
}
function satCard(s, p) {
  return `<b>${esc(s.n)}</b><p class="note">NORAD ${s.id}${s.cospar ? ' · ' + esc(s.cospar) : ''} · ${esc(s.group || '')}</p>
    <div class="stats"><div class="row"><span>Operator</span><span>${esc(DATA[byA2[s.own]]?.n || s.own || '—')}</span></div><div class="row"><span>Launched</span><span>${esc(s.launch || '—')}</span></div><div class="row"><span>Orbit</span><span>${s.perigee ? Math.round(s.perigee) + '–' + Math.round(s.apogee) + ' km' : '—'} · ${s.period ? Math.round(s.period) + ' min' : ''}</span></div>${p ? `<div class="row"><span>Now</span><span>${Math.round(p.alt).toLocaleString('en-US')} km · ${p.v ? p.v.toFixed(2) + ' km/s' : ''}</span></div>` : ''}</div>
    <a class="ext" href="https://celestrak.org/satcat/table-satcat.php?CATNR=${s.id}" target="_blank" rel="noopener">CelesTrak record</a>`;
}
function renderSatDetail() {
  const box = $('#spDetail'); if (!box) return; const s = (SP.all || []).find(x => x.id === SP.sel);
  box.innerHTML = s ? `<div class="detail"><div class="bar"><b>${esc(s.n)}</b><span class="tag n">${esc(s.group || '')}</span><span class="grow"></span><button class="ic" id="spClose" type="button" aria-label="Close">${ICON.close}</button></div><p class="note mono" id="spSel">computing…</p></div>` : '';
  const c = $('#spClose'); if (c) c.onclick = () => { SP.sel = null; GL.sel = null; GL.satTrack = null; showCard(null); renderSpace(); };
}
on('pick', ({ kind, item }) => { if (kind === 'sat') { if (!isOpen('space')) restore('space'); selectSat(item.id, false); } });
