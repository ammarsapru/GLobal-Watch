'use strict';
// "Ask anything": route a question to countries + panels, build a compact context with numbered sources, answer with citations.
const { NAMES, country } = require('./util');
const { chat } = require('./ai');
const gdelt = require('./sources/gdelt');
const hazards = require('./sources/hazards');
const stab = require('./sources/stability');
const gov = require('./sources/gov');
const econ = require('./sources/econ');
const place = require('./sources/place');
const space = require('./sources/space');
const track = require('./sources/tracking');
const store = require('./store');

const PANEL_WORDS = {
  news: /\b(news|headline|happening|latest|stor(y|ies)|reports?\b|going on|updates?\b|developments?|today)/i,
  finance: /\b(econom|gdp|inflation|unemploy|debt|growth|recession|stocks?\b|markets?\b|index|indices|shares?\b|nikkei|s&p|dow\b|ftse|dax\b|invest|interest rate|imf\b|world bank)/i,
  fx: /\b(currenc|exchange rate|forex|fx\b|dollar|euro\b|yen\b|yuan|rupee|pound|ruble|rouble|peso|won\b)/i,
  trade: /\b(trade|trading partner|exports?|imports?|partners?\b|tariffs?|supply chain)/i,
  travel: /\b(travel|trip|visit|flights? to|hotels?|touris|visas?\b|vacation|holiday|things to do)/i,
  weather: /\b(weather|temperature|rain|snow|forecast|humid|climate|best time)/i,
  tracking: /\b(aircraft|planes?\b|jets?\b|air ?force|military flights?|flights? over|ships?\b|vessels?|navy|naval|tankers?|fleet|awacs|squawk|airspace)/i,
  hazards: /\b(earthquake|quake|tsunami|wildfire|fires?\b|flood|volcan|erupt|cyclone|typhoon|hurricane|drought|disaster|natural hazard|storms?\b)/i,
  unrest: /\b(protest|riot|unrest|clash|coup|conflict|wars?\b|fighting|attack|airstrike|shelling|insurg|violen)/i,
  stability: /\b(safe|danger|advisor|internet|outage|shutdown|blackout|risk|stabl)/i,
  gov: /\b(president|prime minister|leader|government|parliament|election|part(y|ies)\b|king\b|queen\b|ruler|cabinet|nato\b|alliance|member of)/i,
  defence: /\b(military spending|defen[cs]e budget|armed forces|troops|soldiers|army size|military strength)/i,
  space: /\b(satellite|space\b|orbit|iss\b|starlink|constellation|rocket launch)/i,
  alerts: /\b(alerts?\b|anything unusual|unusual|anomal|warnings?\b|what changed|changed)/i
};
const ALIAS = { usa: 'USA', america: 'USA', american: 'USA', russian: 'RUS', chinese: 'CHN', japanese: 'JPN', british: 'GBR', french: 'FRA', german: 'DEU', indian: 'IND', iranian: 'IRN', israeli: 'ISR', ukrainian: 'UKR', 'south korean': 'KOR', korean: 'KOR', 'north korean': 'PRK', turkish: 'TUR', saudi: 'SAU', brazilian: 'BRA', mexican: 'MEX', canadian: 'CAN', australian: 'AUS', italian: 'ITA', spanish: 'ESP', taiwanese: 'TWN', pakistani: 'PAK', egyptian: 'EGY', polish: 'POL', syrian: 'SYR', venezuelan: 'VEN', nigerian: 'NGA', indonesian: 'IDN', vietnamese: 'VNM', filipino: 'PHL', dutch: 'NLD', swedish: 'SWE', norwegian: 'NOR', finnish: 'FIN', greek: 'GRC', iraqi: 'IRQ', afghan: 'AFG', cuban: 'CUB', argentine: 'ARG', argentinian: 'ARG', chilean: 'CHL', colombian: 'COL', ethiopian: 'ETH', kenyan: 'KEN', 'south african': 'ZAF', 'united states': 'USA', uk: 'GBR', britain: 'GBR', england: 'GBR', 'great britain': 'GBR', russia: 'RUS', china: 'CHN', korea: 'KOR', 'south korea': 'KOR', 'north korea': 'PRK', iran: 'IRN', syria: 'SYR', taiwan: 'TWN', uae: 'ARE', emirates: 'ARE', holland: 'NLD', 'czech republic': 'CZE', vietnam: 'VNM', laos: 'LAO', 'ivory coast': 'CIV', burma: 'MMR', congo: 'COD', palestine: 'PSE', gaza: 'PSE', vatican: 'VAT' };
const NAME_LIST = Object.entries(NAMES).map(([iso, v]) => [v.n.toLowerCase(), iso]).concat(Object.entries(ALIAS)).sort((a, b) => b[0].length - a[0].length);
function findCountries(q) {
  const s = ' ' + q.toLowerCase().replace(/[^a-z.\s'-]/g, ' ') + ' '; const out = [];
  if (/\bU\.?S\.?A?\b/.test(q)) out.push('USA');
  for (const [name, iso] of NAME_LIST) { if (name.length < 3 && name !== 'uk') continue; const re = new RegExp(`[\\s]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s)?[\\s]`); if (re.test(s) && !out.includes(iso)) out.push(iso); if (out.length >= 3) break; }
  return out;
}
function route(question, current) {
  const panels = Object.entries(PANEL_WORDS).filter(([, re]) => re.test(question)).map(([k]) => k);
  const isos = findCountries(question);
  const worldQ = /\b(world|global|worldwide|everywhere|internationally)\b/i.test(question);
  if (!isos.length && current && !worldQ) isos.push(current);
  if (!panels.length) panels.push('news', 'alerts', 'gov', 'stability');
  if (panels.includes('unrest') && !panels.includes('news')) panels.push('news');
  return { panels: [...new Set(panels)], isos: isos.slice(0, 2) };
}
const ago = d => { const t = Date.parse(d); if (!t) return ''; const h = (Date.now() - t) / 36e5; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm ago' : h < 48 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago'; };
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);
const last = arr => (arr && arr.length ? arr[arr.length - 1] : null);

async function build(iso, panel, src, client) {
  const c = country(iso); const L = []; const cite = (title, url) => { src.push({ title, url }); return `[${src.length}]`; };
  if (panel === 'news' || panel === 'unrest') {
    const r = panel === 'news' ? await gdelt.articles(iso, {}) : await gdelt.unrest(iso);
    for (const a of (r.items || []).slice(0, panel === 'news' ? 10 : 6)) L.push(`- ${a.title} (${a.source}, ${ago(a.date)}) ${cite(a.title, a.link)}`);
    if (panel === 'unrest' && r.volume?.length) { const v = r.volume.map(x => x.v); const recent = v.slice(-3).reduce((a, b) => a + b, 0) / 3, before = v.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, v.length - 3); L.unshift(`Unrest coverage trend: last 3 days avg ${recent.toFixed(0)} articles/day vs ${before.toFixed(0)} before.`); }
  }
  if (panel === 'finance') {
    const [wb, im] = await Promise.all([econ.worldBank(iso).catch(() => null), econ.imf(iso).catch(() => null)]);
    for (const [id, label] of Object.entries(econ.WB)) { const p = last(wb?.series?.[id]); if (p && !/^MS\./.test(id)) L.push(`- ${label}: ${(+p[1]).toLocaleString('en-US', { maximumFractionDigits: 1 })} (${p[0]})`); }
    if (wb) L.push(`  source ${cite('World Bank indicators: ' + c.name, 'https://data.worldbank.org/country/' + c.a2)}`);
    const y = new Date().getFullYear();
    for (const [id, label] of Object.entries(econ.IMF)) { const s = im?.series?.[id] || []; const a = s.find(x => x[0] === y), b = s.find(x => x[0] === y + 1); if (a || b) L.push(`- IMF ${label}: ${a ? y + ' ' + a[1] : ''}${b ? ', ' + (y + 1) + ' forecast ' + b[1] : ''}`); }
    if (im) L.push(`  source ${cite('IMF World Economic Outlook: ' + c.name, 'https://www.imf.org/external/datamapper/profile/' + iso)}`);
    if (client?.quote) L.push(`- On screen: ${client.quote}`);
  }
  if (panel === 'fx') { const f = await econ.fx((c.cur || '').split(',')[0]); L.push(`- ${f.code}: ${f.perUSD} per US dollar; 30-day change ${f.change30?.toFixed(1) ?? '?'}%, 1-year ${f.change365?.toFixed(1) ?? '?'}% ${cite('Exchange rates', 'https://www.exchangerate-api.com')}`); }
  if (panel === 'trade') { const t = await econ.trade(iso); L.push(`- ${t.year} exports $${(t.exports.total / 1e9).toFixed(1)}B to: ${t.exports.partners.slice(0, 5).map(p => p.name).join(', ')}; imports $${(t.imports.total / 1e9).toFixed(1)}B from: ${t.imports.partners.slice(0, 5).map(p => p.name).join(', ')}. Top exports: ${t.products.slice(0, 4).map(p => p.name).join(', ')} ${cite('UN Comtrade ' + t.year, 'https://comtradeplus.un.org')}`); }
  if (panel === 'weather' || panel === 'travel') {
    const w = await place.weather(iso).catch(() => null);
    if (w?.current) L.push(`- Weather in ${w.place.name} now: ${w.current.temperature_2m}°C, wind ${w.current.wind_speed_10m} km/h. Next days max/min: ${(w.daily?.temperature_2m_max || []).slice(0, 3).map((x, i) => x + '/' + w.daily.temperature_2m_min[i]).join(', ')}°C ${cite('Open-Meteo forecast', 'https://open-meteo.com')}`);
    const cl = await place.climate(iso).catch(() => null);
    if (cl) L.push(`- Best months to visit (climate ${cl.years}): ${cl.best.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ')}`);
    if (panel === 'travel' && client?.passport) { const v = place.visa(client.passport, c.a2); if (v.req) L.push(`- Visa for a ${client.passport} passport: ${v.req}${v.days ? ' (' + v.days + ' days)' : ''}`); }
  }
  if (panel === 'stability' || panel === 'travel') {
    const a = await stab.advisory(iso);
    if (a.us) L.push(`- US travel advisory: ${a.us.title}. ${a.us.summary.slice(0, 260)} ${cite(a.us.title, a.us.link)}`);
    if (a.uk) L.push(`- UK FCDO: ${(a.uk.alert || []).join(', ') || 'no special alert'} — ${a.uk.summary.slice(0, 200)} ${cite('UK travel advice: ' + c.name, a.uk.link)}`);
    if (panel === 'stability') { const o = await stab.outages(iso).catch(() => null); if (o) L.push(`- Internet outage alerts in the last 7 days: ${o.alerts.length}${o.alerts[0] ? ' (latest ' + ago(o.alerts[0].time) + ', ' + o.alerts[0].level + ')' : ''} ${cite('IODA internet outages', 'https://ioda.inetintel.cc.gatech.edu/country/' + c.a2)}`); }
  }
  if (panel === 'gov' || panel === 'defence') {
    const g = await gov.government(iso);
    for (const p of g.people) L.push(`- ${p.role}: ${p.name}${p.party ? ' (' + p.party + ')' : ''}${p.since ? ', since ' + p.since : ''}`);
    if (g.system.length) L.push(`- System: ${g.system.join(', ')}`);
    const up = g.elections.filter(e => e.upcoming), past = g.elections.filter(e => !e.upcoming).slice(-2);
    if (past.length) L.push(`- Recent elections: ${past.map(e => e.name + ' ' + e.date).join('; ')}`);
    if (up.length) L.push(`- Upcoming: ${up.map(e => e.name + ' ' + e.date).join('; ')}`);
    if (g.members.length) L.push(`- Member of: ${g.members.slice(0, 14).join(', ')}`);
    L.push(`  source ${cite('Wikidata: ' + c.name, g.wikidata || 'https://www.wikidata.org')}`);
  }
  if (panel === 'defence') { const wb = await econ.worldBank(iso).catch(() => null); const s = last(wb?.series?.['MS.MIL.XPND.GD.ZS']), d = last(wb?.series?.['MS.MIL.XPND.CD']), p = last(wb?.series?.['MS.MIL.TOTL.P1']); L.push(`- Military spending: ${s ? s[1].toFixed(1) + '% of GDP' : '?'}${d ? ', $' + (d[1] / 1e9).toFixed(1) + 'B (' + d[0] + ')' : ''}; armed forces ${p ? Math.round(p[1]).toLocaleString('en-US') + ' (' + p[0] + ')' : '?'} ${cite('World Bank (SIPRI) military data', 'https://data.worldbank.org/indicator/MS.MIL.XPND.GD.ZS')}`); }
  if (panel === 'tracking') {
    const a = await track.aircraftFor(c.a2, {});
    const mil = a.list.filter(x => x.mil); const orb = a.list.filter(x => x.orbit);
    L.push(`- Live: ${a.list.filter(x => !x.gnd).length} ${c.name}-registered aircraft airborne, ${mil.length} military${mil.length ? ' (types: ' + [...new Set(mil.map(x => x.t).filter(Boolean))].slice(0, 6).join(', ') + ')' : ''}; ${orb.length} circling/holding ${cite('OpenSky Network + adsb.lol live ADS-B', 'https://opensky-network.org')}`);
    if (client?.ships) L.push(`- Ships on screen: ${client.ships}`);
    const em = track.emergencies().filter(e => e.cc === c.a2); if (em.length) L.push(`- Emergency squawks: ${em.map(e => e.cs + ' ' + e.kind).join(', ')}`);
  }
  if (panel === 'hazards') {
    const h = await hazards.all();
    const name = c.name.toLowerCase();
    const q = h.quakes.filter(x => (x.place || '').toLowerCase().includes(name) || (client?.bbox && inBox(client.bbox, x.lon, x.lat))).slice(0, 5);
    for (const x of q) L.push(`- M${x.mag} earthquake ${x.place}, ${ago(x.time)} ${cite(x.title, x.url)}`);
    for (const x of h.alerts.filter(a => a.iso3 === iso || (a.country || '').toLowerCase().includes(name)).slice(0, 5)) L.push(`- GDACS ${x.level} alert: ${x.type} — ${x.title} ${cite(x.title, x.url)}`);
    for (const x of h.events.filter(e => client?.bbox && inBox(client.bbox, e.lon, e.lat)).slice(0, 5)) L.push(`- ${x.cat}: ${x.title} ${cite(x.title, x.url)}`);
    if (!L.length) L.push('- No active hazards recorded for this country in USGS/GDACS/EONET right now.');
  }
  if (panel === 'space') { const s = await space.forCountry(c.a2); L.push(`- ${c.name} operates ${s.owned.length} active satellites (${Object.entries(s.groups).map(([g, n]) => g + ' ' + n).join(', ')}) out of ${s.total} tracked ${cite('CelesTrak', 'https://celestrak.org')}`); }
  if (panel === 'alerts') { const al = store.query('alerts', a => a.iso === iso || !a.iso, Date.now() - 48 * 3600e3).slice(-8); for (const a of al) L.push(`- ALERT (${a.sev}) ${a.title} ${ago(new Date(a.t).toISOString())}`); if (!al.length) L.push('- No automated alerts for this country in the last 48 hours.'); }
  return L.length ? `${c.name.toUpperCase()} — ${panel.toUpperCase()}\n${L.join('\n')}` : '';
}
const inBox = (b, lon, lat) => { const [w, s, e, n] = b; if (lat < s || lat > n) return false; return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e; };

