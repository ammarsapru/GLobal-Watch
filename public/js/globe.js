'use strict';
/* Globe: orthographic Earth with day/night, sun & moon in the sky behind it, time zones, satellites, live tracks, hazards, unrest,
   news places, trade arcs, choropleth modes, sharper borders when zoomed. Talks to panels through GL.data and the BUS. */

const features = topojson.feature(topo, topo.objects.countries).features;
const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
const byNum = {}; for (const k in DATA) { const d = DATA[k]; if (d.num) byNum[+d.num] = k; }
for (const f of features) { f.iso3 = byNum[+f.id] || null; if (!f.iso3 && f.properties?.name === 'Kosovo' && DATA.XKX) f.iso3 = 'XKX'; f.c = d3.geoCentroid(f); }
const featByIso = {}; features.forEach(f => { if (f.iso3) featByIso[f.iso3] = f; });
let hi = null; // 50m detail, loaded on first zoom-in
function loadHi() { if (hi !== null) return; hi = false; fetch('vendor/countries-50m.json').then(r => r.json()).then(t => { hi = { land: topojson.feature(t, t.objects.countries), borders: topojson.mesh(t, t.objects.countries, (a, b) => a !== b) }; }).catch(() => { hi = null; }); }

const stage = $('#stage'), orb = $('#orb'), canvas = $('#globe'), ctx = canvas.getContext('2d'), sky = $('#sky'), sctx = sky.getContext('2d'), tip = $('#tip');
const proj = d3.geoOrthographic().clipAngle(90).precision(.4);
const gpath = d3.geoPath(proj, ctx);
const grat = d3.geoGraticule10();
const G = { W: 0, dpr: 1, rot: [-20, -20, 0], zoom: 1, base: 1, hover: null, hoverPt: null, auto: !reduce, last: 0, fly: null, lifted: false, sinkT: null, down: null, moved: 0, over: false, pts: [] };
const GL = {
  layers: Object.assign({ night: true, sunmoon: true, tz: true, air: true, sats: true, hazards: true, unrest: true, places: false, arcs: true }, store.get('layers', {})),
  choro: store.get('choro', 'off'), choroData: {}, data: { air: [], sats: [], hazards: [], unrest: [], places: [], arcs: [] }, sel: null, trail: null, satTrack: null
};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = { ocean: css('--ocean'), land: css('--land'), hover: css('--land-hover'), border: css('--border'), grat: css('--grat'), accent: css('--accent'), line: css('--line-2'), info: css('--info'), warn: css('--warn'), fg: css('--fg'), ok: css('--ok'), violet: '#9b86d6', muted: css('--muted') };

// ---------------- astronomy (accurate to well under a degree — plenty for a globe) ----------------
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const norm180 = x => ((x + 540) % 360) - 180;
function astro(date = new Date()) {
  const n = date.getTime() / 864e5 + 2440587.5 - 2451545.0;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) % 360 * RAD;
  const ls = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const sRA = Math.atan2(Math.cos(eps) * Math.sin(ls), Math.cos(ls)) * DEG, sDec = Math.asin(Math.sin(eps) * Math.sin(ls)) * DEG;
  const Lm = (218.316 + 13.176396 * n) % 360, Mm = (134.963 + 13.064993 * n) % 360 * RAD, Fm = (93.272 + 13.229350 * n) % 360 * RAD;
  const lm = (Lm + 6.289 * Math.sin(Mm)) * RAD, bm = 5.128 * Math.sin(Fm) * RAD;
  const mRA = Math.atan2(Math.sin(lm) * Math.cos(eps) - Math.tan(bm) * Math.sin(eps), Math.cos(lm)) * DEG;
  const mDec = Math.asin(Math.sin(bm) * Math.cos(eps) + Math.cos(bm) * Math.sin(eps) * Math.sin(lm)) * DEG;
  const elong = Math.acos(Math.cos(bm) * Math.cos(lm - ls));
  return { sun: [norm180(sRA - gmst), sDec], moon: [norm180(mRA - gmst), mDec], illum: (1 - Math.cos(elong)) / 2, waxing: ((lm - ls) * DEG + 720) % 360 < 180 };
}
let AST = astro(); setInterval(() => { AST = astro(); updateSunInfo(); }, 30e3);
function updateSunInfo() {
  const f = (v, p, n) => Math.abs(v).toFixed(1) + '°' + (v >= 0 ? p : n);
  $('#sunInfo').textContent = GL.layers.sunmoon ? `SUN OVERHEAD ${f(AST.sun[1], 'N', 'S')} ${f(AST.sun[0], 'E', 'W')} · MOON ${Math.round(AST.illum * 100)}% ${AST.waxing ? 'WAXING' : 'WANING'}` : '';
}

