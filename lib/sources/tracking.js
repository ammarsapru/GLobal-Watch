'use strict';
// Live aircraft (OpenSky all-states + adsb.lol military) and ships (AISStream websocket).
// Adds: replay snapshots, orbit (holding-pattern) detection, emergency squawks worldwide, ships that go dark.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, STATE_DIR, log, MOCK, xfetch, cached, peek } = require('../util');
const mock = MOCK ? require('../../mock') : null;

const ICAO = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'icao-ranges.json'), 'utf8'));
const MID = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'mid.json'), 'utf8'));
const AIS_KEY = process.env.AISSTREAM_KEY || '';

const hexCC = new Map();
function ccOf(hex) {
  let c = hexCC.get(hex); if (c !== undefined) return c;
  const n = parseInt(hex, 16); c = null;
  for (const r of ICAO) if (n >= r[0] && n <= r[1]) { c = r[2]; break; }
  hexCC.set(hex, c); return c;
}
const trails = new Map(); // id -> [[t,lat,lon,alt,trk]]
function addTrail(a, t) {
  if (a.lat == null || a.lon == null) return;
  let tr = trails.get(a.hex); if (!tr) { tr = []; trails.set(a.hex, tr); }
  const last = tr[tr.length - 1];
  if (!last || last[1] !== a.lat || last[2] !== a.lon) tr.push([t, a.lat, a.lon, a.alt ?? null, a.trk ?? null]);
  while (tr.length && t - tr[0][0] > 60 * 60e3) tr.shift();
}
setInterval(() => { const t = Date.now(); for (const [k, tr] of trails) if (!tr.length || t - tr[tr.length - 1][0] > 45 * 60e3) trails.delete(k); }, 5 * 60e3).unref();

