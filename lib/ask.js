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

async function build(iso, panel, src, client, topic, bag = {}) {
  const c = country(iso); const L = []; const cite = (title, url) => { src.push({ title, url }); return `[${src.length}]`; };
  if (panel === 'news' || panel === 'unrest') {
    let r = panel === 'news' ? await gdelt.articles(iso, topic ? { q: topic } : {}) : await gdelt.unrest(iso);
    if (panel === 'news' && topic && !(r.items || []).length) { L.push(`- No coverage found in the last 3 days matching "${topic}"; showing general headlines instead.`); r = await gdelt.articles(iso, {}); }
    if (panel === 'news' && topic) L.unshift(`Search: "${topic}" in ${c.name} coverage, last 3 days (${(r.items || []).length} articles via ${r.provider || 'GDELT'}).`);
    const seenT = new Set();
    for (const a of (r.items || [])) { const k = a.title.toLowerCase().slice(0, 60); if (seenT.has(k)) continue; seenT.add(k); const tag = a.state ? 'state media' : a.domestic ? 'domestic' : a.domestic === false ? 'foreign' : ''; L.push(`- ${a.title} — ${a.source}${tag ? ' (' + tag + ')' : ''}, ${ago(a.date)} ${cite(a.title + ' — ' + a.source, a.link)}`); if (panel === 'news') (bag.news = bag.news || []).push({ title: a.title, source: a.source, tag, n: src.length }); if (seenT.size >= (panel === 'news' ? 14 : 6)) break; }
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

// ---------- conversational briefing ----------
// board panel that shows each kind of information
const PANEL_OF = { news: 'news', finance: 'fin', fx: 'fin', trade: 'trade', travel: 'travel', weather: 'weather', tracking: 'track', defence: 'track', hazards: 'events', unrest: 'events', stability: 'events', gov: 'gov', space: 'space', alerts: 'events' };
const FILLER = new Set(('hello hi hey hiya please thanks thank can could would will you me my mine find show tell give get got the a an of on in at for about to and or is are was were be been what whats what\'s latest newest recent any some there this that these those with from how why when where who which do does did i we our us let lets let\'s just also more info information update updates going happening news headline headlines story stories report reports today tonight now currently current right ok okay so like want need know look looking see brief briefing summary summarise summarize everything all overview country stats statistics data dashboard board pull up bring near around doing does going been has have its it\'s think thoughts situation status lately week weeks month months year years day days much many there\'s say says said real really fine well good bad').split(' '));
const DEMONYMS = new Set(Object.keys(ALIAS));
function topicOf(question) {
  const names = new Set(NAME_LIST.map(([n]) => n));
  let words = question.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  // drop country names (multi-word too) and demonyms
  const text = ' ' + words.join(' ') + ' ';
  let rest = text; for (const n of [...names].sort((a, b) => b.length - a.length)) if (n.length > 2) rest = rest.split(' ' + n + ' ').join(' '); 
  words = rest.split(/\s+/).filter(w => w && !FILLER.has(w) && !DEMONYMS.has(w) && !names.has(w) && w.length > 2 && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 4).join(' ');
}
const WANT_ALL = /\b(everything|full (brief|briefing|picture|rundown)|all (the )?(stats|data|panels|info)|whole (picture|board)|overview|brief me|rundown)\b/i;
// one line per panel that was NOT asked about, so the answer can mention the rest of the board briefly
async function snapshot(iso, skip, src) {
  const c = country(iso); const out = {}; const missing = [];
  const job = async (k, fn) => { try { const v = await within(fn(), 9000); if (v) out[k] = v; else missing.push(k); } catch (e) { missing.push(k); } };
  const y = new Date().getFullYear();
  await Promise.all([
    !skip.has('fin') && job('fin', async () => { const im = await econ.imf(iso); const g = (im.series.NGDP_RPCH || []).find(p => p[0] === y), i = (im.series.PCPIPCH || []).find(p => p[0] === y); return g || i ? `IMF ${y}: growth ${g ? g[1] + '%' : 'n/a'}, inflation ${i ? i[1] + '%' : 'n/a'}` : null; }),
    !skip.has('events') && job('events', async () => { const [h, a] = await Promise.all([hazards.all(), stab.advisory(iso)]); const nm = c.name.toLowerCase(); const hz = h.alerts.filter(x => x.iso3 === iso || (x.country || '').toLowerCase().includes(nm)).length + h.quakes.filter(x => (x.place || '').toLowerCase().includes(nm) && x.mag >= 5).length; return `${hz ? hz + ' active hazard alert(s)' : 'no major hazards'}; US advisory ${a.us ? 'level ' + a.us.level : 'not listed'}`; }),
    !skip.has('gov') && job('gov', async () => { const g = await gov.government(iso); const hog = g.people.find(p => /government/i.test(p.role)), hos = g.people.find(p => /state/i.test(p.role)); const up = g.elections.find(e => e.upcoming); return [hos && `head of state ${hos.name}`, hog && `head of government ${hog.name}`, up && `next election ${up.name} (${up.date})`].filter(Boolean).join('; ') || null; }),
    !skip.has('trade') && job('trade', async () => { const t = await econ.trade(iso); return `${t.year} exports $${(t.exports.total / 1e9).toFixed(0)}B, top partner ${t.exports.partners[0]?.name || 'n/a'}`; }),
    !skip.has('weather') && job('weather', async () => { const w = await place.weather(iso); return w?.current ? `${w.place.name} ${Math.round(w.current.temperature_2m)}°C now` : null; }),
    !skip.has('space') && job('space', async () => { const sp = await space.forCountry(c.a2); return `${sp.owned.length} active satellites operated`; })
  ].filter(Boolean));
  return { lines: out, missing };
}
function boardPlan(iso, asked, r) {
  const askedIds = [...new Set(r.panels.map(p => PANEL_OF[p]).filter(Boolean))];
  const focus = askedIds.includes('news') ? 'news' : askedIds[0] || 'news';
  const context = ['fin', 'events', 'gov', 'trade', 'weather', 'space'];
  const side = [...askedIds.filter(x => x !== focus), ...context.filter(x => !askedIds.includes(x) && x !== focus)].slice(0, 6);
  const tabs = {};
  if (r.panels.includes('fx')) tabs.fin = 'fx'; else if (/stock|market|share|index/i.test(r.question)) tabs.fin = 'mkt'; else tabs.fin = 'out';
  tabs.events = r.panels.includes('unrest') ? 'unrest' : r.panels.includes('stability') && /internet|outage|shutdown|blackout/i.test(r.question) ? 'net' : 'haz';
  tabs.gov = r.panels.includes('stability') && /safe|advis|danger|travel/i.test(r.question) ? 'adv' : 'gov';
  return { iso, focus, layout: { left: side.filter((_, i) => i % 2 === 0), center: [focus], right: side.filter((_, i) => i % 2 === 1) }, tabs, newsQuery: r.topic || '' };
}
function parseJSON(t) { try { return JSON.parse(t); } catch (e) {} const m = String(t).match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e) {} } return null; }
const strip = t => String(t || '').replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();