async function ask({ question, iso, client = {}, panels: forced }) {
  if (!question || !question.trim()) throw new Error('Ask a question first.');
  const r = route(question, iso);
  if (forced?.length) r.panels = forced;
  if (!r.isos.length) r.isos.push(null);
  const src = []; const blocks = [];
  for (const i of r.isos) {
    if (!i) continue;
    for (const p of r.panels) {
      try { const b = await within(build(i, p, src, client), 20000); if (b) blocks.push(b); } catch (e) { blocks.push(`${(country(i)?.name || i).toUpperCase()} — ${p.toUpperCase()}: data unavailable (${e.message}).`); }
    }
  }
  if (!r.isos[0]) { // world question
    const w = await gdelt.world({}).catch(() => ({ items: [] }));
    blocks.push('WORLD HEADLINES\n' + w.items.slice(0, 12).map(a => { src.push({ title: a.title, url: a.link }); return `- ${a.title} (${a.source}) [${src.length}]`; }).join('\n'));
    const h = await hazards.all().catch(() => null);
    if (h) blocks.push('WORLD HAZARDS\n' + h.quakes.filter(q => q.mag >= 5.5).slice(0, 5).map(q => `- M${q.mag} ${q.place}`).join('\n') + '\n' + h.alerts.filter(a => a.level !== 'Green').slice(0, 5).map(a => `- ${a.level} ${a.type}: ${a.title}`).join('\n'));
  }
  if (client.screen) blocks.push('ON SCREEN NOW\n' + String(client.screen).slice(0, 600));
  let ctx = blocks.join('\n\n'); if (ctx.length > 7000) ctx = ctx.slice(0, 7000) + '\n…';
  const now = new Date().toUTCString();
  const sys = `You are Global Watch, a calm, precise intelligence analyst speaking aloud to the user. Today is ${now}. Answer ONLY from the DATA below; if the data does not cover the question, say what is missing in one sentence. Keep it short for speech: at most 4 sentences and about 90 words unless the user asks for detail. Put citation numbers like [3] right after the facts they support. No markdown, no lists, no emojis.`;
  const answer = await chat(sys, `DATA\n${ctx}\n\nQUESTION: ${question}`, { max: 400, temp: 0.2 });
  const used = [...new Set((answer.match(/\[(\d+)\]/g) || []).map(x => +x.slice(1, -1)))].filter(n => src[n - 1]);
  return { answer, sources: src.map((s, i) => ({ n: i + 1, ...s, used: used.includes(i + 1) })), panels: r.panels, countries: r.isos.filter(Boolean) };
}
module.exports = { ask, route, findCountries };
