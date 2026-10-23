'use strict';
// Background collector: runs on a schedule, stores history, learns hourly baselines, raises alerts, writes a morning brief.
const { log, MOCK, country, NAMES, peek } = require('./util');
const store = require('./store');
const gdelt = require('./sources/gdelt');
const hazards = require('./sources/hazards');
const stab = require('./sources/stability');
const track = require('./sources/tracking');
const { chat, PROMPTS, ai } = require('./ai');

const settings = store.json('settings.json', { watch: ['USA', 'CHN', 'RUS', 'UKR', 'JPN'], rules: [{ kw: 'coup' }, { kw: 'martial law' }, { kw: 'sanctions' }, { kw: 'missile' }], passport: 'US', briefTime: process.env.BRIEF_TIME || '07:30' });
const saveSettings = () => store.saveJSON('settings.json', settings);
let focus = null; // the country currently open in the UI also gets collected
const status = { runs: 0, last: {}, errors: {} };

const sevRank = { info: 0, warn: 1, crit: 2 };
function alert(a) {
  const key = a.key || (a.kind + ':' + (a.iso || '') + ':' + a.title);
  const dup = store.query('alerts', x => x.key === key, Date.now() - (a.dedupeH || 12) * 3600e3);
  if (dup.length) return null;
  const row = store.append('alerts', { iso: a.iso || null, sev: a.sev || 'info', kind: a.kind, title: a.title, detail: a.detail || '', link: a.link || null, lat: a.lat ?? null, lon: a.lon ?? null, key });
  log('ALERT', row.sev, row.title);
  return row;
}
function metric(iso, k, v) { if (v == null || !isFinite(v)) return; store.append('metrics', { iso, k, v: +(+v).toFixed(3) }); }
// baseline at the same hour of day (±1 h) over the last 14 days
function baseline(iso, k, at = Date.now()) {
  const h = new Date(at).getUTCHours();
  const near = t => { const hr = new Date(t).getUTCHours(); return Math.min((hr - h + 24) % 24, (h - hr + 24) % 24) <= 1; };
  const rows = store.query('metrics', r => r.iso === iso && r.k === k && near(r.t) && at - r.t > 30 * 60e3, at - 14 * 864e5);
  if (rows.length < 6) return { n: rows.length };
  const vs = rows.map(r => r.v); const mean = vs.reduce((a, b) => a + b, 0) / vs.length; const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length);
  return { n: rows.length, mean, sd };
}
function checkAnomaly(iso, k, v, label, minAbs = 3) {
  const b = baseline(iso, k); if (!b.mean && b.mean !== 0) return;
  const z = (v - b.mean) / (b.sd || 1);
  if (z >= 3 && v - b.mean >= minAbs) alert({ iso, sev: z >= 5 ? 'crit' : 'warn', kind: 'anomaly', title: `${country(iso)?.name}: ${label} unusually high (${Math.round(v)} vs normal ${b.mean.toFixed(0)})`, detail: `${z.toFixed(1)} standard deviations above the usual level at this hour over the past two weeks.`, key: `anom:${iso}:${k}:${new Date().toISOString().slice(0, 13)}` });
}
const countries = () => [...new Set([...settings.watch, focus].filter(Boolean))].slice(0, 10);