// ---------------- sizing ----------------
function resize() {
  const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
  const dpr = Math.min(1.5, devicePixelRatio || 1);
  if (sky.width !== Math.round(r.width * dpr) || sky.height !== Math.round(r.height * dpr)) { sky.width = Math.round(r.width * dpr); sky.height = Math.round(r.height * dpr); skyDirty = true; }
  const size = Math.round(Math.max(200, Math.min(r.width * .9, r.height * .9, 900)));
  orb.style.setProperty('--lift', (-(r.height - size) / 2) + 'px');
  if (Math.abs(size - G.W) < 2) return;
  orb.style.width = orb.style.height = size + 'px'; orb.style.setProperty('--rest', (size * .34) + 'px');
  G.W = size; G.dpr = Math.min(1.5, devicePixelRatio || 1, 1400 / size); canvas.width = Math.round(size * G.dpr); canvas.height = Math.round(size * G.dpr);
  G.base = size / 2 * .94; proj.translate([size / 2, size / 2]);
}
window.resizeGlobe = resize;
new ResizeObserver(resize).observe(stage);
const visible = ll => d3.geoDistance(ll, [-G.rot[0], -G.rot[1]]) < Math.PI / 2;

// ---------------- choropleth ----------------
const CHORO = {
  off: null,
  advisory: { name: 'US travel advisory', color: v => ['', '#4f9e72', '#c9a43a', '#d6803c', '#d0563e'][v] || null, legend: [['Normal', '#4f9e72'], ['Caution', '#c9a43a'], ['Reconsider', '#d6803c'], ['Do not travel', '#d0563e']] },
  outage: { name: 'Internet disruption (24 h)', color: v => v > 0 ? d3.interpolateRgb('#2a3f4d', '#e0735a')(Math.min(1, Math.log10(1 + v) / 6)) : null, legend: [['Minor', '#4b5258'], ['Severe', '#e0735a']] },
  gdp: { name: 'GDP per person', color: v => v ? d3.interpolateRgb('#1d3140', '#6ea8d6')(Math.min(1, Math.max(0, (Math.log10(v) - 2.6) / 2.4))) : null, legend: [['$500', '#1d3140'], ['$100k', '#6ea8d6']] },
  inflation: { name: 'Inflation', color: v => v == null ? null : v < 0 ? '#5a8bb0' : d3.interpolateRgb('#2b4d3a', '#e0735a')(Math.min(1, v / 25)), legend: [['Deflation', '#5a8bb0'], ['0%', '#2b4d3a'], ['25%+', '#e0735a']] },
  alerts: { name: 'Alerts in the last 48 h', color: v => v ? ['', '#6ea8d6', '#e6a23c', '#e0735a'][v] : null, legend: [['Info', '#6ea8d6'], ['Warning', '#e6a23c'], ['Critical', '#e0735a']] }
};
async function setChoro(mode) {
  GL.choro = mode; store.set('choro', mode);
  const L = $('#choroLegend'); const c = CHORO[mode];
  if (!c) { L.hidden = true; return; }
  L.hidden = false; L.innerHTML = `<b>${esc(c.name)}</b>` + c.legend.map(([t, col]) => `<span><i style="background:${col}"></i> ${t}</span>`).join('');
  try {
    const d = {};
    if (mode === 'advisory') Object.assign(d, (await api('/api/advisories')).levels);
    if (mode === 'outage') for (const r of (await api('/api/outages')).rows) { const iso = byA2[r.cc]; if (iso) d[iso] = r.score; }
    if (mode === 'gdp') for (const [k, v] of Object.entries(DATA)) { const g = v.g.at(-1); if (g && v.p) d[k] = g[1] * 1e6 / v.p[1]; }
    if (mode === 'inflation') for (const [k, v] of Object.entries(DATA)) { const i = v.i.at(-1); if (i) d[k] = i[1]; }
    if (mode === 'alerts') for (const a of (await api('/api/alerts?hours=48')).list) if (a.iso) d[a.iso] = Math.max(d[a.iso] || 0, { info: 1, warn: 2, crit: 3 }[a.sev] || 1);
    GL.choroData[mode] = d;
  } catch (e) { toast('Could not load the ' + c.name.toLowerCase() + ' layer: ' + e.message); }
}

