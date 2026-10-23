'use strict';
// GDELT 2.0 DOC + GEO APIs: free, global, multilingual, refreshed every 15 minutes. No key, but one request per ~5 s.
const { MOCK, getJSON, getText, cached, country, log } = require('../util');
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
// ---- fallback: Google News RSS (free, no key) when GDELT is rate-limiting or unreachable ----
const RSS_TOPIC = { top: '', politics: 'politics OR election OR government', economy: 'economy OR inflation OR markets', security: 'military OR security OR attack', business: 'business OR company', tech: 'technology OR cyber', culture: 'culture OR sport OR film' };
const decodeXML = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).trim();
async function rss(c, { q = '', lang = 'en', days = 3 } = {}) {
  const hl = lang === 'local' ? String(c.lang || 'en').split(/[,\s]/)[0].toLowerCase() : 'en';
  const gl = lang === 'local' ? c.a2 : 'US';
  const query = (lang === 'local' || !c.name ? q : `"${c.name}" ${q}`).trim() + ` when:${days}d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}-${gl}&gl=${gl}&ceid=${gl}:${hl}`;
  const xml = await getText('Google News RSS', url, { sample: 'gnews-rss', timeout: 20000 });
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1], tag = t => decodeXML((b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`)) || [])[1]);
    const srcUrl = (b.match(/<source url="([^"]+)"/) || [])[1] || ''; const host = (() => { try { return new URL(srcUrl).host.replace(/^www\./, ''); } catch (e) { return ''; } })();
    const source = tag('source') || host; let title = tag('title'); if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const tld = host.split('.').pop(); const a2 = c.a2.toLowerCase();
    items.push({ title, link: tag('link'), source: source || host, date: new Date(tag('pubDate')).toISOString(), lang: lang === 'local' ? hl : 'English', domestic: tld === a2 || (a2 === 'us' && /^(com|org|gov|us)$/.test(tld)) || (a2 === 'gb' && tld === 'uk'), state: isState(host) });
  }
  return items.filter(i => i.title && i.link);
}
// after GDELT refuses or times out, skip it for a while so panels fall back to RSS straight away
let gdeltDownUntil = 0;
async function doc(query, mode, extra = {}) {
  if (Date.now() < gdeltDownUntil) throw new Error('GDELT is cooling down after rate-limiting');
  try { return await docRaw(query, mode, extra); }
  catch (e) { if (/429|rate-limit|reach GDELT|timed out/i.test(e.message)) gdeltDownUntil = Date.now() + 10 * 60e3; throw e; }
}
async function docRaw(query, mode, extra = {}) {
  const u = new URL(DOC);
  u.searchParams.set('query', query); u.searchParams.set('mode', mode); u.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return getJSON('GDELT', u.toString(), { sample: 'gdelt-' + mode, timeout: 20000, noRetry: true });
}
async function articles(iso, q = {}) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  const key = `gdelt:art:${iso}:${q.topic || 'top'}:${q.lang || 'en'}`;
  return cached(key, 15 * 60e3, async () => {
    if (MOCK) return mx.gdeltArticles(c, q);
    let j;
    try {
      try { j = await doc(buildQuery(c, q), 'ArtList', { maxrecords: '120', sort: 'DateDesc', timespan: q.timespan || '3d' }); }
      catch (e) { if (q.lang === 'local' && /short|keyword|query/i.test(e.message)) j = await doc(`"${c.name}" sourcecountry:${nospace(c.name)}`, 'ArtList', { maxrecords: '120', sort: 'DateDesc', timespan: '3d' }); else throw e; }
    } catch (e) {
      log('GDELT unavailable (' + e.message + '), using Google News RSS');
      const items = await rss(c, { q: RSS_TOPIC[q.topic || 'top'] || '', lang: q.lang });
      return { items, provider: 'Google News RSS (GDELT busy)' };
    }
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
// GDELT's GEO API has been retired (404), so "places in the news" are now found by pulling place-like
// names out of the headlines and geocoding them inside the country with Open-Meteo (cached 30 days per name).
const NOTPLACE = new Set('The A An In On At How Why What Who When Breaking Live Watch Opinion Analysis Update Exclusive Video Photos News Report Says Minister President Prime Government Police Army Court Parliament Party Bank Central Ministry Council Union European National Congress Senate Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Reuters AFP AP BBC CNN'.split(' '));
function candidates(titles, c) {
  const count = new Map(), ex = new Set([c.name, c.n, c.cap].filter(Boolean).map(x => x.toLowerCase()));
  for (const t of titles) {
    const seen = new Set();
    for (let m of String(t).match(/\b[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2}/gu) || []) {
      m = m.replace(/['’]s$/, ''); const w = m.split(/\s+/);
      if (NOTPLACE.has(w[0]) || m.length < 4 || ex.has(m.toLowerCase()) || seen.has(m)) continue; seen.add(m);
      count.set(m, (count.get(m) || 0) + 1);
    }
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, 14);
}
async function placesFrom(items, c) {
  const place = require('./place'); const out = [];
  for (const [name, n] of candidates(items.map(i => i.title), c)) {
    try {
      const g = await place.geocodeStrict(name, c.a2); if (!g) continue;
      const heads = items.filter(i => i.title.includes(name)).slice(0, 3).map(i => i.title);
      out.push({ name: g.name, count: n, lat: g.lat, lon: g.lon, html: heads.join(' · ').slice(0, 300) });
    } catch (e) {}
  }
  return { points: out };
}
async function geo(kind, iso, ttl = 30 * 60e3) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  return cached(`gdelt:geo:${kind}:${iso}`, ttl, async () => {
    if (MOCK) return mx.gdeltGeo(kind + ':' + iso);
    const src = kind === 'unrest' ? await unrest(iso) : await articles(iso, {});
    return placesFrom(src.items || [], c);
  });
}
const places = iso => geo('places', iso);
async function unrest(iso, q = {}) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  return cached(`gdelt:unrest:${iso}`, 30 * 60e3, async () => {
    if (MOCK) return mx.gdeltUnrest(c);
    const qq = `"${c.name}" ${UNREST} sourcelang:english`;
    let aj, vj = { timeline: [] };
    try { aj = await doc(qq, 'ArtList', { maxrecords: '60', sort: 'DateDesc', timespan: '3d' }); vj = await doc(qq, 'TimelineVolRaw', { timespan: '14d' }).catch(() => ({ timeline: [] })); }
    catch (e) { return { items: await rss(c, { q: 'protest OR strike OR riot OR clashes OR unrest' }), volume: [], provider: 'Google News RSS (GDELT busy)' }; }
    const items = (aj.articles || []).map(a => ({ title: (a.title || '').trim(), link: a.url, source: a.domain, date: parseSeen(a.seendate), state: isState(a.domain || '') })).filter(a => a.title);
    const volume = ((vj.timeline || [])[0]?.data || []).map(d => ({ t: parseSeen(d.date), v: d.value }));
    return { items, volume };
  }, { force: q.force === '1' });
}
const unrestPoints = iso => geo('unrest', iso, 45 * 60e3);
// world headlines for world mode
async function world(q = {}) {
  return cached('gdelt:world:' + (q.topic || 'top'), 15 * 60e3, async () => {
    if (MOCK) return mx.gdeltArticles({ name: 'World', iso: 'WLD' }, q);
    let j; try { j = await doc(`${TOPIC[q.topic || 'top'] || '(crisis OR summit OR election OR war OR earthquake OR markets)'} sourcelang:english`, 'ArtList', { maxrecords: '100', sort: 'HybridRel', timespan: '1d' }); } catch (e) { const items = await rss({ name: '', a2: 'XX' }, { q: RSS_TOPIC[q.topic || 'top'] || 'world', days: 1 }); return { items: items.map(x => ({ ...x, domestic: undefined })), provider: 'Google News RSS (GDELT busy)' }; }
    return { items: (j.articles || []).map(a => ({ title: (a.title || '').trim(), link: a.url, source: a.domain, date: parseSeen(a.seendate), thumb: a.socialimage || null, srcCountry: a.sourcecountry || '', state: isState(a.domain || '') })).filter(a => a.title), provider: 'GDELT' };
  }, { force: q.force === '1' });
}
module.exports = { articles, toneVolume, places, unrest, unrestPoints, world, isState };