async function runHazards() {
  const h = await hazards.all(true);
  for (const q of h.quakes) {
    if (q.mag >= 6) alert({ sev: q.mag >= 7 ? 'crit' : 'warn', kind: 'quake', title: `M${q.mag} earthquake — ${q.place}`, detail: q.tsunami ? 'Tsunami flag set by USGS.' : '', link: q.url, lat: q.lat, lon: q.lon, key: 'q:' + q.id, dedupeH: 240 });
  }
  for (const a of h.alerts) if (a.level === 'Red' || a.level === 'Orange') alert({ iso: a.iso3 || null, sev: a.level === 'Red' ? 'crit' : 'warn', kind: 'disaster', title: `${a.level} alert: ${a.type} — ${a.title}`, detail: a.severity, link: a.url, lat: a.lat, lon: a.lon, key: 'g:' + a.id + a.level, dedupeH: 240 });
}
async function runOutages() {
  const s = await stab.outageSummary();
  const watched = new Set(countries().map(i => country(i)?.a2));
  for (const r of s.rows) {
    const iso = Object.keys(NAMES).find(k => NAMES[k].a2 === r.cc);
    if (iso && watched.has(r.cc)) metric(iso, 'outage', r.score);
    if (r.score > 1e4 || (watched.has(r.cc) && r.score > 1000)) alert({ iso, sev: r.score > 1e5 ? 'crit' : 'warn', kind: 'outage', title: `Internet disruption detected: ${r.name}`, detail: `IODA outage score ${Math.round(r.score)} over the last 24 h.`, link: 'https://ioda.inetintel.cc.gatech.edu/country/' + r.cc, key: 'o:' + r.cc + ':' + new Date().toISOString().slice(0, 10) });
  }
}
async function runNews() {
  for (const iso of countries()) {
    try {
      const r = await gdelt.articles(iso, {});
      const known = new Set(store.query('articles', a => a.iso === iso, Date.now() - 10 * 864e5).map(a => a.link));
      let fresh = 0;
      for (const a of r.items) {
        if (known.has(a.link)) continue; fresh++;
        store.append('articles', { iso, title: a.title, link: a.link, source: a.source, date: a.date, state: a.state, domestic: a.domestic });
        for (const rule of settings.rules) if ((!rule.iso || rule.iso === iso) && new RegExp('\\b' + rule.kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(a.title))
          alert({ iso, sev: 'warn', kind: 'keyword', title: `"${rule.kw}" in ${country(iso)?.name} news: ${a.title}`, link: a.link, key: 'k:' + a.link });
      }
      metric(iso, 'news', fresh);
      const tv = await gdelt.toneVolume(iso, {}).catch(() => null);
      const tone = tv?.tone?.at(-1)?.v, vol = tv?.volume?.at(-1)?.v;
      if (tone != null) metric(iso, 'tone', tone);
      if (vol != null) { metric(iso, 'volume', vol); checkAnomaly(iso, 'volume', vol, 'news volume', 20); }
    } catch (e) { status.errors.news = e.message; }
  }
}
async function runAir() {
  const interval = process.env.OPENSKY_CLIENT_ID ? 10 * 60e3 : 30 * 60e3;
  const cur = peek('opensky:all');
  if (!MOCK && (!cur || Date.now() - cur._cache.at > interval)) await track.openskyAll(true).catch(e => { status.errors.air = e.message; });
  if (MOCK) { for (const iso of countries()) { const r = await track.aircraftFor(country(iso).a2, {}); metric(iso, 'air', r.list.filter(x => !x.gnd).length); metric(iso, 'mil', r.list.filter(x => x.mil).length); } return; }
  const { counts, at } = track.countsByCountry(); if (!at) return;
  for (const iso of countries()) { const c = counts[country(iso)?.a2] || { air: 0, mil: 0 }; metric(iso, 'air', c.air); metric(iso, 'mil', c.mil); checkAnomaly(iso, 'mil', c.mil, 'military flight activity', 4); }
  for (const e of track.emergencies()) { const iso = Object.keys(NAMES).find(k => NAMES[k].a2 === e.cc); alert({ iso, sev: e.sq === '7500' ? 'crit' : 'warn', kind: 'squawk', title: `${e.kind} squawk ${e.sq}: ${e.cs || e.hex}${iso ? ' (' + country(iso).name + ')' : ''}`, lat: e.lat, lon: e.lon, link: 'https://globe.adsbexchange.com/?icao=' + e.hex, key: 'sq:' + e.hex, dedupeH: 6 }); }
}
async function runAdvisories() {
  const adv = await stab.usAdvisories();
  const prev = store.json('advisory-levels.json', {});
  const first = !Object.keys(prev).length;
  for (const [iso, a] of Object.entries(adv.byIso || {})) {
    if (!first && prev[iso] && a.level && prev[iso] !== a.level) alert({ iso, sev: a.level >= 3 ? 'warn' : 'info', kind: 'advisory', title: `US travel advisory for ${country(iso)?.name} changed: Level ${prev[iso]} → Level ${a.level}`, link: a.link, key: 'adv:' + iso + ':' + a.level, dedupeH: 720 });
    prev[iso] = a.level;
  }
  store.saveJSON('advisory-levels.json', prev);
}
async function runBrief(force) {
  const [hh, mm] = settings.briefTime.split(':').map(Number); const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (!force) { if (now.getHours() < hh || (now.getHours() === hh && now.getMinutes() < mm)) return; if (store.query('briefs', b => b.day === today).length) return; }
  const parts = [];
  for (const iso of settings.watch.slice(0, 6)) {
    const arts = store.query('articles', a => a.iso === iso, Date.now() - 24 * 3600e3).slice(-12).map(a => '- ' + a.title + ' (' + a.source + ')');
    const al = store.query('alerts', a => a.iso === iso, Date.now() - 24 * 3600e3).map(a => '- ALERT: ' + a.title);
    if (arts.length || al.length) parts.push(`${country(iso)?.name}\n${[...al, ...arts].join('\n')}`);
  }
  const glob = store.query('alerts', a => !a.iso, Date.now() - 24 * 3600e3).map(a => '- ' + a.title);
  if (glob.length) parts.push('WORLD\n' + glob.join('\n'));
  if (!parts.length) return null;
  const [s, u] = PROMPTS.brief({ material: parts.join('\n\n').slice(0, 7000) });
  const text = await chat(s, u, { max: 600 });
  return store.append('briefs', { day: today, text, model: ai.model, countries: settings.watch.slice(0, 6) });
}
const JOBS = [['hazards', runHazards, 10], ['outages', runOutages, 20], ['news', runNews, 15], ['air', runAir, 10], ['advisories', runAdvisories, 360], ['brief', () => runBrief(false), 10]];
function start() {
  if (process.env.COLLECTOR === '0') return;
  let i = 0;
  for (const [name, fn, every] of JOBS) {
    const run = async () => { try { await fn(); status.last[name] = Date.now(); delete status.errors[name]; } catch (e) { status.errors[name] = e.message; } };
    setTimeout(() => { run(); setInterval(run, every * 60e3).unref(); }, 8000 + (i++) * 15000).unref();
  }
  log('Collector running for', countries().join(', '));
}
function situation() {
  const since = Date.now() - 24 * 3600e3;
  return countries().map(iso => {
    const al = store.query('alerts', a => a.iso === iso, since);
    const worst = al.reduce((m, a) => Math.max(m, sevRank[a.sev] ?? 0), -1);
    const series = k => store.query('metrics', r => r.iso === iso && r.k === k, Date.now() - 7 * 864e5).map(r => [r.t, r.v]);
    return { iso, name: country(iso)?.name, level: worst < 0 ? 'calm' : ['info', 'warn', 'crit'][worst], alerts: al.length, latest: al.at(-1) || null, mil: series('mil').slice(-48), air: series('air').slice(-48), tone: series('tone').slice(-28), baseline: baseline(iso, 'mil') };
  });
}
module.exports = { start, settings, saveSettings, setFocus: iso => { focus = iso; }, situation, alert, runBrief, status, baseline };
