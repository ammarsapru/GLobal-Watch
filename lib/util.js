'use strict';
// Shared helpers: env loading, logging, fetch with timeouts + per-host pacing, disk cache, raw samples for diagnostics.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SAMPLE_DIR = path.join(DATA_DIR, 'samples');

function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const MOCK = process.env.MOCK === '1' || (!process.env.SERPAPI_KEY && process.env.MOCK !== '0');

// ---- per-host pacing (GDELT asks for one request every 5 seconds) ----
const PACE = { 'api.gdeltproject.org': 6000, 'query.wikidata.org': 1000, 'comtradeapi.un.org': 2500 };
const lastHit = {};
// Requests to rate-limited hosts go through one queue per host. Anything the collector starts runs "in the
// background" and always yields to requests from the screen, so a click never waits behind a batch job.
const { AsyncLocalStorage } = require('async_hooks');
const bgStore = new AsyncLocalStorage();
const inBackground = fn => bgStore.run(true, fn);
const queues = {};
function paced(host, fn) {
  const gap = PACE[host]; if (!gap) return fn();
  const q = queues[host] || (queues[host] = { busy: false, items: [] });
  return new Promise((resolve, reject) => { q.items.push({ fn, bg: !!bgStore.getStore(), resolve, reject }); pump(host); });
}
async function pump(host) {
  const q = queues[host]; if (q.busy) return; q.busy = true;
  while (q.items.length) {
    const fg = q.items.findIndex(x => !x.bg); const it = q.items.splice(fg >= 0 ? fg : 0, 1)[0];
    const wait = (lastHit[host] || 0) + PACE[host] - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastHit[host] = Date.now();
    try { it.resolve(await it.fn()); } catch (e) { it.reject(e); }
  }
  q.busy = false;
}

const UA = 'GlobalWatch/2.0 (personal intelligence dashboard; contact: local user)';
async function xfetch(name, url, opts = {}) {
  const host = (() => { try { return new URL(url).host; } catch (e) { return ''; } })();
  return paced(host, async () => {
    try {
      return await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: opts.signal || AbortSignal.timeout(opts.timeout || 25000) });
    } catch (e) {
      const why = e.name === 'TimeoutError' ? 'timed out' : (e.cause?.code || e.name);
      throw new Error(`Couldn't reach ${name} (${why}). Check your internet connection.`);
    }
  });
}
function saveSample(name, body) {
  try {
    fs.mkdirSync(SAMPLE_DIR, { recursive: true });
    const f = path.join(SAMPLE_DIR, name.replace(/[^a-z0-9_.-]/gi, '_') + '.txt');
    if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 6 * 3600e3) return;
    fs.writeFileSync(f, String(body).slice(0, 400000));
  } catch (e) {}
}
// a 429 from a paced host: push the next slot back and try once more
async function fetchRetry(name, url, opts) {
  let r = await xfetch(name, url, opts);
  const host = (() => { try { return new URL(url).host; } catch (e) { return ''; } })();
  for (let k = 1; k <= 2 && r.status === 429 && PACE[host] && !opts.noRetry; k++) {
    await r.text().catch(() => {}); lastHit[host] = Date.now() + 8000 * k; log(name, `rate-limited, retry ${k} in ~${8 * k + PACE[host] / 1000 | 0} s`); r = await xfetch(name, url, opts);
  }
  return r;
}
async function getJSON(name, url, opts = {}) {
  const r = await fetchRetry(name, url, opts);
  const txt = await r.text();
  saveSample(opts.sample || name, `${r.status} ${url.replace(/(api_key|APIKey|key)=[^&]+/gi, '$1=…')}\n${txt}`);
  if (!r.ok) throw new Error(r.status === 429 ? `${name} is rate-limiting requests right now; try again in a minute.` : `${name} returned ${r.status}${txt && txt.length < 200 ? ': ' + txt.trim() : ''}`);
  try { return JSON.parse(txt); } catch (e) { throw new Error(`${name} sent something that isn't JSON (${txt.slice(0, 80).replace(/\s+/g, ' ')}…)`); }
}
async function getText(name, url, opts = {}) {
  const r = await fetchRetry(name, url, opts);
  const txt = await r.text();
  saveSample(opts.sample || name, `${r.status} ${url}\n${txt}`);
  if (!r.ok) throw new Error(`${name} returned ${r.status}`);
  return txt;
}

// ---- cache: memory + disk so quotas survive restarts ----
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { cache = {}; }
let saveT = null;
function saveCache() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const now = Date.now();
    for (const k in cache) if (now - cache[k].t > 7 * 864e5) delete cache[k];
    const keep = Object.fromEntries(Object.entries(cache).filter(([, v]) => !v.np));
    fs.writeFile(CACHE_FILE, JSON.stringify(keep), () => {});
  }, 2000);
}
const inflight = new Map();
async function cached(key, ttlMs, fn, { persist = true, force = false } = {}) {
  const hit = cache[key];
  if (hit && !force && (process.env.REPLAY === '1' || Date.now() - hit.t < ttlMs)) return { ...hit.v, _cache: { at: hit.t, hit: true } };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const v = await fn();
      cache[key] = { t: Date.now(), v };
      if (persist) saveCache(); else cache[key].np = 1;
      return { ...v, _cache: { at: cache[key].t, hit: false } };
    } catch (e) {
      if (hit) return { ...hit.v, _cache: { at: hit.t, hit: true, stale: true, error: e.message } };
      throw e;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
const peek = key => cache[key] ? { ...cache[key].v, _cache: { at: cache[key].t, hit: true } } : null;

// ---- reference data ----
const REF = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ref.json'), 'utf8'));
const byA2 = {}; for (const [a3, r] of Object.entries(REF)) byA2[r.a2] = { a3, ...r };
const NAMES = (() => { // ISO3 -> common English name, from the front-end payload
  try { const s = fs.readFileSync(path.join(ROOT, 'public', 'payload.js'), 'utf8'); const j = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); return Object.fromEntries(Object.entries(j.data).map(([k, v]) => [k, { n: v.n, cap: v.cap, cur: v.cur, a2: v.a2, lang: v.lang, cont: v.cont }])); } catch (e) { return {}; }
})();
const country = iso => { const r = REF[iso]; const n = NAMES[iso]; return r || n ? { iso, ...(r || {}), ...(n || {}), name: n?.n || iso } : null; };

module.exports = { ROOT, DATA_DIR, log, MOCK, inBackground, xfetch, getJSON, getText, cached, peek, REF, byA2, NAMES, country, saveSample };
