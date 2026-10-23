'use strict';
// Natural hazards: USGS earthquakes, NASA EONET natural events, GDACS disaster alerts. All free, no keys.
const { MOCK, getJSON, cached } = require('../util');
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
async function gdacs() {
  const j = await getJSON('GDACS', 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventlist=EQ;TC;FL;VO;DR;WF', { sample: 'gdacs' });
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