// ---------------- sky: stars, sun, moon ----------------
const STARS = Array.from({ length: 140 }, (_, i) => [Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, Math.abs(Math.sin(i * 78.233) * 12543.123) % 1, (i % 7 === 0 ? 1.3 : .7), .25 + (i % 5) * .08]);
let skyDirty = true, skyLast = 0;
function viewDir(ll) { const r = d3.geoRotation(G.rot)(ll); const la = r[1] * RAD, lo = r[0] * RAD; return { x: Math.cos(la) * Math.sin(lo), y: Math.sin(la), z: Math.cos(la) * Math.cos(lo) }; }
function drawSky(now) {
  if (!skyDirty && now - skyLast < (G.fly || G.down || G.lifted ? 50 : 400)) return;
  skyDirty = false; skyLast = now;
  const W = sky.width, H = sky.height, dpr = W / Math.max(1, stage.clientWidth);
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, W, H);
  sctx.fillStyle = '#d8e1e5';
  for (const [x, y, r, a] of STARS) { sctx.globalAlpha = a; sctx.beginPath(); sctx.arc(x * W, y * H, r * dpr, 0, 7); sctx.fill(); }
  sctx.globalAlpha = 1;
  if (!GL.layers.sunmoon) return;
  const sr = stage.getBoundingClientRect(), orr = canvas.getBoundingClientRect();
  const cx = (orr.left - sr.left + orr.width / 2) * dpr, cy = (orr.top - sr.top + orr.height / 2) * dpr, R = proj.scale() * (orr.width / G.W) * dpr;
  const place = (ll, k) => { const v = viewDir(ll); let dx = v.x, dy = -v.y; const m = Math.hypot(dx, dy); if (m < .15) { dx = -.6; dy = -.8; } else { dx /= m; dy /= m; } return { x: cx + dx * R * k, y: cy + dy * R * k, front: v.z > 0, v }; };
  // sun
  const s = place(AST.sun, 1.3); const sz = 15 * dpr;
  const g = sctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sz * 4.2); g.addColorStop(0, 'rgba(255,214,140,.55)'); g.addColorStop(.35, 'rgba(230,162,60,.18)'); g.addColorStop(1, 'rgba(230,162,60,0)');
  sctx.fillStyle = g; sctx.beginPath(); sctx.arc(s.x, s.y, sz * 4.2, 0, 7); sctx.fill();
  sctx.fillStyle = '#ffd98a'; sctx.beginPath(); sctx.arc(s.x, s.y, sz, 0, 7); sctx.fill();
  sctx.strokeStyle = 'rgba(255,217,138,.6)'; sctx.lineWidth = 1.2 * dpr;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + now / 9000; sctx.beginPath(); sctx.moveTo(s.x + Math.cos(a) * sz * 1.35, s.y + Math.sin(a) * sz * 1.35); sctx.lineTo(s.x + Math.cos(a) * sz * 1.8, s.y + Math.sin(a) * sz * 1.8); sctx.stroke(); }
  label(s.x, s.y + sz * 2.3, s.front ? 'SUN · behind you' : 'SUN', dpr);
  // moon with phase
  const m = place(AST.moon, 1.45); const mz = 10 * dpr;
  sctx.fillStyle = 'rgba(30,38,46,1)'; sctx.beginPath(); sctx.arc(m.x, m.y, mz, 0, 7); sctx.fill();
  sctx.save(); sctx.beginPath(); sctx.arc(m.x, m.y, mz, 0, 7); sctx.clip();
  const sunSide = Math.sign((s.x - m.x) || 1); const k = 1 - 2 * AST.illum; // +1 new … -1 full
  sctx.fillStyle = '#dfe6ea'; sctx.beginPath(); sctx.arc(m.x, m.y, mz, -Math.PI / 2, Math.PI / 2, sunSide < 0); sctx.ellipse(m.x, m.y, Math.abs(k) * mz, mz, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === (sunSide > 0)); sctx.fill();
  sctx.restore();
  sctx.strokeStyle = 'rgba(223,230,234,.35)'; sctx.lineWidth = 1 * dpr; sctx.beginPath(); sctx.arc(m.x, m.y, mz + 3 * dpr, 0, 7); sctx.stroke();
  label(m.x, m.y + mz + 13 * dpr, `MOON ${Math.round(AST.illum * 100)}%`, dpr);
}
function label(x, y, t, dpr) { sctx.font = `${10 * dpr}px "JetBrains Mono", monospace`; sctx.textAlign = 'center'; sctx.fillStyle = 'rgba(127,144,154,.95)'; sctx.fillText(t, x, y); }

