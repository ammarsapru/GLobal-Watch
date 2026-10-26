'use strict';
// Satellites: CelesTrak orbital elements (TLE) for every active satellite + SATCAT ownership. Positions are computed in the browser.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, MOCK, getText, cached, log } = require('../util');
const mx = MOCK ? require('../mockx') : null;

const OWNER = { US: 'US', PRC: 'CN', CIS: 'RU', JPN: 'JP', FR: 'FR', UK: 'GB', IND: 'IN', GER: 'DE', IT: 'IT', SPN: 'ES', CA: 'CA', BRAZ: 'BR', ARGN: 'AR', AUS: 'AU', ISRA: 'IL', SKOR: 'KR', NKOR: 'KP', IRAN: 'IR', TURK: 'TR', UAE: 'AE', SAUD: 'SA', INDO: 'ID', TWN: 'TW', MEX: 'MX', CHLE: 'CL', EGYP: 'EG', KAZ: 'KZ', UKR: 'UA', SWED: 'SE', NOR: 'NO', FIN: 'FI', DEN: 'DK', NETH: 'NL', BEL: 'BE', LUXE: 'LU', SWTZ: 'CH', AUT: 'AT', POL: 'PL', CZE: 'CZ', LTU: 'LT', NZ: 'NZ', PAKI: 'PK', BGD: 'BD', THAI: 'TH', VTNM: 'VN', MALA: 'MY', PHIL: 'PH', NIG: 'NG', KEN: 'KE', GHA: 'GH', SAFR: 'ZA', ALG: 'DZ', MOR: 'MA', TUN: 'TN', QAT: 'QA', AZER: 'AZ', BELA: 'BY', GREC: 'GR', POR: 'PT', IRL: 'IE', SING: 'SG', PER: 'PE', COL: 'CO', ECU: 'EC', BOL: 'BO', VENZ: 'VE', URY: 'UY', ETH: 'ET', RWA: 'RW', UGA: 'UG', JOR: 'JO', IRAQ: 'IQ', KUW: 'KW', BHR: 'BH', SRL: 'LK', NPL: 'NP', MNG: 'MN', HUN: 'HU', ROM: 'RO', BUL: 'BG', SVN: 'SI', SVK: 'SK', EST: 'EE', LAT: 'LV', TMMC: 'TM', BTN: 'BT', ANG: 'AO', SDN: 'SD', ZWE: 'ZW', DJI: 'DJ', GUAT: 'GT', CRI: 'CR', PRY: 'PY', MDA: 'MD', BOSH: 'BA', MUS: 'MU', SEN: 'SN' };
const TYPE = { PAY: 'Payload', 'R/B': 'Rocket body', DEB: 'Debris', UNK: 'Unknown' };