async function ask({ question, iso, client = {}, panels: forced, history = [] }) {
  if (!question || !question.trim()) throw new Error('Ask a question first.');
  const r = route(question, iso); r.question = question;
  if (forced?.length) r.panels = forced;
  r.topic = topicOf(question);
  const everything = WANT_ALL.test(question);
  if (everything) r.panels = [...new Set([...r.panels, 'news', 'finance', 'gov', 'hazards', 'stability', 'trade', 'weather', 'space'])];
  if (r.topic && !r.panels.includes('news')) r.panels.unshift('news');
  if (!r.isos.length) r.isos.push(null);
  const src = []; const asked = []; const missing = []; const newsItems = [];
  // gather every asked panel in parallel, then number sources in a stable order
  const jobs = []; for (const i of r.isos) if (i) for (const p of r.panels) jobs.push([i, p]);
  const results = await Promise.all(jobs.map(([i, p]) => { const local = []; const bag = {}; return within(build(i, p, local, client, p === 'news' ? r.topic : '', bag), 25000).then(b => ({ i, p, b, local, bag }), e => ({ i, p, e, local, bag })); }));
  for (const x of results) {
    if (x.e || !x.b) { missing.push(`${x.p} for ${country(x.i)?.name}${x.e ? ' (' + x.e.message + ')' : ''}`); continue; }
    const off = src.length; src.push(...x.local);
    if (x.bag.news) newsItems.push(...x.bag.news.map(n => ({ ...n, n: n.n + off })));
    asked.push(off ? x.b.replace(/\[(\d+)\]/g, (m, n) => `[${+n + off}]`) : x.b);
  }
  if (!r.isos[0]) {
    const w = await gdelt.world({}).catch(() => ({ items: [] }));
    asked.push('WORLD HEADLINES\n' + w.items.slice(0, 14).map(a => { src.push({ title: a.title + ' — ' + a.source, url: a.link }); return `- ${a.title} — ${a.source} [${src.length}]`; }).join('\n'));
    const h = await hazards.all().catch(() => null);
    if (h) asked.push('WORLD HAZARDS\n' + h.quakes.filter(q => q.mag >= 5.5).slice(0, 5).map(q => `- M${q.mag} ${q.place}`).join('\n') + '\n' + h.alerts.filter(a => a.level !== 'Green').slice(0, 5).map(a => `- ${a.level} ${a.type}: ${a.title}`).join('\n'));
  }
  const main = r.isos[0];
  const plan = main ? boardPlan(main, asked, r) : null;
  const askedIds = new Set(r.panels.map(p => PANEL_OF[p]));
  const snap = main ? await snapshot(main, everything ? new Set(['fin', 'events', 'gov', 'trade', 'weather', 'space']) : askedIds, src) : { lines: {}, missing: [] };
  let ctx = asked.join('\n\n'); if (ctx.length > 9000) ctx = ctx.slice(0, 9000) + '\n…';
  const snapTxt = Object.entries(snap.lines).map(([k, v]) => `- ${{ fin: 'Economy', events: 'Hazards & safety', gov: 'Government', trade: 'Trade', weather: 'Weather', space: 'Space' }[k]}: ${v}`).join('\n');
  const hist = (history || []).slice(-2).map(h => `User: ${String(h.q).slice(0, 200)}\nYou: ${String(h.a).slice(0, 400)}`).join('\n');
  const now = new Date().toUTCString();
  const sys = `You are Global Watch, a warm, sharp intelligence analyst talking with the user like a colleague. Today is ${now}.
Rules:
- Use ONLY the facts in ASKED DATA and BOARD SNAPSHOT. Never invent names, numbers, dates or events. Put citation numbers like [3] after facts from ASKED DATA.
- Answer what was asked in depth; mention unasked things only briefly.
- Say plainly when something asked for is not in the data.
Reply with a JSON object with exactly these keys:
"opening": one short, natural sentence acknowledging the request (e.g. "Sure, here's what I'm seeing on Israel's elections.").
"answer": 3-5 sentences answering the question directly from ASKED DATA, with citations.
"perspectives": a list of up to 4 objects {"source": outlet name, "says": one sentence on what that outlet reports or emphasises, with its citation}. Prefer outlets that differ (domestic vs foreign, state media).
"assessment": 1-2 sentences of your own reading of the situation, based only on the data (this is your analysis, not a fact).
"also": one sentence on anything notable in BOARD SNAPSHOT (unasked); empty string if nothing notable.
"missing": one sentence on what the user asked about that the data does not cover; empty string if nothing is missing.`;
  const user = `${hist ? 'EARLIER IN THIS CONVERSATION\n' + hist + '\n\n' : ''}ASKED DATA\n${ctx || '(nothing found)'}\n\nBOARD SNAPSHOT (not asked)\n${snapTxt || '(none)'}\n\nUNAVAILABLE: ${[...missing, ...snap.missing.map(k => k + ' snapshot')].join('; ') || 'none'}\n\nQUESTION: ${question}`;
  const raw = await chat(sys, user, { max: 900, temp: 0.3, json: true });
  let j = parseJSON(raw);
  if (!j || !j.answer) j = { opening: '', answer: raw, perspectives: [], assessment: '', also: '', missing: '' };
  j.perspectives = Array.isArray(j.perspectives) ? j.perspectives.filter(x => x && x.source && x.says).slice(0, 4) : [];
  // small models often skip these: build them from the real headlines so every answer shows who is saying what
  if (!j.perspectives.length && newsItems.length) {
    const byOutlet = new Map(); for (const it of newsItems) if (!byOutlet.has(it.source)) byOutlet.set(it.source, it);
    const pick = []; for (const want of ['domestic', 'foreign', 'state media', '']) for (const it of byOutlet.values()) if (pick.length < 4 && it.tag === want && !pick.includes(it)) pick.push(it);
    for (const it of byOutlet.values()) if (pick.length < 4 && !pick.includes(it)) pick.push(it);
    j.perspectives = pick.map(it => ({ source: it.source + (it.tag ? ` (${it.tag})` : ''), says: `“${it.title}” [${it.n}]`, auto: true }));
  }
  if (!/\[\d+\]/.test(j.answer) && newsItems.length) j.answer = j.answer.trim() + ' ' + newsItems.slice(0, 3).map(it => `[${it.n}]`).join('');
  const text = [j.opening, j.answer, ...j.perspectives.map(x => `${x.source}: ${x.says}`), j.assessment, j.also, j.missing].filter(Boolean).join(' ');
  const used = [...new Set((text.match(/\[(\d+)\]/g) || []).map(x => +x.slice(1, -1)))].filter(n => src[n - 1]);
  // what to say, and which panel to highlight while saying it
  const segs = [];
  if (j.opening) segs.push({ text: strip(j.opening), panel: plan?.focus });
  if (j.answer) segs.push({ text: strip(j.answer), panel: plan?.focus });
  if (j.perspectives.length) segs.push({ text: 'Here is how different outlets are covering it. ' + j.perspectives.map(x => x.auto ? `${strip(x.source).replace(/\s*\(.*\)$/, '')} leads with: ${strip(x.says).replace(/[“”]/g, '')}.` : `${strip(x.source)} ${/^(reports|says|notes|focuses|highlights|emphasi)/i.test(strip(x.says)) ? '' : 'says '}${strip(x.says)}`).join(' '), panel: 'news' });
  if (j.assessment) segs.push({ text: 'My read: ' + strip(j.assessment), panel: null });
  if (j.also) segs.push({ text: strip(j.also), panel: plan?.layout.left[0] || null });
  if (j.missing) segs.push({ text: strip(j.missing), panel: null });
  return { answer: text, parts: { opening: j.opening || '', answer: j.answer || '', perspectives: j.perspectives, assessment: j.assessment || '', also: j.also || '', missing: j.missing || '' }, speech: segs, sources: src.map((x, i) => ({ n: i + 1, ...x, used: used.includes(i + 1) })), panels: r.panels, countries: r.isos.filter(Boolean), topic: r.topic, plan, unavailable: [...missing, ...snap.missing] };
}
module.exports = { ask, route, findCountries, topicOf };