// cumulative turning over the last 30 minutes; > 540° means circling (tankers, AWACS, patrol aircraft on station)
function turning(hex) {
  const tr = trails.get(hex); if (!tr || tr.length < 4) return 0;
  const since = Date.now() - 30 * 60e3; let sum = 0, prev = null;
  for (let i = 1; i < tr.length; i++) {
    if (tr[i][0] < since) continue;
    const [, la1, lo1] = tr[i - 1], [, la2, lo2] = tr[i];
    const brg = Math.atan2(Math.sin((lo2 - lo1) * Math.PI / 180) * Math.cos(la2 * Math.PI / 180), Math.cos(la1 * Math.PI / 180) * Math.sin(la2 * Math.PI / 180) - Math.sin(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.cos((lo2 - lo1) * Math.PI / 180)) * 180 / Math.PI;
    if (prev != null) { let d = brg - prev; d = ((d + 540) % 360) - 180; sum += Math.abs(d); }
    prev = brg;
  }
  return Math.round(sum);
}
const SPECIAL = { K35R: 'Tanker', KC46: 'Tanker', K35E: 'Tanker', A332: null, MRTT: 'Tanker', A3ST: null, E3TF: 'AWACS', E3CF: 'AWACS', E767: 'AWACS', E7WW: 'AWACS', R135: 'Signals intel', RC35: 'Signals intel', P8: 'Maritime patrol', P3: 'Maritime patrol', GLEX: null, Q4: 'Drone (Global Hawk)', RQ4: 'Drone (Global Hawk)', MQ9: 'Drone (Reaper)', E6: 'Command post', E4: 'Command post', C17: 'Airlifter', C5M: 'Airlifter', C130: 'Airlifter', C30J: 'Airlifter', A400: 'Airlifter', IL76: 'Airlifter' };
const roleOf = t => (t && SPECIAL[t]) || null;

let osToken = null;
async function openskyToken() {
  const id = process.env.OPENSKY_CLIENT_ID, sec = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !sec) return null;
  if (osToken && osToken.exp > Date.now() + 30e3) return osToken.v;
  const r = await xfetch('OpenSky login', 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: sec }) });
  const j = await r.json(); if (!j.access_token) return null;
  osToken = { v: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1000 };
  return osToken.v;
}
const OS_TTL = (+process.env.OPENSKY_REFRESH_SECONDS || 60) * 1000;
async function openskyAll(force) {
  return cached('opensky:all', OS_TTL, async () => {
    const tok = await openskyToken().catch(() => null);
    const r = await xfetch('OpenSky', 'https://opensky-network.org/api/states/all', { headers: tok ? { Authorization: 'Bearer ' + tok } : {}, timeout: 30000 });
    if (r.status === 429) throw new Error('OpenSky rate limit reached (anonymous users get about 100 world snapshots a day). Add free OpenSky API credentials to .env for more.');
    if (!r.ok) throw new Error('OpenSky returned ' + r.status);
    const j = await r.json(); const t = Date.now();
    const list = (j.states || []).map(s => ({ hex: s[0], cs: (s[1] || '').trim(), oc: s[2], lon: s[5], lat: s[6], alt: s[7] != null ? Math.round(s[7] * 3.28084) : (s[13] != null ? Math.round(s[13] * 3.28084) : null), gnd: s[8], gs: s[9] != null ? Math.round(s[9] * 1.94384) : null, trk: s[10] != null ? Math.round(s[10]) : null, vr: s[11] != null ? Math.round(s[11] * 196.85) : null, sq: s[14], seen: s[4] }));
    list.forEach(a => addTrail(a, t));
    return { list, time: j.time };
  }, { persist: false, force });
}
async function adsbMil() {
  return cached('adsblol:mil', 30e3, async () => {
    const r = await xfetch('adsb.lol', 'https://api.adsb.lol/v2/mil', { timeout: 25000 });
    if (!r.ok) throw new Error('adsb.lol returned ' + r.status);
    const j = await r.json(); const t = Date.now();
    const list = (j.ac || []).map(a => ({ hex: a.hex, cs: (a.flight || '').trim(), r: a.r, t: a.t, desc: a.desc, own: a.ownOp, lat: a.lat, lon: a.lon, alt: typeof a.alt_baro === 'number' ? a.alt_baro : null, gnd: a.alt_baro === 'ground', gs: a.gs != null ? Math.round(a.gs) : null, trk: a.track != null ? Math.round(a.track) : null, vr: a.baro_rate ?? null, sq: a.squawk, seen: a.seen }));
    list.forEach(a => addTrail(a, t));
    return { list };
  }, { persist: false });
}
// aircraft types learned from adsb.lol (OpenSky never sends types); used to fill in the type column
const typeOf = new Map();
const learn = list => { for (const a of list) if (a.t) typeOf.set(a.hex, [a.t, a.r || null, a.desc || null]); if (typeOf.size > 60000) typeOf.delete(typeOf.keys().next().value); };
// everything adsb.lol hears within 250 nm of a point: better coverage than OpenSky in parts of Asia, Africa and South America
async function adsbPoint(lat, lon, nm) {
  const k = `adsblol:pt:${lat.toFixed(1)},${lon.toFixed(1)},${nm}`;
  return cached(k, 45e3, async () => {
    const r = await xfetch('adsb.lol', `https://api.adsb.lol/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${nm}`, { timeout: 25000 });
    if (!r.ok) throw new Error('adsb.lol returned ' + r.status);
    const j = await r.json(); const t = Date.now();
    const list = (j.ac || []).filter(a => a.lat != null).map(a => ({ hex: a.hex, cs: (a.flight || '').trim(), r: a.r, t: a.t, desc: a.desc, own: a.ownOp, lat: a.lat, lon: a.lon, alt: typeof a.alt_baro === 'number' ? a.alt_baro : null, gnd: a.alt_baro === 'ground', gs: a.gs != null ? Math.round(a.gs) : null, trk: a.track != null ? Math.round(a.track) : null, vr: a.baro_rate ?? null, sq: a.squawk || null, milFlag: !!(a.dbFlags & 1) }));
    list.forEach(a => addTrail(a, t)); learn(list);
    return { list };
  }, { persist: false });
}
function boxPoints(box) { // up to 4 query circles covering a w,s,e,n box
  let [w, s2, e, n] = box; if (e < w) e += 360; const pts = [];
  const nx = e - w > 9 ? 2 : 1, ny = n - s2 > 9 ? 2 : 1;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { let lo = w + (e - w) * (i + .5) / nx; if (lo > 180) lo -= 360; pts.push([s2 + (n - s2) * (j + .5) / ny, lo]); }
  return pts;
}
const parseBox = b => { const v = String(b || '').split(',').map(Number); return v.length === 4 && v.every(isFinite) ? v : null; };
const inBox = (box, lon, lat) => { const [w, s, e, n] = box; if (lat < s || lat > n) return false; return w <= e ? (lon >= w && lon <= e) : (lon >= w || lon <= e); };

