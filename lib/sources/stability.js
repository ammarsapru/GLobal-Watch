'use strict';
// Stability signals: internet outages (IODA, Georgia Tech) and government travel advisories (US State Dept, UK FCDO).
const { MOCK, getJSON, cached, country, REF, NAMES } = require('../util');
const mx = MOCK ? require('../mockx') : null;
const IODA = 'https://api.ioda.inetintel.cc.gatech.edu/v2';
const now = () => Math.floor(Date.now() / 1000);

async function outageSummary() {
  return cached('ioda:summary', 20 * 60e3, async () => {
    if (MOCK) return mx.outageSummary();
    const j = await getJSON('IODA', `${IODA}/outages/summary?from=${now() - 86400}&until=${now()}&entityType=country&limit=300`, { sample: 'ioda-summary' });
    const rows = (j.data || []).map(r => ({ cc: (r.entity?.code || '').toUpperCase(), name: r.entity?.name, score: r.scores?.overall ?? Object.values(r.scores || {}).reduce((a, b) => a + (+b || 0), 0), events: r.event_cnt ?? null })).filter(r => r.cc);
    return { rows };
  });
}
async function outages(iso) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  return cached('ioda:' + iso, 15 * 60e3, async () => {
    if (MOCK) return mx.outages(c);
    const [al, sig] = await Promise.all([
      getJSON('IODA', `${IODA}/outages/alerts?from=${now() - 7 * 86400}&until=${now()}&entityType=country&entityCode=${c.a2}&limit=100`, { sample: 'ioda-alerts' }).catch(() => ({ data: [] })),
      getJSON('IODA', `${IODA}/signals/raw/country/${c.a2}?from=${now() - 2 * 86400}&until=${now()}`, { sample: 'ioda-signals' }).catch(() => ({ data: [] }))
    ]);
    const alerts = (al.data || []).map(a => ({ time: a.time ? new Date(a.time * 1000).toISOString() : null, source: a.datasource, level: a.level, condition: a.condition, value: a.value, expected: a.historyValue })).filter(a => a.level && a.level !== 'normal').slice(0, 40);
    // signals: flatten [[{datasource, from, step, values}]] into normalised 0–1 series per source
    const series = [];
    for (const grp of sig.data || []) for (const s of (Array.isArray(grp) ? grp : [grp])) {
      if (!s || !Array.isArray(s.values) || !s.values.length) continue;
      const vals = s.values.map(v => (v == null ? null : +v)); const mx2 = Math.max(...vals.filter(v => v != null)) || 1;
      series.push({ source: s.datasource, from: s.from, step: s.step, values: vals.map(v => v == null ? null : +(v / mx2).toFixed(3)) });
    }
    const PREF = ['bgp', 'ping-slash24', 'merit-nt', 'gtr'];
    return { alerts, series: PREF.map(k => series.find(x => x.source === k)).filter(Boolean) };
  });
}

// US State Department advisories: one call covers every country
async function usAdvisories() {
  return cached('adv:us', 6 * 3600e3, async () => {
    if (MOCK) return mx.usAdvisories();
    const j = await getJSON('US State Dept', 'https://cadataapi.state.gov/api/TravelAdvisories', { sample: 'us-advisories' });
    const arr = Array.isArray(j) ? j : (j.data || j.value || []);
    const byIso = {};
    const fipsTo = {}; for (const [a3, r] of Object.entries(REF)) if (r.fips) fipsTo[r.fips] = a3;
    const nameTo = {}; for (const [a3, n] of Object.entries(NAMES)) nameTo[n.n.toLowerCase()] = a3;
    for (const a of arr) {
      const title = a.Title || a.title || ''; const lvl = +((title.match(/Level\s*(\d)/i) || [])[1]) || null;
      const cats = [].concat(a.Category || a.category || []);
      let iso = cats.map(x => fipsTo[String(x).toUpperCase()]).find(Boolean);
      if (!iso) { const nm = title.split(/\s+[-–]\s+/)[0].trim().toLowerCase(); iso = nameTo[nm] || Object.entries(nameTo).find(([k]) => nm.startsWith(k))?.[1]; }
      if (!iso) continue;
      byIso[iso] = { level: lvl, title, link: a.Link || a.link, updated: a.Updated || a.Published || null, summary: String(a.Summary || a.summary || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 900) };
    }
    return { byIso };
  });
}
const UK_SLUG = { USA: 'usa', GBR: null, KOR: 'south-korea', PRK: 'north-korea', CIV: 'cote-d-ivoire', CZE: 'czech-republic', COD: 'democratic-republic-of-the-congo', COG: 'congo', MKD: 'north-macedonia', PSE: 'the-occupied-palestinian-territories', TLS: 'timor-leste', VAT: null, LAO: 'laos', MMR: 'myanmar', SWZ: 'eswatini', CPV: 'cape-verde', FSM: 'micronesia', TUR: 'turkey', RUS: 'russia', SYR: 'syria', IRN: 'iran', BOL: 'bolivia', VEN: 'venezuela', TZA: 'tanzania', VNM: 'vietnam', MDA: 'moldova', TWN: 'taiwan' };
async function ukAdvisory(iso) {
  const c = country(iso); if (!c) return null;
  const slug = iso in UK_SLUG ? UK_SLUG[iso] : c.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return null;
  return cached('adv:uk:' + iso, 12 * 3600e3, async () => {
    if (MOCK) return mx.ukAdvisory(c);
    const j = await getJSON('UK FCDO', 'https://www.gov.uk/api/content/foreign-travel-advice/' + slug, { sample: 'uk-advice' });
    const ent = t => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, '–');
    const parts = (j.details?.parts || []).map(p => ({ title: p.title, text: ent(String(p.body || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 700) }));
    return { title: j.title, updated: j.public_updated_at || j.updated_at, alert: [].concat(j.details?.alert_status || []).map(a => ({ avoid_all_travel_to_whole_country: 'Advises against all travel', avoid_all_travel_to_parts: 'Advises against all travel to parts', avoid_all_but_essential_travel_to_whole_country: 'Advises against all but essential travel', avoid_all_but_essential_travel_to_parts: 'Advises against all but essential travel to parts' }[a] || String(a).replace(/_/g, ' '))), summary: (j.description || '').trim(), parts: parts.slice(0, 4), link: 'https://www.gov.uk/foreign-travel-advice/' + slug };
  }).catch(() => null);
}
async function advisory(iso) {
  const [us, uk] = await Promise.all([usAdvisories().catch(e => ({ error: e.message, byIso: {} })), ukAdvisory(iso)]);
  return { us: us.byIso?.[iso] || null, usError: us.error || null, uk };
}
module.exports = { outageSummary, outages, usAdvisories, advisory };
