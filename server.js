// Global Watch — local server. Zero npm dependencies (Node 18+, ships need Node 22+).
// Holds API keys, proxies and caches every data source, runs the background collector, answers voice/typed questions.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, STATE_DIR, log, MOCK, country } = require('./lib/util');
const store = require('./lib/store');
const serp = require('./lib/sources/serp');
const track = require('./lib/sources/tracking');
const gdelt = require('./lib/sources/gdelt');
const hazards = require('./lib/sources/hazards');
const stab = require('./lib/sources/stability');
const gov = require('./lib/sources/gov');
const econ = require('./lib/sources/econ');
const place = require('./lib/sources/place');
const space = require('./lib/sources/space');
const AI = require('./lib/ai');
const { ask } = require('./lib/ask');
const collector = require('./lib/collector');

const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const AUTH_TOKEN = APP_PASSWORD ? crypto.createHash('sha256').update('gw:' + APP_PASSWORD).digest('hex') : '';
const PUB = path.join(ROOT, 'public');
const isoOf = q => { const i = String(q.iso || '').toUpperCase(); if (!country(i)) throw new Error('Unknown country code.'); return i; };

const routes = {
  async '/api/status'() {
    const [acct] = await Promise.all([serp.account().catch(e => ({ error: e.message })), AI.probe()]);
    return { mock: MOCK, serp: { configured: serp.configured, ...acct, callsThisRun: serp.calls() }, ai: { connected: !!AI.ai.base, provider: AI.ai.provider, model: AI.ai.model, models: AI.ai.models, error: AI.ai.error }, ais: track.aisStatus(), opensky: { authenticated: !!process.env.OPENSKY_CLIENT_ID, refreshSeconds: track.OS_TTL / 1000 }, collector: collector.status };
  },
  async '/api/ai/reconnect'() { await AI.probe(true); return { connected: !!AI.ai.base, provider: AI.ai.provider, model: AI.ai.model, error: AI.ai.error }; },
  // ---- news
  async '/api/news'(q) {
    if (q.src === 'google') return serp.googleNews(q);
    if (!q.iso) return gdelt.world(q);
    const iso = isoOf(q); collector.setFocus(iso);
    const r = await gdelt.articles(iso, q);
    // thread info: how long each story has been running (from stored history)
    const hist = store.query('articles', a => a.iso === iso, Date.now() - 10 * 864e5);
    return { ...r, history: hist.slice(-600).map(a => [a.title, a.t]) };
  },
  async '/api/news/tone'(q) { return gdelt.toneVolume(isoOf(q), q); },
  async '/api/news/places'(q) { return gdelt.places(isoOf(q)); },
  // ---- finance
  async '/api/finance/quote'(q) { return serp.quote(q); },
  async '/api/finance/markets'(q) { return serp.markets(q); },
  async '/api/econ'(q) { const iso = isoOf(q); const [wb, im] = await Promise.all([econ.worldBank(iso).catch(e => ({ error: e.message })), econ.imf(iso).catch(e => ({ error: e.message }))]); return { wb, imf: im }; },
  async '/api/fx'(q) { return econ.fx(String(q.code || '').toUpperCase()); },
  async '/api/trade'(q) { return econ.trade(isoOf(q)); },
  // ---- travel
  async '/api/flights'(q) { return serp.flights(q); },
  async '/api/hotels'(q) { return serp.hotels(q); },
  async '/api/places'(q) { return serp.places(q); },
  async '/api/visa'(q) { return place.visa(String(q.from || '').toUpperCase(), String(q.to || '').toUpperCase()); },
  async '/api/weather'(q) { return place.weather(isoOf(q), q.city); },
  async '/api/climate'(q) { return place.climate(isoOf(q), q.city); },
  // ---- tracking & space
  async '/api/aircraft'(q) { if (!/^[A-Z]{2}$/.test(q.cc || '')) throw new Error('Missing country code.'); return track.aircraftFor(q.cc, q); },
  async '/api/aircraft/trail'(q) { return { hex: q.hex, trail: track.trails.get(q.hex) || [] }; },
  async '/api/aircraft/replay'(q) { return { frames: track.replay.get(q.cc + '|' + (q.mode || 'reg')) || [] }; },
  async '/api/emergencies'() { return { list: track.emergencies() }; },
  async '/api/ships'(q) { if (!/^[A-Z]{2}$/.test(q.cc || '')) throw new Error('Missing country code.'); return track.shipsFor(q.cc, q); },
  async '/api/space'(q) { return space.forCountry(q.iso ? country(isoOf(q)).a2 : null); },
  // ---- world signals
  async '/api/hazards'(q) { return hazards.all(q.force === '1'); },
  async '/api/unrest'(q) { const iso = isoOf(q); const [u, p] = await Promise.all([gdelt.unrest(iso, q), gdelt.unrestPoints(iso).catch(e => ({ points: [], error: e.message }))]); return { ...u, points: p.points, pointsError: p.error }; },
  async '/api/outages'(q) { return q.iso ? stab.outages(isoOf(q)) : stab.outageSummary(); },
  async '/api/advisory'(q) { return stab.advisory(isoOf(q)); },
  async '/api/advisories'() { const r = await stab.usAdvisories(); return { levels: Object.fromEntries(Object.entries(r.byIso).map(([k, v]) => [k, v.level])) }; },
  async '/api/gov'(q) { return gov.government(isoOf(q)); },
  async '/api/ref'(q) { const c = country(isoOf(q)); if (!c) throw Object.assign(new Error('Unknown country'), { status: 404 }); return c; },
  // ---- intelligence layer
  async '/api/alerts'(q) { return { list: store.query('alerts', a => !q.iso || a.iso === q.iso || !a.iso, Date.now() - (+q.hours || 48) * 3600e3).slice(-200).reverse() }; },
  async '/api/situation'() { return { list: collector.situation() }; },
  async '/api/metrics'(q) { const iso = isoOf(q); return { rows: store.query('metrics', r => r.iso === iso && (!q.k || r.k === q.k), Date.now() - 14 * 864e5).map(r => [r.t, r.k, r.v]), baseline: q.k ? collector.baseline(iso, q.k) : null }; },
  async '/api/brief'(q) { if (q.generate === '1') { const b = await collector.runBrief(true); if (!b) throw new Error('Not enough collected material yet. Leave the app running for an hour and try again.'); return b; } const b = store.query('briefs').at(-1); return b || { text: null }; },
  async '/api/settings'() { return collector.settings; },
  async 'POST /api/settings'(q, b) {
    const s = collector.settings;
    if (Array.isArray(b.watch)) s.watch = b.watch.filter(i => country(i)).slice(0, 12);
    if (Array.isArray(b.rules)) s.rules = b.rules.filter(r => r && typeof r.kw === 'string' && r.kw.trim().length > 1).map(r => ({ kw: r.kw.trim().slice(0, 60), iso: r.iso || null })).slice(0, 40);
    if (typeof b.passport === 'string' && /^[A-Z]{2}$/.test(b.passport)) s.passport = b.passport;
    if (typeof b.briefTime === 'string' && /^\d{2}:\d{2}$/.test(b.briefTime)) s.briefTime = b.briefTime;
    collector.saveSettings(); return s;
  },
  async 'POST /api/ask'(q, b) { return ask({ question: String(b.question || '').slice(0, 600), iso: b.iso && country(b.iso) ? b.iso : null, client: b.client || {}, panels: b.panels, history: Array.isArray(b.history) ? b.history.slice(-3) : [] }); },
  async 'POST /api/ai'(q, b) {
    const f = AI.PROMPTS[b.task]; if (!f) throw new Error('Unknown AI task');
    const [sys, user] = f(b);
    const { cached } = require('./lib/util');
    const key = 'ai:' + crypto.createHash('sha1').update(b.task + user).digest('hex');
    return cached(key, b.task === 'digest' ? 12 * 3600e3 : 6 * 3600e3, async () => ({ text: await AI.chat(sys, user), provider: AI.ai.provider, model: AI.ai.model }));
  },
  // checks every source once for a country and reports what worked (also writes raw samples to data/samples/)
  async '/api/diag'(q) {
    const iso = q.iso ? isoOf(q) : 'JPN'; const c = country(iso); const out = {};
    const t = async (name, fn) => { const s = Date.now(); try { const r = await fn(); out[name] = { ok: true, ms: Date.now() - s, summary: JSON.stringify(r).slice(0, 160) }; } catch (e) { out[name] = { ok: false, ms: Date.now() - s, error: e.message }; } };
    await t('gdelt-news', () => gdelt.articles(iso, {}).then(r => r.items.length + ' articles'));
    await t('gdelt-tone', () => gdelt.toneVolume(iso, {}).then(r => r.tone.length + ' tone points'));
    await t('gdelt-places', () => gdelt.places(iso).then(r => r.points.length + ' places'));
    await t('hazards', () => hazards.all().then(r => `${r.quakes.length} quakes, ${r.events.length} events, ${r.alerts.length} alerts; ${r.errors.join(' ')}`));
    await t('outages', () => stab.outages(iso).then(r => r.alerts.length + ' alerts, ' + r.series.length + ' series'));
    await t('advisory', () => stab.advisory(iso).then(r => (r.us ? 'US L' + r.us.level : 'no US') + ', ' + (r.uk ? 'UK ok' : 'no UK')));
    await t('government', () => gov.government(iso).then(r => r.people.map(p => p.name).join(', ')));
    await t('worldbank', () => econ.worldBank(iso).then(r => Object.keys(r.series).length + ' indicators'));
    await t('imf', () => econ.imf(iso).then(r => Object.keys(r.series).length + ' indicators'));
    await t('trade', () => econ.trade(iso).then(r => r.year + ': ' + r.exports.partners.length + ' partners'));
    await t('fx', () => econ.fx((c.cur || '').split(',')[0]).then(r => r.perUSD + ' per USD, ' + r.history.length + ' days'));
    await t('weather', () => place.weather(iso).then(r => r.place.name + ' ' + r.current?.temperature_2m + '°C'));
    await t('climate', () => place.climate(iso).then(r => 'best ' + r.best.join(',')));
    await t('space', () => space.forCountry(c.a2).then(r => r.owned.length + ' owned of ' + r.total));
    await t('aircraft', () => track.aircraftFor(c.a2, {}).then(r => r.list.length + ' aircraft; ' + (r.errors || []).join(' ')));
    await t('ai', () => AI.probe(true).then(r => r.base ? r.provider + ' ' + r.model : 'offline: ' + r.error));
    return { iso, results: out, samples: fs.existsSync(path.join(STATE_DIR, 'samples')) ? fs.readdirSync(path.join(STATE_DIR, 'samples')) : [] };
  }
};

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req) { return new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); }); }
const LOGIN_HTML = err => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Global Watch · Sign in</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0f13;color:#d8e1e5;font:15px system-ui,sans-serif}form{display:flex;flex-direction:column;gap:12px;width:min(320px,90vw);padding:24px;border:1px solid #22313b;border-radius:6px;background:#10171c}h1{margin:0;font-size:16px;letter-spacing:.14em;text-transform:uppercase}input{padding:9px 10px;border-radius:4px;border:1px solid #2e404c;background:#141d24;color:inherit;font:inherit}button{padding:9px;border:0;border-radius:4px;background:#e6a23c;color:#1b1206;font-weight:600;font:inherit;cursor:pointer}p{margin:0;color:#e0735a;font-size:13px}</style></head><body><form method="post" action="/login"><h1>Global Watch</h1><label for="pw">Password</label><input id="pw" name="password" type="password" autofocus required>${err ? '<p>That password is wrong.</p>' : ''}<button type="submit">Sign in</button></form></body></html>`;
const fails = new Map();
const authed = req => !APP_PASSWORD || (req.headers.cookie || '').split(/;\s*/).some(c => c === 'gw_auth=' + AUTH_TOKEN);
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (APP_PASSWORD && u.pathname === '/login') {
    if (req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); const f = fails.get(ip) || { n: 0, t: 0 };
      if (f.n >= 8 && Date.now() - f.t < 15 * 60e3) { res.writeHead(429, { 'Content-Type': 'text/plain' }); res.end('Too many attempts. Try again in 15 minutes.'); return; }
      let b = ''; for await (const c of req) { b += c; if (b.length > 4096) break; }
      const pw = new URLSearchParams(b).get('password') || '';
      if (pw.length === APP_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(APP_PASSWORD))) { fails.delete(ip); const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : ''; res.writeHead(303, { Location: '/', 'Set-Cookie': `gw_auth=${AUTH_TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${secure}` }); res.end(); return; }
      fails.set(ip, { n: f.n + 1, t: Date.now() }); res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(LOGIN_HTML(true)); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(LOGIN_HTML(false)); return;
  }
  if (!authed(req)) { if (u.pathname.startsWith('/api/')) return send(res, 401, { error: 'Signed out. Reload the page to sign in again.', code: 'auth' }); res.writeHead(303, { Location: '/login' }); res.end(); return; }
  const key = (req.method === 'POST' ? 'POST ' : '') + u.pathname;
  if (routes[key]) {
    try { send(res, 200, await routes[key](Object.fromEntries(u.searchParams), req.method === 'POST' ? await body(req) : null)); }
    catch (e) { send(res, e.code === 'no_ai' ? 503 : 502, { error: e.message, code: e.code || 'upstream' }); }
    return;
  }
  let p = path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, '');
  if (!p || p === '.') p = 'index.html';
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': /vendor/.test(p) ? 'max-age=86400' : 'no-cache' });
  fs.createReadStream(f).pipe(res);
});
// keep running whatever a data source throws; log it instead of crashing
process.on('unhandledRejection', e => log('Unhandled error (kept running):', e && e.stack || e));
process.on('uncaughtException', e => log('Uncaught exception (kept running):', e && e.stack || e));
server.on('error', e => { log('Server error:', e.code === 'EADDRINUSE' ? `port ${PORT} is already in use — is Global Watch already running in another window?` : e.message); if (e.code === 'EADDRINUSE') process.exit(2); });
server.listen(PORT, HOST, () => {
  log(`Global Watch running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${MOCK ? '  (MOCK MODE — sample data, no API calls)' : ''}${APP_PASSWORD ? ' · password protected' : ''}`);
  if (HOST === '0.0.0.0' && !APP_PASSWORD) log('WARNING: listening publicly without APP_PASSWORD — anyone with the URL can spend your API quota.');
  AI.probe(true);
  collector.start();
});
