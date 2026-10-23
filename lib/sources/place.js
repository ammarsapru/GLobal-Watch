'use strict';
// Weather (Open-Meteo forecast), best time to visit (10-year ERA5 climate), visa requirements (Passport Index dataset).
const fs = require('fs');
const path = require('path');
const { DATA_DIR, MOCK, getJSON, cached, country } = require('../util');
const mx = MOCK ? require('../mockx') : null;

async function geocode(city, cc) {
  return cached(`geo:${cc}:${city}`, 30 * 864e5, async () => {
    if (MOCK) return mx.geocode(city);
    const j = await getJSON('Open-Meteo geocoding', `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`, { sample: 'geocode' });
    const r = (j.results || []).find(x => !cc || x.country_code === cc) || (j.results || [])[0];
    if (!r) throw new Error('Could not find ' + city + ' on the map.');
    return { name: r.name, lat: r.latitude, lon: r.longitude, tz: r.timezone, elevation: r.elevation };
  });
}
// only accept a hit inside the given country that is a town/city or a region (used to place names from headlines)
async function geocodeStrict(name, cc) {
  return cached(`geos:${cc}:${name}`, 30 * 864e5, async () => {
    const j = await getJSON('Open-Meteo geocoding', `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json&countryCode=${cc}`, { sample: 'geocode' });
    const r = (j.results || []).find(x => x.country_code === cc && /^(PPL|ADM)/.test(x.feature_code || '') && (x.population || 0) >= 5000 || x.country_code === cc && /^ADM1/.test(x.feature_code || ''));
    return r ? { name: r.name, lat: r.latitude, lon: r.longitude } : { none: true };
  }).then(r => r.none ? null : r);
}
async function weather(iso, city) {
  const c = country(iso); const name = city || c?.cap || c?.name;
  const g = await geocode(name, c?.a2);
  const fc = await cached(`wx:${g.lat},${g.lon}`, 30 * 60e3, async () => {
    if (MOCK) return mx.weather();
    const j = await getJSON('Open-Meteo', `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset&timezone=auto&forecast_days=7`, { sample: 'weather' });
    return { current: j.current, daily: j.daily, tz: j.timezone };
  });
  return { place: g, ...fc };
}
async function climate(iso, city) {
  const c = country(iso); const name = city || c?.cap || c?.name;
  const g = await geocode(name, c?.a2);
  return cached(`climate:${g.lat.toFixed(1)},${g.lon.toFixed(1)}`, 60 * 864e5, async () => {
    if (MOCK) return mx.climate();
    const y = new Date().getFullYear() - 1;
    const j = await getJSON('Open-Meteo archive', `https://archive-api.open-meteo.com/v1/archive?latitude=${g.lat}&longitude=${g.lon}&start_date=${y - 9}-01-01&end_date=${y}-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=auto`, { sample: 'climate', timeout: 45000 });
    const t = j.daily?.time || [], tm = j.daily?.temperature_2m_mean || [], pr = j.daily?.precipitation_sum || [];
    const acc = Array.from({ length: 12 }, () => ({ t: 0, n: 0, p: 0, years: new Set(), wet: 0 }));
    t.forEach((d, i) => { const m = +d.slice(5, 7) - 1, yy = d.slice(0, 4); if (tm[i] != null) { acc[m].t += tm[i]; acc[m].n++; } if (pr[i] != null) { acc[m].p += pr[i]; if (pr[i] >= 1) acc[m].wet++; } acc[m].years.add(yy); });
    const months = acc.map((a, m) => { const yrs = a.years.size || 1; return { m, temp: a.n ? +(a.t / a.n).toFixed(1) : null, rain: +(a.p / yrs).toFixed(0), wetDays: Math.round(a.wet / yrs) }; });
    // comfort score: best around 22 °C, penalise wet days
    for (const mo of months) mo.score = mo.temp == null ? 0 : Math.max(0, 100 - Math.abs(mo.temp - 22) * 5 - mo.wetDays * 2.2);
    const best = months.slice().sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.m).sort((a, b) => a - b);
    return { months, best, years: `${y - 9}–${y}` };
  });
}
let VISA = null;
function visa(from, to) {
  if (!VISA) { VISA = {}; for (const l of fs.readFileSync(path.join(DATA_DIR, 'passport.csv'), 'utf8').split(/\r?\n/).slice(1)) { const [a, b, r] = l.split(','); if (a && b) (VISA[a] ||= {})[b] = r; } }
  const r = VISA[from]?.[to];
  if (r == null) return { req: null };
  if (/^\d+$/.test(r)) return { req: 'visa free', days: +r };
  if (r === '-1') return { req: 'own country' };
  return { req: r };
}
module.exports = { geocodeStrict, weather, climate, visa, geocode };
