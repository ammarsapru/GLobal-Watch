'use strict';
// Tiny append-only history store (newline-delimited JSON per collection). No dependencies, survives restarts.
// Collections: metrics (hourly measurements), alerts, articles (news seen per country), briefs.
const fs = require('fs');
const path = require('path');
const { STATE_DIR } = require('./util');

const DIR = path.join(STATE_DIR, 'db');
fs.mkdirSync(DIR, { recursive: true });
const KEEP = { metrics: 30 * 864e5, alerts: 14 * 864e5, articles: 10 * 864e5, briefs: 30 * 864e5, tracks: 864e5 };
const mem = {};

function load(col) {
  if (mem[col]) return mem[col];
  const f = path.join(DIR, col + '.ndjson'); const cut = Date.now() - (KEEP[col] || 30 * 864e5);
  let rows = [];
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l) continue; try { const r = JSON.parse(l); if (r.t >= cut) rows.push(r); } catch (e) {} }
  mem[col] = rows; return rows;
}
const pending = {};
function append(col, row) {
  row.t = row.t || Date.now();
  load(col).push(row);
  (pending[col] ||= []).push(JSON.stringify(row));
  schedule();
  return row;
}
let flushT = null;
function schedule() { if (!flushT) flushT = setTimeout(flush, 1500); }
function flush() {
  flushT = null;
  for (const [col, lines] of Object.entries(pending)) { if (!lines.length) continue; fs.appendFileSync(path.join(DIR, col + '.ndjson'), lines.join('\n') + '\n'); pending[col] = []; }
}
function compact() { // rewrite files without expired rows, once an hour
  for (const col of Object.keys(mem)) {
    const cut = Date.now() - (KEEP[col] || 30 * 864e5);
    mem[col] = mem[col].filter(r => r.t >= cut);
    fs.writeFileSync(path.join(DIR, col + '.ndjson'), mem[col].map(r => JSON.stringify(r)).join('\n') + (mem[col].length ? '\n' : ''));
  }
}
setInterval(() => { flush(); compact(); }, 3600e3).unref();
process.on('exit', flush);
const query = (col, fn = () => true, since = 0) => load(col).filter(r => r.t >= since && fn(r));
function json(name, dflt) { try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, name), 'utf8')); } catch (e) { return dflt; } }
function saveJSON(name, v) { fs.writeFileSync(path.join(STATE_DIR, name), JSON.stringify(v, null, 1)); }

module.exports = { append, query, flush, json, saveJSON };
