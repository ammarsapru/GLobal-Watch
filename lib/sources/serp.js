'use strict';
// SerpAPI: Google News (optional now that GDELT is the default), Google Finance, Flights, Hotels, Maps.
const { log, MOCK, xfetch, cached } = require('../util');
const mock = MOCK ? require('../../mock') : null;
const KEY = process.env.SERPAPI_KEY || '';
const H = 3600e3;
let calls = 0;

async function serp(params, ttlMs, opts = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return cached('serp:' + JSON.stringify(clean), ttlMs, async () => {
    if (MOCK) return mock.serp(clean);
    if (!KEY) throw new Error('This needs SERPAPI_KEY in .env.');
    const u = new URL('https://serpapi.com/search.json');
    for (const [k, v] of Object.entries(clean)) u.searchParams.set(k, v);
    u.searchParams.set('api_key', KEY);
    calls++; log('serpapi', clean.engine, clean.q || clean.departure_id || clean.trend || '');
    const r = await xfetch('SerpAPI', u, { timeout: 30000 });
    const j = await r.json().catch(() => ({ error: 'SerpAPI returned ' + r.status }));
    if (j.error && !/hasn't returned any results/i.test(j.error)) throw new Error(j.error);
    delete j.search_metadata; delete j.search_parameters;
    return j;
  }, opts);
}
async function account() {
  if (MOCK) return { mock: true, searches_left: 250, plan: 'Mock mode' };
  if (!KEY) return { error: 'No SERPAPI_KEY' };
  return cached('serp:account', 5 * 60e3, async () => {
    const r = await xfetch('SerpAPI', 'https://serpapi.com/account.json?api_key=' + KEY, { timeout: 15000 });
    const j = await r.json(); if (j.error) throw new Error(j.error);
    return { searches_left: j.total_searches_left ?? j.plan_searches_left, per_month: j.searches_per_month, used: j.this_month_usage, plan: j.plan_name };
  }, { persist: false });
}
async function googleNews(q) {
  const params = { engine: 'google_news', gl: (q.gl || '').toLowerCase(), hl: q.hl || 'en' };
  if (q.q) params.q = q.q;
  const r = await serp(params, 15 * 60e3, { force: q.force === '1' });
  const items = [];
  for (const it of r.news_results || []) {
    const push = (x, cluster) => x && x.title && x.link && items.push({ title: x.title, link: x.link, source: x.source?.name || x.source || '', thumb: x.thumbnail || x.thumbnail_small, date: x.iso_date || x.date, cluster });
    if (it.stories || it.highlight) { const cid = 'g' + (it.position || items.length); push(it.highlight, cid); (it.stories || []).forEach(s => push(s, cid)); if (!it.highlight && it.title) push(it, cid); }
    else push(it, null);
  }
  return { items, provider: 'Google News', _cache: r._cache };
}
async function quote(q) {
  const win = q.window || '1D';
  const r = await serp({ engine: 'google_finance', q: q.q, window: win === '1D' ? undefined : win, hl: 'en' }, win === '1D' ? 2 * 60e3 : 30 * 60e3, { force: q.force === '1' });
  const s = r.summary || {};
  const graph = (r.graph || []).map(g => ({ p: g.price, d: g.date, v: g.volume })).filter(g => g.p != null);
  const stats = r.knowledge_graph?.key_stats?.stats || [];
  const about = (r.knowledge_graph?.about || [])[0];
  const news = (r.news_results || []).flatMap(n => n.items ? n.items : [n]).filter(n => n && n.title).slice(0, 10).map(n => ({ title: n.title, link: n.link, source: typeof n.source === 'object' ? n.source?.name : n.source, date: n.date, iso: n.iso_date || null, thumb: n.thumbnail }));
  if (!s.title && !graph.length) throw new Error('Google Finance had no quote for "' + q.q + '". Try SYMBOL:EXCHANGE, e.g. 7203:TYO or NVDA:NASDAQ.');
  return { summary: { title: s.title, stock: s.stock, exchange: s.exchange, price: s.extracted_price ?? s.price, priceText: s.price, currency: s.currency, move: s.price_movement || null, date: s.date }, graph, stats, about: about ? { text: about.description?.snippet || about.description || '', info: about.info || [] } : null, news, _cache: r._cache };
}
async function markets(q) {
  const trend = q.trend || 'indexes';
  const r = await serp({ engine: 'google_finance_markets', trend, index_market: trend === 'indexes' ? (q.region || undefined) : undefined, hl: 'en' }, 10 * 60e3, { force: q.force === '1' });
  const groups = (r.market_trends || []).map(g => ({ title: g.title, results: (g.results || []).map(x => ({ stock: x.stock, name: x.name, price: x.extracted_price ?? x.price, priceText: x.price, move: x.price_movement || null })) }));
  return { groups, _cache: r._cache };
}
async function flights(q) {
  if (!q.from || !q.to || !q.out) throw new Error('Enter From, To and a departure date.');
  const r = await serp({ engine: 'google_flights', departure_id: q.from.toUpperCase(), arrival_id: q.to.toUpperCase(), outbound_date: q.out, return_date: q.type === '2' ? undefined : q.ret, type: q.type || '1', adults: q.adults || 1, travel_class: q.cls || 1, stops: q.stops || 0, currency: q.currency || 'USD', hl: 'en', sort_by: q.sort || undefined }, 6 * H, { force: q.force === '1' });
  const norm = (f, best) => ({ best, price: f.price, total: f.total_duration, type: f.type, logo: f.airline_logo || f.flights?.[0]?.airline_logo, legs: (f.flights || []).map(l => ({ from: l.departure_airport?.id, fromName: l.departure_airport?.name, dep: l.departure_airport?.time, to: l.arrival_airport?.id, toName: l.arrival_airport?.name, arr: l.arrival_airport?.time, dur: l.duration, airline: l.airline, logo: l.airline_logo, no: l.flight_number, plane: l.airplane, cls: l.travel_class, legroom: l.legroom, overnight: l.overnight, delayed: l.often_delayed_by_over_30_min })), layovers: (f.layovers || []).map(x => ({ id: x.id, name: x.name, dur: x.duration, overnight: x.overnight })), co2: f.carbon_emissions?.this_flight, co2diff: f.carbon_emissions?.difference_percent });
  const list = [...(r.best_flights || []).map(f => norm(f, true)), ...(r.other_flights || []).map(f => norm(f, false))];
  const pi = r.price_insights || null;
  return { flights: list, insights: pi ? { lowest: pi.lowest_price, level: pi.price_level, range: pi.typical_price_range, history: pi.price_history } : null, airports: r.airports || null, _cache: r._cache };
}
async function hotels(q) {
  if (!q.q || !q.in || !q.out) throw new Error('Enter a city and both dates.');
  const r = await serp({ engine: 'google_hotels', q: q.q, check_in_date: q.in, check_out_date: q.out, adults: q.adults || 2, currency: q.currency || 'USD', hl: 'en', gl: q.gl || 'us', sort_by: q.sort || undefined, rating: q.rating || undefined, hotel_class: q.cls || undefined, min_price: q.min || undefined, max_price: q.max || undefined }, 6 * H, { force: q.force === '1' });
  const props = (r.properties || []).map(p => ({ name: p.name, type: p.type, link: p.link, gps: p.gps_coordinates, night: p.rate_per_night?.extracted_lowest ?? null, nightText: p.rate_per_night?.lowest, total: p.total_rate?.extracted_lowest ?? null, totalText: p.total_rate?.lowest, rating: p.overall_rating, reviews: p.reviews, stars: p.extracted_hotel_class || null, amen: (p.amenities || []).slice(0, 8), img: p.images?.[0]?.thumbnail || p.images?.[0]?.original_image, checkIn: p.check_in_time, checkOut: p.check_out_time, deal: p.deal || p.deal_description, eco: p.eco_certified, loc: p.location_rating }));
  return { props, _cache: r._cache };
}
async function places(q) {
  if (!q.q) throw new Error('Missing search.');
  const r = await serp({ engine: 'google_maps', type: 'search', q: q.q, ll: q.ll || undefined, hl: 'en' }, 24 * H, { force: q.force === '1' });
  const list = (r.local_results || (r.place_results ? [r.place_results] : [])).map(p => ({ title: p.title, rating: p.rating, reviews: p.reviews, type: p.type || (p.types || [])[0], address: p.address, gps: p.gps_coordinates, thumb: p.thumbnail, price: p.price, desc: p.description, open: p.open_state || p.hours, website: p.website, link: p.place_id ? 'https://www.google.com/maps/place/?q=place_id:' + p.place_id : null }));
  return { list, _cache: r._cache };
}
module.exports = { serp, account, googleNews, quote, markets, flights, hotels, places, configured: !!KEY, calls: () => calls };