// ---------------- main draw ----------------
const nightC = r => d3.geoCircle().center([norm180(AST.sun[0] + 180), -AST.sun[1]]).radius(r)();
function draw(now) {
  if (!G.W) return;
  proj.rotate(G.rot).scale(G.base * G.zoom);
  const W = G.W; ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0); ctx.clearRect(0, 0, W, W);
  const [cx, cy] = proj.translate(), r = proj.scale();
  if (G.zoom < 1.3) { const g = ctx.createRadialGradient(cx, cy, r * .95, cx, cy, r * 1.06); g.addColorStop(0, 'rgba(230,162,60,.22)'); g.addColorStop(1, 'rgba(230,162,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.06, 0, 2 * Math.PI); ctx.fill(); }
  ctx.save(); ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 1, 0, 2 * Math.PI); ctx.clip();
  ctx.beginPath(); gpath({ type: 'Sphere' }); ctx.fillStyle = C.ocean; ctx.fill();
  ctx.beginPath(); gpath(grat); ctx.strokeStyle = C.grat; ctx.lineWidth = .6; ctx.stroke();
  const useHi = G.zoom >= 2.2 && hi; if (G.zoom >= 2.2) loadHi();
  ctx.beginPath(); if (useHi) gpath(hi.land); else features.forEach(f => gpath(f)); ctx.fillStyle = C.land; ctx.fill();
  const ch = CHORO[GL.choro], cd = GL.choroData[GL.choro];
  if (ch && cd) for (const f of features) { const v = cd[f.iso3]; const col = v != null ? ch.color(v) : null; if (!col) continue; ctx.beginPath(); gpath(f); ctx.fillStyle = col; ctx.globalAlpha = .62; ctx.fill(); ctx.globalAlpha = 1; }
  if (G.lifted && G.hover && G.hover !== S.f) { ctx.beginPath(); gpath(G.hover); ctx.fillStyle = C.hover; ctx.fill(); }
  if (S.f) { ctx.beginPath(); gpath(S.f); ctx.fillStyle = 'rgba(230,162,60,.24)'; ctx.fill(); }
  if (GL.layers.night) for (const [rad, a] of [[90, .26], [84, .14], [76, .12]]) { ctx.beginPath(); gpath(nightC(rad)); ctx.fillStyle = `rgba(2,5,12,${a})`; ctx.fill(); }
  ctx.beginPath(); gpath(useHi ? hi.borders : borders); ctx.strokeStyle = C.border; ctx.lineWidth = .5; ctx.stroke();
  if (S.f) { ctx.beginPath(); gpath(S.f); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.3; ctx.stroke(); }
  if (GL.layers.tz && G.zoom < 3) drawTZ();
  G.pts = [];
  if (GL.layers.arcs) drawArcs(now);
  if (GL.layers.places) for (const p of GL.data.places) mark(p, 'place', (x, y) => { ctx.fillStyle = '#5fc3c9'; ctx.globalAlpha = .85; ctx.fillRect(x - 2.5, y - 2.5, 5, 5); ctx.globalAlpha = 1; });
  if (GL.layers.unrest) for (const p of GL.data.unrest) mark(p, 'unrest', (x, y) => { ctx.fillStyle = C.violet; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(x, y, 2.2 + Math.min(4, Math.log2(1 + (p.count || 1))), 0, 7); ctx.fill(); ctx.globalAlpha = 1; });
  if (GL.layers.hazards) for (const h of GL.data.hazards) mark(h, 'hazard', (x, y) => drawHazard(h, x, y, now));
  if (GL.layers.air) drawTracks();
  if (GL.layers.sats) drawSats();
  if (GL.layers.sunmoon) { // subsolar / sublunar points on the surface
    const sp = proj(AST.sun); if (sp && visible(AST.sun)) { ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(sp[0], sp[1], 4, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,217,138,.5)'; ctx.beginPath(); ctx.arc(sp[0], sp[1], 8, 0, 7); ctx.stroke(); }
    const mp = proj(AST.moon); if (mp && visible(AST.moon)) { ctx.fillStyle = '#dfe6ea'; ctx.beginPath(); ctx.arc(mp[0], mp[1], 3, 0, 7); ctx.fill(); }
  }
  if (S.f && !GL.data.air.length) { const p = proj(S.f.c); if (p && visible(S.f.c)) { const t = (now % 1800) / 1800; ctx.beginPath(); ctx.arc(p[0], p[1], 3 + t * 14, 0, 2 * Math.PI); ctx.strokeStyle = `rgba(230,162,60,${1 - t})`; ctx.lineWidth = 1.5; ctx.stroke(); ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 2 * Math.PI); ctx.fillStyle = C.accent; ctx.fill(); } }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, Math.min(r, W / 2 - 1), 0, 2 * Math.PI); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
  $('#lat').textContent = (-G.rot[1]).toFixed(1); $('#lon').textContent = norm180(-G.rot[0]).toFixed(1); $('#zoomv').textContent = G.zoom.toFixed(1) + '×';
}
function mark(item, kind, painter) { const ll = [item.lon, item.lat]; if (item.lat == null || !visible(ll)) return; const p = proj(ll); if (!p) return; G.pts.push([p[0], p[1], kind, item]); painter(p[0], p[1]); }
function drawTZ() {
  const now = new Date(); const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  ctx.save(); ctx.setLineDash([2, 5]); ctx.strokeStyle = 'rgba(127,144,154,.28)'; ctx.lineWidth = .8;
  for (let k = -12; k < 12; k++) { const lon = 7.5 + 15 * k; ctx.beginPath(); gpath({ type: 'LineString', coordinates: [[lon, -80], [lon, 0], [lon, 80]] }); ctx.stroke(); }
  ctx.setLineDash([]);
  const latL = Math.max(-60, Math.min(60, -G.rot[1] + 38));
  ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
  const placedL = []; const minGap = 30;
  for (let k = -12; k <= 12; k++) {
    const ll = [k === 12 ? 180 : 15 * k, latL]; if (!visible(ll) || d3.geoDistance(ll, [-G.rot[0], -G.rot[1]]) > 0.95) continue; const p = proj(ll);
    if (placedL.some(q => Math.abs(q[0] - p[0]) < minGap && Math.abs(q[1] - p[1]) < 32)) continue; placedL.push(p);
    const m = ((utcMin + k * 60) % 1440 + 1440) % 1440; const t = pad(Math.floor(m / 60)) + ':' + pad(m % 60);
    const day = m >= 360 && m < 1080;
    ctx.fillStyle = day ? 'rgba(230,162,60,.85)' : 'rgba(127,144,154,.85)';
    ctx.fillText(t, p[0], p[1]); ctx.fillStyle = 'rgba(85,101,111,.9)'; ctx.fillText('UTC' + (k >= 0 ? '+' : '') + k, p[0], p[1] + 11);
  }
  ctx.restore();
}
function drawArcs(now) {
  if (!GL.data.arcs.length) return;
  const off = (now / 60) % 20;
  for (const a of GL.data.arcs) {
    const line = d3.geoInterpolate(a.from, a.to); const coords = d3.range(0, 1.0001, .04).map(t => line(t));
    ctx.beginPath(); gpath({ type: 'LineString', coordinates: coords }); ctx.strokeStyle = a.color || C.accent; ctx.globalAlpha = .75; ctx.lineWidth = a.w || 1.5; ctx.setLineDash([6, 4]); ctx.lineDashOffset = a.dir < 0 ? off : -off; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    const e = a.to; if (visible(e)) { const p = proj(e); ctx.fillStyle = a.color || C.accent; ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, 7); ctx.fill(); G.pts.push([p[0], p[1], 'arc', a]); }
  }
}
const HZ = { quake: '#e0735a', Wildfires: '#ff8a3d', 'Severe Storms': '#6ea8d6', Volcanoes: '#d0563e', Floods: '#4f8fd6', Drought: '#c9a43a', 'Sea and Lake Ice': '#bfe3f0' };
function drawHazard(h, x, y, now) {
  if (h.kind === 'quake') { const r = Math.max(2, (h.mag - 2) * 2.2); const fresh = Date.now() - Date.parse(h.time) < 6 * 3600e3; ctx.strokeStyle = HZ.quake; ctx.lineWidth = 1.3; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); if (fresh && !reduce) { const t = (now % 2000) / 2000; ctx.globalAlpha = 1 - t; ctx.beginPath(); ctx.arc(x, y, r + t * 14, 0, 7); ctx.stroke(); } ctx.globalAlpha = 1; return; }
  if (h.kind === 'alert') { const col = { Red: '#e0735a', Orange: '#e6a23c', Green: '#5fbf88' }[h.level] || C.muted; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.closePath(); ctx.stroke(); return; }
  ctx.fillStyle = HZ[h.cat] || C.accent; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
}
function drawTracks() {
  const list = GL.data.air; if (!list.length) return;
  if (GL.trail && GL.trail.length > 1) { ctx.beginPath(); gpath({ type: 'LineString', coordinates: GL.trail.map(p => [p[2], p[1]]) }); ctx.strokeStyle = C.fg; ctx.globalAlpha = .7; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  for (const a of list) {
    const ll = [a.lon, a.lat]; if (!visible(ll)) continue; const p = proj(ll); if (!p) continue;
    G.pts.push([p[0], p[1], 'track', a]);
    const sel = GL.sel && GL.sel.kind === 'track' && GL.sel.id === a.hex, hov = G.hoverPt && G.hoverPt[3] === a;
    ctx.fillStyle = a.mil ? C.warn : a.ship ? C.ok : C.info; ctx.globalAlpha = a.gnd ? .45 : .95;
    if (a.ship && !(sel || hov)) { const r = G.zoom >= 2.5 ? 3 : 2; ctx.beginPath(); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath(); ctx.fill(); continue; }
    if (sel || hov || G.zoom >= 2.5) { const s = sel ? 7 : 5, th = ((a.trk || 0) - 90) * RAD; ctx.beginPath(); ctx.moveTo(p[0] + Math.cos(th) * s, p[1] + Math.sin(th) * s); ctx.lineTo(p[0] + Math.cos(th + 2.5) * s * .8, p[1] + Math.sin(th + 2.5) * s * .8); ctx.lineTo(p[0] + Math.cos(th - 2.5) * s * .8, p[1] + Math.sin(th - 2.5) * s * .8); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(p[0], p[1], a.mil ? 2.4 : 1.7, 0, 2 * Math.PI); ctx.fill(); }
    if (a.orbit) { ctx.globalAlpha = .7; ctx.strokeStyle = C.warn; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (sel) { ctx.globalAlpha = 1; ctx.strokeStyle = C.fg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 2 * Math.PI); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}
const SATCOL = { Starlink: '#7f909a', OneWeb: '#7f909a', Navigation: '#5fbf88', 'Military/government': '#e0735a', Geostationary: '#9b86d6', Station: '#ffd98a', Other: '#6ea8d6' };
function drawSats() {
  const list = GL.data.sats; if (!list.length) return;
  if (GL.satTrack && GL.satTrack.length > 1) { ctx.beginPath(); gpath({ type: 'LineString', coordinates: GL.satTrack }); ctx.strokeStyle = 'rgba(255,217,138,.6)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
  const [cx, cy] = proj.translate();
  for (const s of list) {
    if (s.lat == null) continue; const ll = [s.lon, s.lat]; if (!visible(ll)) continue; const p = proj(ll); if (!p) continue;
    const k = Math.min(1.1, 1 + (s.alt || 0) / 6371 * .25); const x = cx + (p[0] - cx) * k, y = cy + (p[1] - cy) * k;
    G.pts.push([x, y, 'sat', s]);
    const sel = GL.sel && GL.sel.kind === 'sat' && GL.sel.id === s.id;
    ctx.fillStyle = SATCOL[s.group] || SATCOL.Other; const big = s.group === 'Station' || sel;
    ctx.globalAlpha = s.group === 'Starlink' ? .55 : .95;
    if (big) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 7); ctx.fill(); ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.stroke(); }
    else ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    if (sel) { ctx.globalAlpha = 1; ctx.strokeStyle = C.fg; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

// ---------------- interaction ----------------
const local = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * G.W / b.width, (e.clientY - b.top) * G.W / b.height]; };
function pickCountry(x, y) { const ll = proj.invert([x, y]); if (!ll || !visible(ll)) return null; for (const f of features) if (d3.geoContains(f, ll)) return f; return null; }
function pickPt(x, y) { let best = null, bd = 9 * 9; for (const pt of G.pts) { const d = (pt[0] - x) ** 2 + (pt[1] - y) ** 2; if (d < bd) { bd = d; best = pt; } } return best; }
function lift() { clearTimeout(G.sinkT); if (G.lifted) return; G.lifted = true; stage.classList.add('lifted'); G.last = performance.now(); skyDirty = true; }
function sink(delay = 600) { clearTimeout(G.sinkT); G.sinkT = setTimeout(() => { if (G.down) return; G.lifted = false; stage.classList.remove('lifted'); G.hover = null; G.hoverPt = null; tip.hidden = true; skyDirty = true; }, delay); }
canvas.addEventListener('pointerenter', e => { G.over = true; if (e.pointerType === 'mouse') lift(); });
canvas.addEventListener('pointerleave', e => { G.over = false; if (!G.down) { G.hover = null; G.hoverPt = null; tip.hidden = true; if (e.pointerType === 'mouse') sink(); } });
canvas.addEventListener('focus', lift); canvas.addEventListener('blur', () => sink(300));
stage.addEventListener('pointerdown', e => { if ((e.target === stage || e.target === sky) && e.pointerType !== 'mouse') sink(0); });
canvas.addEventListener('pointerdown', e => { if (!G.lifted) { lift(); return; } G.down = { x: e.clientX, y: e.clientY, rot: G.rot.slice() }; G.moved = 0; canvas.setPointerCapture(e.pointerId); G.fly = null; G.last = performance.now(); });
function ptLabel(pt) {
  const [, , kind, it] = pt;
  if (kind === 'track') return it.ship ? `${it.cs} · ${it.t} · ${it.gs ?? 0} kn${it.dest ? ' → ' + it.dest : ''}` : `${it.cs || it.hex}${it.t ? ' · ' + it.t : ''} · ${it.gnd ? 'ground' : (it.alt || 0).toLocaleString('en-US') + ' ft'}${it.orbit ? ' · circling' : ''}`;
  if (kind === 'sat') return `${it.n} · ${Math.round(it.alt)} km · ${it.group}`;
  if (kind === 'hazard') return it.kind === 'quake' ? `M${it.mag} · ${it.place}` : it.kind === 'alert' ? `${it.level} ${it.type}: ${it.title}` : `${it.cat}: ${it.title}`;
  if (kind === 'unrest') return `Unrest coverage: ${it.name} (${it.count})`;
  if (kind === 'place') return `In the news: ${it.name} (${it.count})`;
  if (kind === 'arc') return `${it.label}`;
  return '';
}
canvas.addEventListener('pointermove', e => {
  if (!G.lifted) return; const [x, y] = local(e);
  if (G.down) {
    const dx = e.clientX - G.down.x, dy = e.clientY - G.down.y; G.moved = Math.max(G.moved, Math.hypot(dx, dy));
    if (G.moved > 3) { canvas.classList.add('dragging'); const k = 90 / proj.scale() * (G.W / canvas.getBoundingClientRect().width); G.rot = [G.down.rot[0] + dx * k, Math.max(-85, Math.min(85, G.down.rot[1] - dy * k)), 0]; tip.hidden = true; }
    G.last = performance.now(); return;
  }
  const pt = pickPt(x, y); G.hoverPt = pt;
  const f = pt ? null : pickCountry(x, y); G.hover = f; canvas.classList.toggle('hovering', !!(f || pt));
  if ((f || pt) && e.pointerType === 'mouse') { const sb = stage.getBoundingClientRect(); const d = f?.iso3 && DATA[f.iso3]; tip.textContent = pt ? ptLabel(pt) : d ? d.n : (f.properties.name || ''); tip.style.left = (e.clientX - sb.left) + 'px'; tip.style.top = (e.clientY - sb.top) + 'px'; tip.hidden = false; } else tip.hidden = true;
});
canvas.addEventListener('pointerup', e => {
  canvas.classList.remove('dragging');
  if (G.down && G.moved <= 3) { const [x, y] = local(e); const pt = pickPt(x, y); if (pt) emit('pick', { kind: pt[2], item: pt[3] }); else { const f = pickCountry(x, y); if (f && f.iso3) emit('country', f.iso3); } }
  G.down = null; G.last = performance.now();
});
canvas.addEventListener('wheel', e => { if (!G.lifted) return; e.preventDefault(); G.zoom = Math.max(1, Math.min(14, G.zoom * Math.exp(-e.deltaY * 0.0015))); G.last = performance.now(); }, { passive: false });
canvas.addEventListener('dblclick', () => { G.zoom = Math.min(14, G.zoom * 1.8); });
canvas.addEventListener('keydown', e => {
  const s = 6 / G.zoom; const m = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  if (m) { e.preventDefault(); lift(); G.fly = null; G.rot = [G.rot[0] + m[0], Math.max(-85, Math.min(85, G.rot[1] + m[1])), 0]; G.last = performance.now(); }
  if (e.key === '+' || e.key === '=') G.zoom = Math.min(14, G.zoom * 1.25); if (e.key === '-') G.zoom = Math.max(1, G.zoom / 1.25);
});
$('#spin').setAttribute('aria-pressed', G.auto);
$('#spin').onclick = () => { G.auto = !G.auto; $('#spin').setAttribute('aria-pressed', G.auto); };
$('#zoomReset').onclick = () => { if (S.f) flyTo(S.f.c, 1); else G.zoom = 1; };
function flyTo(c, zoom) { const from = G.rot.slice(), to = [-c[0], -c[1], 0]; let d = to[0] - from[0]; d = norm180(d); to[0] = from[0] + d; G.fly = { i: d3.interpolate(from, to), z: d3.interpolate(G.zoom, zoom ?? G.zoom), t0: performance.now(), dur: reduce ? 1 : 1100 }; }

// layers menu
function renderLayers() {
  const L = GL.layers; const row = (k, label) => `<label class="check"><input type="checkbox" data-layer="${k}" ${L[k] ? 'checked' : ''}>${label}</label>`;
  $('#layersMenu').innerHTML = `<h4>Sky & time</h4>${row('night', 'Day and night')}${row('sunmoon', 'Sun and moon')}${row('tz', 'Time zones and local times')}
    <h4>Live</h4>${row('air', 'Aircraft and ships')}${row('sats', 'Satellites')}${row('hazards', 'Hazards (quakes, fires, storms)')}${row('unrest', 'Unrest hotspots')}${row('places', 'Places in the news')}${row('arcs', 'Trade arcs')}
    <h4>Colour countries by</h4>${seg('choro', [['off', 'OFF'], ['advisory', 'ADVISORY'], ['outage', 'INTERNET'], ['gdp', 'GDP/PERSON'], ['inflation', 'INFLATION'], ['alerts', 'ALERTS']], GL.choro, 'chips')}`;
  $$('#layersMenu [data-layer]').forEach(c => c.onchange = () => { GL.layers[c.dataset.layer] = c.checked; store.set('layers', GL.layers); skyDirty = true; updateSunInfo(); emit('layers', GL.layers); });
  onSeg($('#layersMenu'), 'choro', v => setChoro(v));
}
function toggleLayers(force) { const m = $('#layersMenu'); const open = force ?? m.hidden; m.hidden = !open; $('#layersBtn').setAttribute('aria-expanded', open); if (open) renderLayers(); }
$('#layersBtn').onclick = () => toggleLayers();
document.addEventListener('click', e => { if (!$('#layersMenu').hidden && !e.target.closest('#layersMenu,#layersBtn')) toggleLayers(false); });

// detail card for clicked globe items (hazards, unrest, places, satellites are handled by their panels)
function showCard(html) { const c = $('#gcard'); if (!html) { c.hidden = true; return; } c.innerHTML = `<button class="ic" style="position:absolute;right:6px;top:6px" aria-label="Close">${ICON.close}</button>` + html; c.hidden = false; $('button.ic', c).onclick = () => c.hidden = true; }

let lastDraw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const busy = G.fly || G.down || G.lifted;
  if (!busy && now - lastDraw < 33) return;
  lastDraw = now;
  if (G.fly) { const t = Math.min(1, (now - G.fly.t0) / G.fly.dur), k = d3.easeCubicInOut(t); G.rot = G.fly.i(k); G.zoom = G.fly.z(k); if (t >= 1) { G.fly = null; G.last = now; } skyDirty = true; }
  else if (G.auto && !G.down && (!G.lifted || now - G.last > 5000) && G.zoom < 1.5) { G.rot[0] += G.lifted ? .04 : .08; }
  draw(now); drawSky(now);
}
function startGlobe() { resize(); updateSunInfo(); if (GL.choro !== 'off') setChoro(GL.choro); requestAnimationFrame(frame); }
