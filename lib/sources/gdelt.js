'use strict';
// GDELT 2.0 DOC + GEO APIs: free, global, multilingual, refreshed every 15 minutes. No key, but one request per ~5 s.
const { MOCK, getJSON, cached, country } = require('../util');
const mx = MOCK ? require('../mockx') : null;

const DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GEO = 'https://api.gdeltproject.org/api/v2/geo/geo';
const TOPIC = {
  top: '', politics: '(election OR parliament OR minister OR government OR president)', economy: '(economy OR inflation OR markets OR trade OR "central bank")',
  security: '(military OR army OR navy OR missile OR attack OR defense OR troops)', business: '(company OR business OR investment OR earnings)',
  tech: '(technology OR startup OR semiconductor OR cyber OR software)', culture: '(culture OR film OR music OR festival OR sport)'
};
const UNREST = '(protest OR protesters OR riot OR clashes OR unrest OR airstrike OR shelling OR insurgents OR coup)';
// outlets that are state-owned or state-directed (flagged, not hidden)
const STATE_MEDIA = ['rt.com', 'sputniknews.com', 'sputnikglobe.com', 'tass.com', 'tass.ru', 'ria.ru', 'rg.ru', 'xinhuanet.com', 'news.cn', 'globaltimes.cn', 'chinadaily.com.cn', 'cgtn.com', 'people.com.cn', 'ecns.cn', 'presstv.ir', 'irna.ir', 'tasnimnews.com', 'farsnews.ir', 'kcna.kp', 'rodong.rep.kp', 'sana.sy', 'aa.com.tr', 'trtworld.com', 'telesurenglish.net', 'telesurtv.net', 'granma.cu', 'prensa-latina.cu', 'belta.by', 'vietnamplus.vn', 'kpl.gov.la', 'sabanews.net', 'wam.ae', 'spa.gov.sa', 'qna.org.qa', 'kuna.net.kw'];
const isState = d => STATE_MEDIA.some(s => d === s || d.endsWith('.' + s));
const nospace = s => s.toLowerCase().replace(/[^a-z]/g, '');
const parseSeen = s => { const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null; };

function buildQuery(c, { topic = 'top', lang = 'en', extra = '' } = {}) {
  const t = TOPIC[topic] || '';
  if (lang === 'local') return `sourcecountry:${nospace(c.name)} ${t || ''} ${extra}`.trim();
  return `"${c.name}" ${t} ${extra} sourcelang:english`.replace(/\s+/g, ' ').trim();
}
async function doc(query, mode, extra = {}) {
  const u = new URL(DOC);
  u.searchParams.set('query', query); u.searchParams.set('mode', mode); u.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return getJSON('GDELT', u.toString(), { sample: 'gdelt-' + mode, timeout: 30000 });
}
async function articles(iso, q = {}) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  const key = `gdelt:art:${iso}:${q.topic || 'top'}:${q.lang || 'en'}`;
  return cached(key, 15 * 60e3, async () => {
    if (MOCK) return mx.gdeltArticles(c, q);
    let j;
    try { j = await doc(buildQuery(c, q), 'ArtList', { maxrecords: '120', sort: 'DateDesc', timespan: q.timespan || '3d' }); }
    catch (e) { if (q.lang === 'local' && /short|keyword|query/i.test(e.message)) j = await doc(`"${c.name}" sourcecountry:${nospace(c.name)}`, 'ArtList', { maxrecords: '120', sort: 'DateDesc', timespan: '3d' }); else throw e; }
    const items = (j.articles || []).map(a => ({ title: (a.title || '').trim(), link: a.url, source: a.domain, date: parseSeen(a.seendate), thumb: a.socialimage || null, lang: a.language, srcCountry: a.sourcecountry || '', domestic: nospace(a.sourcecountry || '') === nospace(c.name), state: isState(a.domain || '') }))
      .filter(a => a.title && a.link);
    return { items, provider: 'GDELT' };
  }, { force: q.force === '1' });
}
async function toneVolume(iso, q = {}) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  return cached(`gdelt:tone:${iso}:${q.topic || 'top'}`, 2 * 3600e3, async () => {
    if (MOCK) return mx.gdeltTone(c);
    const qq = buildQuery(c, { topic: q.topic, lang: 'en' });
    const tj = await doc(qq, 'TimelineTone', { timespan: '7d' });
    const vj = await doc(qq, 'TimelineVolRaw', { timespan: '7d' });
    const series = j => ((j.timeline || [])[0]?.data || []).map(d => ({ t: parseSeen(d.date), v: d.value }));
    return { tone: series(tj), volume: series(vj) };
  });
}
async function geo(query, key, ttl = 30 * 60e3) {
  return cached('gdelt:geo:' + key, ttl, async () => {
    if (MOCK) return mx.gdeltGeo(key);
    const u = new URL(GEO); u.searchParams.set('query', query); u.searchParams.set('mode', 'PointData'); u.searchParams.set('format', 'GeoJSON'); u.searchParams.set('timespan', '24H');
    const j = await getJSON('GDELT GEO', u.toString(), { sample: 'gdelt-geo', timeout: 30000 });
    const points = (j.features || []).filter(f => f.geometry?.type === 'Point').map(f => ({ name: f.properties?.name || '', count: f.properties?.count || 1, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], html: String(f.properties?.html || '').replace(/<[^>]+>/g, ' ').slice(0, 300) })).slice(0, 300);
    return { points };
  });
}
const places = iso => { const c = country(iso); return geo(`"${c.name}"`, 'places:' + iso); };
async function unrest(iso, q = {}) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  return cached(`gdelt:unrest:${iso}`, 30 * 60e3, async () => {
    if (MOCK) return mx.gdeltUnrest(c);
    const qq = `"${c.name}" ${UNREST} sourcelang:english`;
    const aj = await doc(qq, 'ArtList', { maxrecords: '60', sort: 'DateDesc', timespan: '3d' });
    const vj = await doc(qq, 'TimelineVolRaw', { timespan: '14d' });
    const items = (aj.articles || []).map(a => ({ title: (a.title || '').trim(), link: a.url, source: a.domain, date: parseSeen(a.seendate), state: isState(a.domain || '') })).filter(a => a.title);
    const volume = ((vj.timeline || [])[0]?.data || []).map(d => ({ t: parseSeen(d.date), v: d.value }));
    return { items, volume };
  }, { force: q.force === '1' });
}
const unrestPoints = iso => { const c = country(iso); return geo(`"${c.name}" ${UNREST}`, 'unrest:' + iso, 45 * 60e3); };
// world headlines for world mode
async function world(q = {}) {
  return cached('gdelt:world:' + (q.topic || 'top'), 15 * 60e3, async () => {
    if (MOCK) return mx.gdeltArticles({ name: 'World', iso: 'WLD' }, q);
    const j = await doc(`${TOPIC[q.topic || 'top'] || '(crisis OR summit OR election OR war OR earthquake OR markets)'} sourcelang:english`, 'ArtList', { maxrecords: '100', sort: 'HybridRel', timespan: '1d' });
    return { items: (j.articles || []).map(a => ({ title: (a.title || '').trim(), link: a.url, source: a.domain, date: parseSeen(a.seendate), thumb: a.socialimage || null, srcCountry: a.sourcecountry || '', state: isState(a.domain || '') })).filter(a => a.title), provider: 'GDELT' };
  }, { force: q.force === '1' });
}
module.exports = { articles, toneVolume, places, unrest, unrestPoints, world, isState };