// replay: a compact snapshot per country each time it is fetched (kept 24 h in memory)
const replay = new Map(); // key cc|mode -> [{t, a:[[hex,lat,lon,alt,mil]]}]
function remember(key, list) {
  let arr = replay.get(key); if (!arr) { arr = []; replay.set(key, arr); }
  const t = Date.now(); if (arr.length && t - arr[arr.length - 1].t < 50e3) return;
  arr.push({ t, a: list.slice(0, 2500).map(a => [a.hex, +a.lat.toFixed(3), +a.lon.toFixed(3), a.alt ?? null, a.mil ? 1 : 0]) });
  while (arr.length && t - arr[0].t > 864e5) arr.shift();
}

async function aircraftFor(cc, q = {}) {
  let out;
  if (MOCK) out = mock.aircraft(cc, q, addTrail);
  else {
    const box = q.mode === 'over' ? parseBox(q.bbox) : null;
    const errors = [];
    const [os, mil, ...pts] = await Promise.all([openskyAll().catch(e => (errors.push('OpenSky: ' + e.message), null)), adsbMil().catch(e => (errors.push('adsb.lol: ' + e.message), null)),
      ...(box ? boxPoints(box).map(([la, lo]) => adsbPoint(la, lo, 250).catch(e => (errors.push('adsb.lol area: ' + e.message), null))) : [])]);
    if (mil?.list) learn(mil.list);
    const byHex = new Map();
    const want = a => box ? (a.lat != null && inBox(box, a.lon, a.lat)) : ccOf(a.hex) === cc;
    for (const a of os?.list || []) if (want(a)) byHex.set(a.hex, { ...a, cc: ccOf(a.hex), mil: false, src: 'OpenSky' });
    for (const a of mil?.list || []) {
      if (!want(a)) continue;
      const prev = byHex.get(a.hex);
      byHex.set(a.hex, { cc: ccOf(a.hex), ...(prev || {}), ...Object.fromEntries(Object.entries(a).filter(([, v]) => v != null && v !== '')), mil: true, src: prev ? 'OpenSky + adsb.lol' : 'adsb.lol' });
    }
    for (const p of pts) for (const a of p?.list || []) {
      if (!want(a)) continue; const prev = byHex.get(a.hex);
      if (prev && prev.mil) continue;
      byHex.set(a.hex, { cc: ccOf(a.hex), ...(prev || {}), ...Object.fromEntries(Object.entries(a).filter(([k, v]) => v != null && v !== '' && k !== 'milFlag')), mil: !!a.milFlag, src: prev && /OpenSky/.test(prev.src) ? 'OpenSky + adsb.lol' : 'adsb.lol' });
    }
    const list = [...byHex.values()].filter(a => a.lat != null && a.lon != null);
    for (const a of list) if (!a.t) { const k = typeOf.get(a.hex); if (k) { a.t = k[0]; a.r = a.r || k[1]; a.desc = a.desc || k[2]; } }
    if (list.length > 4000) list.length = 4000;
    out = { cc, mode: box ? 'over' : 'reg', list, errors, osAt: os?._cache?.at, milAt: mil?._cache?.at, stale: !!(os?._cache?.stale || mil?._cache?.stale) };
  }
  for (const a of out.list) {
    a.trail = (trails.get(a.hex) || []).length;
    a.role = roleOf(a.t);
    if (a.mil || a.role) { const tu = turning(a.hex); if (tu > 540) a.orbit = tu; }
    if (['7500', '7600', '7700'].includes(String(a.sq))) a.emergency = { '7500': 'Hijack', '7600': 'Radio failure', '7700': 'Emergency' }[a.sq];
  }
  remember(cc + '|' + (out.mode || 'reg'), out.list);
  return out;
}
// worldwide emergency squawks from whatever snapshot is already cached (no extra API calls)
function emergencies() {
  const seen = new Map();
  const os = peek('opensky:all'), mil = peek('adsblol:mil');
  for (const a of [...(os?.list || []), ...(mil?.list || [])]) {
    if (!['7500', '7600', '7700'].includes(String(a.sq)) || a.lat == null) continue;
    seen.set(a.hex, { hex: a.hex, cs: a.cs, cc: ccOf(a.hex), lat: a.lat, lon: a.lon, alt: a.alt, sq: a.sq, kind: { '7500': 'Hijack', '7600': 'Radio failure', '7700': 'Emergency' }[a.sq] });
  }
  if (MOCK && !seen.size) seen.set('abc123', { hex: 'abc123', cs: 'SAMPLE77', cc: 'US', lat: 40.6, lon: -73.7, alt: 8200, sq: '7700', kind: 'Emergency' });
  return [...seen.values()];
}
// counts of aircraft per registration country from the cached world snapshot (used by the collector)
function countsByCountry() {
  const os = peek('opensky:all'), mil = peek('adsblol:mil'); const out = {};
  const milSet = new Set((mil?.list || []).map(a => a.hex));
  const osHex = new Set();
  for (const a of os?.list || []) { osHex.add(a.hex); const c = ccOf(a.hex); if (!c || a.gnd) continue; const o = out[c] ||= { air: 0, mil: 0 }; o.air++; if (milSet.has(a.hex)) o.mil++; }
  for (const a of mil?.list || []) { if (osHex.has(a.hex) || a.gnd) continue; const c = ccOf(a.hex); if (!c) continue; const o = out[c] ||= { air: 0, mil: 0 }; o.air++; o.mil++; }
  return { counts: out, at: os?._cache?.at || null };
}