function parseTLE(txt) {
  const lines = txt.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean); const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i++) {
    if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) { out.push({ n: lines[i].trim(), id: +lines[i + 1].slice(2, 7), l1: lines[i + 1], l2: lines[i + 2] }); i += 2; }
  }
  return out;
}
const GROUPS = ['stations', 'gnss', 'geo', 'weather', 'resource', 'science', 'military', 'radar', 'sarsat', 'engineering', 'education', 'amateur', 'cubesat', 'planet', 'spire', 'iridium-NEXT', 'oneweb', 'starlink', 'other-comm', 'other'];
async function fromGroups() {
  const dir = path.join(DATA_DIR, 'tle-groups'); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const seen = new Set(); let out = '', got = 0;
  for (const g of GROUPS) {
    const f = path.join(dir, g + '.txt'); let t = null;
    try { if (Date.now() - fs.statSync(f).mtimeMs < 12 * 3600e3) t = fs.readFileSync(f, 'utf8'); } catch (e) {}
    if (!t) { try { t = await getText('CelesTrak', `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`, { sample: 'celestrak-group', timeout: 40000 }); fs.writeFileSync(f, t); } catch (e) { try { t = fs.readFileSync(f, 'utf8'); } catch (e2) { continue; } } }
    for (const sat of parseTLE(t)) { if (seen.has(sat.id)) continue; seen.add(sat.id); out += `${sat.n}\n${sat.l1}\n${sat.l2}\n`; } got++;
  }
  if (out) log(`CelesTrak: built ${seen.size} satellites from ${got} groups (the full list was refused)`);
  return out || null;
}
async function active() {
  return cached('space:active', 12 * 3600e3, async () => {
    if (MOCK) return mx.tles();
    // CelesTrak allows one download of this group per ~2 h and answers 403 otherwise, so keep the last copy on disk
    const F = path.join(DATA_DIR, 'tle-active.txt'); let txt = null, age = Infinity;
    try { age = Date.now() - fs.statSync(F).mtimeMs; if (age < 6 * 3600e3) txt = fs.readFileSync(F, 'utf8'); } catch (e) {}
    if (!txt) {
      try { txt = await getText('CelesTrak', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', { sample: 'celestrak-active', timeout: 60000 }); fs.writeFileSync(F, txt); }
      catch (e) {
        if (/403/.test(e.message)) try { txt = (await getText('CelesTrak', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=3le', { sample: 'celestrak-3le', timeout: 60000 })).replace(/^0 /gm, ''); fs.writeFileSync(F, txt); } catch (e2) {}
        if (!txt && age < Infinity) txt = fs.readFileSync(F, 'utf8');
        // no copy at all: build the catalogue from CelesTrak's smaller groups, which have their own download allowance
        if (!txt) txt = await fromGroups();
        if (!txt) throw new Error(/403/.test(e.message) ? 'CelesTrak limits downloads to one every two hours; satellites will appear after the next window.' : e.message); }
    }
    const sats = parseTLE(txt); if (!sats.length) throw new Error('CelesTrak returned no satellites.');
    return { sats };
  }, { persist: false });
}
const SATCAT_FILE = path.join(DATA_DIR, 'satcat.json');
async function satcat(ids) {
  try { const j = JSON.parse(fs.readFileSync(SATCAT_FILE, 'utf8')); if (Date.now() - j.t < 7 * 864e5) return j.rows; } catch (e) {}
  if (MOCK) return mx.satcat(ids);
  const txt = await getText('CelesTrak SATCAT', 'https://celestrak.org/pub/satcat.csv', { sample: 'satcat', timeout: 90000 });
  const lines = txt.split(/\r?\n/); const h = lines[0].split(','); const ix = n => h.indexOf(n);
  const want = new Set(ids); const rows = {};
  for (const l of lines.slice(1)) {
    const c = l.split(','); const id = +c[ix('NORAD_CAT_ID')]; if (!want.has(id)) continue;
    rows[id] = [c[ix('OWNER')], c[ix('OBJECT_TYPE')], c[ix('LAUNCH_DATE')], c[ix('OBJECT_ID')], +c[ix('PERIOD')] || null, +c[ix('APOGEE')] || null, +c[ix('PERIGEE')] || null];
  }
  fs.writeFileSync(SATCAT_FILE, JSON.stringify({ t: Date.now(), rows }));
  log('SATCAT cached:', Object.keys(rows).length, 'active objects');
  return rows;
}
async function forCountry(a2) {
  const a = await active();
  const cat = await satcat(a.sats.map(s => s.id)).catch(() => ({}));
  const tag = s => { const r = cat[s.id]; return { ...s, own: r ? (OWNER[r[0]] || r[0]) : null, type: r ? TYPE[r[1]] || r[1] : null, launch: r?.[2] || null, cospar: r?.[3] || null, period: r?.[4] || null, apogee: r?.[5] || null, perigee: r?.[6] || null }; };
  const stations = a.sats.filter(s => /ISS \(ZARYA\)|CSS \(TIANHE\)|TIANGONG|HUBBLE/i.test(s.n)).map(tag);
  const owned = a2 ? a.sats.map(tag).filter(s => s.own === a2) : [];
  const owners = {}; for (const s of a.sats) { const r = cat[s.id]; const o = r ? (OWNER[r[0]] || r[0]) : '?'; owners[o] = (owners[o] || 0) + 1; }
  const top = Object.entries(owners).sort((x, y) => y[1] - x[1]).slice(0, 12);
  const groups = {}; for (const s of owned) { const g = /STARLINK/.test(s.n) ? 'Starlink' : /ONEWEB/.test(s.n) ? 'OneWeb' : /GPS|NAVSTAR|GLONASS|BEIDOU|GALILEO|QZS|IRNSS|NAVIC/.test(s.n) ? 'Navigation' : /COSMOS|USA |YAOGAN|NROL|SBIRS|WGS|MUOS|SKYNET|HELIOS|CSO|OFEQ|IGS|RISAT/.test(s.n) ? 'Military/government' : (s.apogee && s.apogee > 30000) ? 'Geostationary' : 'Other'; s.group = g; groups[g] = (groups[g] || 0) + 1; }
  return { total: a.sats.length, owned, stations, groups, topOwners: top, at: a._cache?.at };
}
module.exports = { forCountry };
