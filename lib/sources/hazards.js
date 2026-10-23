'use strict';
// Natural hazards: USGS earthquakes, NASA EONET natural events, GDACS disaster alerts. All free, no keys.
const { MOCK, getJSON, getText, cached } = require('../util');
const mx = MOCK ? require('../mockx') : null;

const firstPoint = g => { let c = g?.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; return Array.isArray(c) && c.length >= 2 ? c : null; };

async function quakes() {
  const j = await getJSON('USGS', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', { sample: 'usgs' });
  return (j.features || []).map(f => ({ id: f.id, kind: 'quake', mag: f.properties?.mag, title: f.properties?.title || f.properties?.place, place: f.properties?.place, time: f.properties?.time ? new Date(f.properties.time).toISOString() : null, url: f.properties?.url, tsunami: !!f.properties?.tsunami, alert: f.properties?.alert || null, lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1], depth: f.geometry?.coordinates?.[2] }))
    .filter(q => q.lat != null && q.mag != null);
}
async function eonet() {
  const j = await getJSON('NASA EONET', 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=21', { sample: 'eonet' });
  return (j.events || []).map(e => { const g = (e.geometry || []).at(-1); const p = firstPoint(g); return p ? { id: e.id, kind: 'event', cat: e.categories?.[0]?.title || 'Event', catId: e.categories?.[0]?.id || '', title: e.title, time: g.date, lon: p[0], lat: p[1], mag: g.magnitudeValue ?? null, magUnit: g.magnitudeUnit || '', url: e.sources?.[0]?.url || e.link } : null; }).filter(Boolean);
}
// fallback when the JSON API refuses: the public RSS feed carries the same current events
async function gdacsRss() {
  const xml = await getText('GDACS RSS', 'https://www.gdacs.org/xml/rss.xml', { sample: 'gdacs-rss', timeout: 30000 });
  const T = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire' };
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1], tag = t => ((b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`)) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const lat = +tag('geo:lat'), lon = +tag('geo:long'); if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) continue;
    const type = tag('gdacs:eventtype'), id = type + tag('gdacs:eventid');
    out.push({ id, kind: 'alert', type: T[type] || type, title: tag('title'), level: tag('gdacs:alertlevel') || 'Green', country: tag('gdacs:country'), iso3: tag('gdacs:iso3').toUpperCase(), time: new Date(tag('gdacs:fromdate') || tag('pubDate')).toISOString(), severity: tag('gdacs:severity'), url: tag('link'), lat, lon });
  }
  return out;
}
async function gdacs() {
  try { const r = await gdacsApi(); if (r.length) return r; } catch (e) {}
  return gdacsRss();
}
async function gdacsApi() {
  // SEARCH endpoint (the MAP endpoint now insists on a single eventtype). Empty body = nothing found.
  const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const txt = await getText('GDACS', `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&fromDate=${d(21)}&toDate=${d(-1)}&pageSize=100&pageNumber=1`, { sample: 'gdacs' });
  if (!txt.trim()) return [];
  let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('GDACS sent something that isn\u2019t JSON'); }
  const recent = f => { const p = f.properties || {}; return p.iscurrent === true || p.iscurrent === 'true' || Date.now() - Date.parse(p.todate || p.fromdate) < 10 * 864e5; };
  j.features = (j.features || []).filter(recent);
  const seen = new Set();
  return (j.features || []).map(f => { const p = f.properties || {}; const pt = firstPoint(f.geometry); const id = p.eventtype + p.eventid; if (!pt || seen.has(id)) return null; seen.add(id);
    return { id, kind: 'alert', type: { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire' }[p.eventtype] || p.eventtype, title: p.name || p.description || p.htmldescription, level: p.alertlevel || 'Green', country: p.country || '', iso3: (p.iso3 || '').toUpperCase(), time: p.fromdate, to: p.todate, severity: p.severitydata?.severitytext || '', url: p.url?.report || p.url?.details || 'https://www.gdacs.org', lon: pt[0], lat: pt[1] }; })
    .filter(Boolean);
}
async function all(force) {
  return cached('hazards:all', 10 * 60e3, async () => {
    if (MOCK) return mx.hazards();
    const errors = [];
    const [q, e, g] = await Promise.all([quakes().catch(x => (errors.push('USGS: ' + x.message), [])), eonet().catch(x => (errors.push('EONET: ' + x.message), [])), gdacs().catch(x => (errors.push('GDACS: ' + x.message), []))]);
    if (!q.length && !e.length && !g.length && errors.length) throw new Error(errors.join(' '));
    return { quakes: q, events: e, alerts: g, errors };
  }, { force });
}
module.exports = { all };