// ---------- Ships ----------
const ships = new Map();
// names, types and destinations arrive only every few minutes, so remember them on disk across restarts
const STATIC_FILE = path.join(STATE_DIR, 'ships-static.json');
let shipStatic = {}; try { shipStatic = JSON.parse(fs.readFileSync(STATIC_FILE, 'utf8')); } catch (e) {}
let staticDirty = false;
setInterval(() => { if (!staticDirty) return; staticDirty = false; const cut = Date.now() - 60 * 864e5; for (const k in shipStatic) if (shipStatic[k].u < cut) delete shipStatic[k]; try { fs.writeFileSync(STATIC_FILE, JSON.stringify(shipStatic)); } catch (e) {} }, 5 * 60e3).unref();
const AIS_IDLE = (+process.env.AIS_IDLE_MINUTES || 30) * 60e3;
const ais = { ws: null, state: 'off', error: null, lastReq: 0, msgs: 0, since: 0, backoff: 2000 };
const midOf = id => (id.length === 9 && /^[2-7]/.test(id)) ? MID[id.slice(0, 3)] || null : null;
function aisConnect() {
  if (MOCK && !AIS_KEY) return;
  if (!AIS_KEY) { ais.error = 'Add AISSTREAM_KEY to .env (free key from aisstream.io), then restart.'; return; }
  if (typeof WebSocket === 'undefined') { ais.error = 'Ships need Node.js 22 or newer. Update Node from nodejs.org.'; return; }
  if (ais.ws) return;
  ais.state = 'connecting';
  let ws; try { ws = new WebSocket('wss://stream.aisstream.io/v0/stream'); } catch (e) { ais.error = 'Could not open the AISStream connection: ' + e.message; ais.state = 'off'; return; }
  ais.ws = ws;
  ws.onopen = () => { ws.send(JSON.stringify({ APIKey: AIS_KEY, BoundingBoxes: [[[-90, -180], [90, 180]]], FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'] })); ais.state = 'live'; ais.since = Date.now(); ais.error = null; ais.backoff = 2000; log('AISStream connected'); };
  ws.onmessage = async ev => {
    let txt = ev.data; if (typeof txt !== 'string') txt = typeof txt.text === 'function' ? await txt.text() : Buffer.from(txt).toString();
    let m; try { m = JSON.parse(txt); } catch (e) { return; }
    if (m.error) { ais.error = 'AISStream: ' + m.error; log(ais.error); return; }
    ais.msgs++;
    const md = m.MetaData || {}; const id = String(md.MMSI || ''); if (!id) return;
    const t = Date.now(); let sh = ships.get(id); if (!sh) { const k = shipStatic[id]; sh = { mmsi: id, c: t, ...(k ? { name: k.name, type: k.type, dest: k.dest, cs: k.cs, imo: k.imo, len: k.len } : {}) }; ships.set(id, sh); }
    const kind = m.MessageType, b = (m.Message && m.Message[kind]) || {};
    if (kind === 'ShipStaticData') {
      sh.name = (b.Name || md.ShipName || '').trim(); sh.type = b.Type; sh.dest = (b.Destination || '').trim(); sh.cs = (b.CallSign || '').trim(); sh.imo = b.ImoNumber || null;
      if (b.Dimension) sh.len = (b.Dimension.A || 0) + (b.Dimension.B || 0) || null;
      shipStatic[id] = { name: sh.name, type: sh.type, dest: sh.dest, cs: sh.cs, imo: sh.imo, len: sh.len || null, u: t }; staticDirty = true;
    } else {
      const lat = b.Latitude ?? md.latitude, lon = b.Longitude ?? md.longitude;
      if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      sh.lat = lat; sh.lon = lon; sh.sog = b.Sog; sh.cog = b.Cog; sh.hdg = b.TrueHeading === 511 ? null : b.TrueHeading; sh.nav = b.NavigationalStatus; sh.t = t;
      if (sh.sog > 1) sh.lastMoving = t;
      if (!sh.name && md.ShipName) sh.name = String(md.ShipName).trim();
      if (!sh.lt || t - sh.lt > 60e3) { sh.lt = t; addTrail({ hex: 's' + id, lat, lon, alt: null }, t); }
    }
  };
  ws.onerror = () => { ais.error = ais.error || 'AISStream connection error. Check the key and your internet connection.'; };
  ws.onclose = ev => {
    ais.ws = null; ais.state = 'off';
    if (ev && ev.reason) ais.error = 'AISStream closed the connection: ' + ev.reason;
    log('AISStream disconnected', ev && ev.code, (ev && ev.reason) || '');
    if (Date.now() - ais.lastReq < AIS_IDLE) { setTimeout(aisConnect, ais.backoff); ais.backoff = Math.min(ais.backoff * 2, 60e3); }
  };
}
setInterval(() => {
  const t = Date.now();
  for (const [k, sh] of ships) if ((sh.t && t - sh.t > 6 * 3600e3) || (!sh.t && t - sh.c > 3600e3)) ships.delete(k);
  if (ais.ws && t - ais.lastReq > AIS_IDLE) { log(`AISStream idle for ${AIS_IDLE / 60e3} min, disconnecting to save bandwidth`); ais.lastReq = 0; try { ais.ws.close(); } catch (e) {} }
}, 60e3).unref();
function shipsFor(cc, q = {}) {
  if (MOCK && !AIS_KEY) return mock.ships(cc, q, addTrail);
  ais.lastReq = Date.now(); aisConnect();
  const box = q.mode === 'near' ? parseBox(q.bbox) : null; const now = Date.now();
  let list = [], dark = [];
  for (const sh of ships.values()) {
    if (sh.lat == null) continue;
    const flag = midOf(sh.mmsi);
    if (box ? !inBox(box, sh.lon, sh.lat) : flag !== cc) continue;
    const silent = now - sh.t;
    // "gone dark": was moving, then no report for over an hour (only meaningful once we've been connected that long)
    if (silent > 3600e3) { if (sh.lastMoving && now - ais.since > 3600e3) dark.push({ ...sh, flag, silentMin: Math.round(silent / 60e3) }); continue; }
    list.push({ ...sh, flag });
  }
  list.sort((a, b) => b.t - a.t); if (list.length > 4000) list.length = 4000;
  for (const sh of list) sh.trail = (trails.get('s' + sh.mmsi) || []).length;
  return { cc, mode: box ? 'near' : 'flag', list, dark: dark.slice(0, 50), state: ais.state, since: ais.since, msgs: ais.msgs, tracked: ships.size, error: ais.error, warming: ais.state === 'live' && now - ais.since < 5 * 60e3 };
}
const aisStatus = () => ({ configured: !!AIS_KEY, state: ais.state, error: ais.error });

module.exports = { aircraftFor, shipsFor, emergencies, countsByCountry, openskyAll, trails, replay, aisStatus, OS_TTL, inBox, parseBox };
