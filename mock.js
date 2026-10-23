// Sample responses used when no SerpAPI key is set (MOCK mode). Shapes mirror SerpAPI's JSON.
'use strict';
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const ago = m => new Date(Date.now() - m * 60e3).toISOString();
const OUTLETS = ['Reuters', 'AP News', 'BBC', 'Al Jazeera', 'Bloomberg', 'Financial Times', 'The Guardian', 'Nikkei Asia', 'Local Daily', 'National Broadcaster', 'Business Standard', 'Le Monde'];
let newsTick = 0;

function news(p) {
  const c = (p.q || 'the country').replace(/\b(politics|economy|security|culture|business|technology)\b/gi, '').trim() || 'the country';
  const topic = (p.q || '').match(/politics|economy|security|culture/i)?.[0] || 'top';
  const base = {
    top: [`${c} parliament debates budget as deficit concerns grow`, `${c} central bank holds rates, signals caution on inflation`, `Floods disrupt transport in northern ${c}`, `${c} signs trade pact with regional partners`, `Opposition rally draws thousands in ${c} capital`, `${c} tech exports hit record high`, `Heatwave warning issued across ${c}`, `${c} foreign minister to visit Washington next week`],
    politics: [`Coalition talks stall in ${c} after weekend vote`, `${c} prime minister reshuffles cabinet`, `Court ruling in ${c} tests election law`, `${c} opposition leader calls for early polls`],
    economy: [`${c} inflation eases to 2.9% in September`, `${c} currency slips against dollar`, `Factory output in ${c} beats forecasts`, `${c} unveils stimulus for small firms`],
    security: [`${c} navy holds joint drills with allies`, `${c} raises defence budget by 6%`, `Border incident prompts ${c} to summon envoy`, `${c} air force scrambles jets after airspace approach`],
    culture: [`${c} film wins top prize at festival`, `Record tourist numbers for ${c} this autumn`, `${c} museum returns artefacts`, `Food festival draws crowds in ${c}`]
  }[topic.toLowerCase()] || [];
  newsTick++;
  const res = [];
  let pos = 1;
  // one cluster with highlight + stories
  res.push({ position: pos++, title: base[0], highlight: { title: base[0], source: { name: 'Reuters' }, link: 'https://example.com/a1', iso_date: ago(25), thumbnail: '' },
    stories: [{ title: base[0].replace('debates', 'argues over'), source: { name: 'BBC' }, link: 'https://example.com/a2', iso_date: ago(40) }, { title: base[0] + ' — live updates', source: { name: 'Local Daily' }, link: 'https://example.com/a3', iso_date: ago(55) }] });
  base.slice(1).forEach((t, i) => res.push({ position: pos++, title: t, source: { name: pick(OUTLETS) }, link: 'https://example.com/' + encodeURIComponent(t), iso_date: ago(60 + i * 95) }));
  // a fresh headline appears on every refresh so "new since last look" can be tested
  res.unshift({ position: 0, title: `Breaking: ${c} officials brief press on developing story (update ${newsTick})`, source: { name: pick(OUTLETS) }, link: 'https://example.com/live-' + newsTick, iso_date: ago(2) });
  return { news_results: res };
}

function walk(n, start, vol) { const out = []; let v = start; for (let i = 0; i < n; i++) { v *= 1 + (rnd() - 0.48) * vol; out.push(v); } return out; }
function finance(p) {
  const w = p.window || '1D';
  const n = { '1D': 78, '5D': 120, '1M': 22, '6M': 126, 'YTD': 200, '1Y': 252, '5Y': 260, 'MAX': 300 }[w] || 78;
  const step = { '1D': 5 * 60e3, '5D': 30 * 60e3, '1M': 864e5, '6M': 864e5, 'YTD': 864e5, '1Y': 864e5, '5Y': 7 * 864e5, 'MAX': 30 * 864e5 }[w] || 5 * 60e3;
  const start = 100 + (p.q.length * 37) % 900;
  const pr = walk(n, start, w === '1D' ? 0.004 : 0.02);
  const now = Date.now();
  const last = pr[pr.length - 1], first = pr[0], ch = last - first;
  return {
    summary: { title: p.q.split(':')[0] + ' (sample)', stock: p.q.split(':')[0], exchange: p.q.split(':')[1] || 'INDEX', price: last.toFixed(2), extracted_price: +last.toFixed(2), currency: 'USD', price_movement: { percentage: Math.abs(ch / first * 100), value: Math.abs(ch), movement: ch >= 0 ? 'Up' : 'Down' } },
    graph: pr.map((v, i) => ({ price: +v.toFixed(2), currency: 'USD', date: new Date(now - (n - i) * step).toUTCString(), volume: Math.round(rnd() * 5e6) })),
    knowledge_graph: { key_stats: { stats: [{ label: 'Previous close', value: first.toFixed(2) }, { label: 'Day range', value: (last * .98).toFixed(2) + ' - ' + (last * 1.01).toFixed(2) }, { label: 'Year range', value: (last * .7).toFixed(2) + ' - ' + (last * 1.2).toFixed(2) }, { label: 'Market cap', value: '412.6B USD' }, { label: 'P/E ratio', value: '18.4' }, { label: 'Dividend yield', value: '1.9%' }, { label: 'Avg volume', value: '3.2M' }, { label: 'Primary exchange', value: p.q.split(':')[1] || 'INDEX' }] },
      about: [{ description: { snippet: 'Sample description for ' + p.q + '. In live mode this is Google Finance\'s company or index summary.' }, info: [{ label: 'Sector', value: 'Sample' }, { label: 'Employees', value: '12,400' }] }] },
    news_results: [{ title: p.q + ' shares move after earnings update', link: 'https://example.com/f1', source: 'Reuters', date: '2 hours ago' }, { title: 'Analysts weigh outlook for ' + p.q.split(':')[0], link: 'https://example.com/f2', source: 'Bloomberg', date: '5 hours ago' }, { title: 'Sector rotation hits ' + (p.q.split(':')[1] || 'market'), link: 'https://example.com/f3', source: 'CNBC', date: '1 day ago' }]
  };
}
const IDX = {
  americas: [['.INX:INDEXSP', 'S&P 500'], ['.DJI:INDEXDJX', 'Dow Jones'], ['.IXIC:INDEXNASDAQ', 'Nasdaq Composite'], ['OSPTX:INDEXTSI', 'S&P/TSX'], ['IBOV:INDEXBVMF', 'Bovespa'], ['ME:INDEXBMV', 'IPC Mexico']],
  'europe-middle-east-africa': [['UKX:INDEXFTSE', 'FTSE 100'], ['DAX:INDEXDB', 'DAX'], ['PX1:INDEXEURO', 'CAC 40'], ['IBEX:INDEXBME', 'IBEX 35'], ['SMI:INDEXSWX', 'SMI'], ['XU100:IST', 'BIST 100'], ['TASI:TADAWUL', 'TASI']],
  'asia-pacific': [['NI225:INDEXNIKKEI', 'Nikkei 225'], ['HSI:INDEXHANGSENG', 'Hang Seng'], ['000001:SHA', 'SSE Composite'], ['SENSEX:INDEXBOM', 'S&P BSE SENSEX'], ['KOSPI:KRX', 'KOSPI'], ['XJO:INDEXASX', 'S&P/ASX 200'], ['TAIEX:TPE', 'TAIEX'], ['STI:INDEXSTI', 'Straits Times']]
};
function markets(p) {
  const mk = ([stock, name]) => { const v = 1000 + rnd() * 30000, c = (rnd() - .45) * 2.4; return { stock, name, price: v.toFixed(2), extracted_price: +v.toFixed(2), price_movement: { percentage: Math.abs(c), value: Math.abs(v * c / 100), movement: c >= 0 ? 'Up' : 'Down' } }; };
  if (p.trend === 'indexes') {
    const regions = p.index_market ? [p.index_market] : Object.keys(IDX);
    return { market_trends: regions.map(r => ({ title: r, results: IDX[r].map(mk) })) };
  }
  const names = [['NVDA:NASDAQ', 'NVIDIA'], ['TSLA:NASDAQ', 'Tesla'], ['AAPL:NASDAQ', 'Apple'], ['AMD:NASDAQ', 'AMD'], ['PLTR:NASDAQ', 'Palantir'], ['INTC:NASDAQ', 'Intel'], ['F:NYSE', 'Ford']];
  return { market_trends: [{ title: p.trend, results: names.map(mk) }] };
}
function flights(p) {
  const air = [['Japan Airlines', 'JL'], ['ANA', 'NH'], ['United', 'UA'], ['Delta', 'DL'], ['American', 'AA'], ['Korean Air', 'KE']];
  const mk = (i, best) => {
    const [an, code] = air[i % air.length]; const stops = i % 3 === 0 ? 0 : 1; const d = new Date(p.outbound_date + 'T00:00:00'); d.setHours(6 + i * 2, (i * 17) % 60);
    const dur = 780 + stops * 160 + i * 12; const arr = new Date(d.getTime() + dur * 60e3);
    const f = t => t.toISOString().slice(0, 10) + ' ' + t.toTimeString().slice(0, 5);
    const legs = stops ? [{ departure_airport: { name: p.departure_id + ' Intl', id: p.departure_id, time: f(d) }, arrival_airport: { name: 'Seoul Incheon', id: 'ICN', time: f(new Date(d.getTime() + 600 * 60e3)) }, duration: 600, airline: an, airline_logo: '', flight_number: code + ' ' + (100 + i), airplane: 'Boeing 787', travel_class: 'Economy', legroom: '31 in' },
      { departure_airport: { name: 'Seoul Incheon', id: 'ICN', time: f(new Date(d.getTime() + 760 * 60e3)) }, arrival_airport: { name: p.arrival_id + ' Intl', id: p.arrival_id, time: f(arr) }, duration: dur - 760, airline: an, flight_number: code + ' ' + (700 + i), airplane: 'Airbus A321', travel_class: 'Economy', legroom: '30 in' }]
      : [{ departure_airport: { name: p.departure_id + ' Intl', id: p.departure_id, time: f(d) }, arrival_airport: { name: p.arrival_id + ' Intl', id: p.arrival_id, time: f(arr) }, duration: dur, airline: an, flight_number: code + ' ' + (5 + i), airplane: 'Boeing 777', travel_class: 'Economy', legroom: '32 in', overnight: true }];
    return { flights: legs, layovers: stops ? [{ id: 'ICN', name: 'Seoul Incheon', duration: 160 }] : [], total_duration: dur, price: 820 + i * 63 - (stops ? 140 : 0), type: p.type === '2' ? 'One way' : 'Round trip', carbon_emissions: { this_flight: 610000 + i * 9000, difference_percent: stops ? -8 : 6 } };
  };
  const now = Date.now();
  return { best_flights: [0, 1, 2].map(i => mk(i, true)), other_flights: [3, 4, 5, 6, 7].map(i => mk(i, false)),
    price_insights: { lowest_price: 760, price_level: 'typical', typical_price_range: [720, 1050], price_history: Array.from({ length: 60 }, (_, i) => [Math.floor((now - (60 - i) * 864e5) / 1000), Math.round(800 + Math.sin(i / 6) * 90 + rnd() * 40)]) } };
}
function hotels(p) {
  const n = ['Grand Harbour Hotel', 'Riverside Inn', 'The Meridian', 'Capsule Stay Central', 'Park View Residences', 'Old Town Boutique', 'Skyline Tower Hotel', 'Garden Ryokan', 'Station Business Hotel', 'Seaside Resort & Spa'];
  const nights = Math.max(1, Math.round((new Date(p.check_out_date) - new Date(p.check_in_date)) / 864e5));
  let props = n.map((name, i) => { const night = 60 + ((i * 53) % 340); return { type: 'hotel', name, link: 'https://example.com/hotel/' + i, gps_coordinates: { latitude: 0, longitude: 0 }, rate_per_night: { lowest: '$' + night, extracted_lowest: night }, total_rate: { lowest: '$' + night * nights, extracted_lowest: night * nights }, overall_rating: +(3.6 + ((i * 7) % 14) / 10).toFixed(1), reviews: 200 + i * 311, hotel_class: (2 + (i % 4)) + '-star hotel', extracted_hotel_class: 2 + (i % 4), amenities: ['Free Wi-Fi', 'Breakfast', 'Pool', 'Air conditioning', 'Fitness centre', 'Restaurant', 'Airport shuttle'].slice(i % 3, i % 3 + 4), images: [], check_in_time: '3:00 PM', check_out_time: '11:00 AM', location_rating: 3 + (i % 3) * .7 }; });
  if (p.min_price) props = props.filter(x => x.rate_per_night.extracted_lowest >= +p.min_price);
  if (p.max_price) props = props.filter(x => x.rate_per_night.extracted_lowest <= +p.max_price);
  if (p.hotel_class) { const cs = String(p.hotel_class).split(',').map(Number); props = props.filter(x => cs.includes(x.extracted_hotel_class)); }
  if (p.rating) { const min = { 7: 3.5, 8: 4, 9: 4.5 }[p.rating] || 0; props = props.filter(x => x.overall_rating >= min); }
  if (p.sort_by === '3') props.sort((a, b) => a.rate_per_night.extracted_lowest - b.rate_per_night.extracted_lowest);
  if (p.sort_by === '8') props.sort((a, b) => b.overall_rating - a.overall_rating);
  if (p.sort_by === '13') props.sort((a, b) => b.reviews - a.reviews);
  return { properties: props };
}
function maps(p) {
  const kind = (p.q.match(/^(\w+)/) || [])[1] || 'place';
  return { local_results: Array.from({ length: 8 }, (_, i) => ({ title: `${kind[0].toUpperCase() + kind.slice(1)} spot ${i + 1}`, rating: +(3.9 + (i % 6) / 10).toFixed(1), reviews: 120 + i * 845, type: kind, address: `${i + 3} Sample Street`, gps_coordinates: { latitude: 0, longitude: 0 }, price: ['$', '$$', '$$$'][i % 3], open_state: i % 4 ? 'Open · Closes 9 PM' : 'Closed · Opens 10 AM', description: 'Sample place used in mock mode.', place_id: 'mock' + i })) };
}
exports.serp = p => ({ google_news: news, google_finance: finance, google_finance_markets: markets, google_flights: flights, google_hotels: hotels, google_maps: maps }[p.engine] || (() => ({})))(p);

// moving sample aircraft around the country centroid
const fleets = {};
exports.aircraft = (cc, q, addTrail) => {
  const lat0 = +q.lat || 0, lon0 = +q.lon || 0;
  if (!fleets[cc]) {
    const types = ['C17', 'K35R', 'P8', 'F15', 'C130', 'E3TF', 'A332', 'B738', 'A320', 'B77W', 'E190', 'DH8D'];
    fleets[cc] = Array.from({ length: 70 }, (_, i) => { const mil = i % 7 === 0; const far = i % 11 === 0 ? 25 : 6; return { hex: (0x800000 + i * 97).toString(16), cs: mil ? 'RCH' + (100 + i) : cc + 'A' + (300 + i), mil, t: mil ? types[i % 6] : types[6 + (i % 6)], r: mil ? '' : cc + '-' + (1000 + i), lat: lat0 + (rnd() - .5) * far, lon: lon0 + (rnd() - .5) * far * 1.4, alt: rnd() < .08 ? 0 : Math.round(3000 + rnd() * 36000), gs: Math.round(220 + rnd() * 280), trk: Math.round(rnd() * 360), vr: Math.round((rnd() - .5) * 2000), sq: String(1000 + i), src: mil ? 'adsb.lol (sample)' : 'OpenSky (sample)' }; });
  }
  const t = Date.now();
  for (const a of fleets[cc]) { a.gnd = a.alt === 0; if (!a.gnd) { const d = a.gs / 3600 / 60 * 0.6; a.lat += Math.cos(a.trk * Math.PI / 180) * d; a.lon += Math.sin(a.trk * Math.PI / 180) * d; } addTrail(a, t); }
  return { cc, mode: q.mode === 'over' ? 'over' : 'reg', list: fleets[cc].map((a, i) => ({ ...a, cc: q.mode === 'over' && i % 3 ? ['US', 'CN', 'KR', 'DE'][i % 4] : cc })), errors: [], osAt: t, milAt: t, sample: true };
};
const fleetsS = {};
exports.ships = (cc, q, addTrail) => {
  const box = (q.bbox || '').split(',').map(Number); const lat0 = box.length === 4 ? (box[1] + box[3]) / 2 : 0, lon0 = box.length === 4 ? (box[0] + box[2]) / 2 : 0;
  const key = cc + (q.mode || '');
  if (!fleetsS[key]) {
    const types = [70, 71, 80, 81, 30, 60, 52, 37, 35, 55, 79, 89];
    const names = ['OCEAN STAR', 'PACIFIC TRADER', 'NORTHERN SPIRIT', 'SEA HARMONY', 'MARU 8', 'BLUE HORIZON', 'GOLDEN WAVE', 'CORAL BAY', 'IRON DUKE', 'EVER BRIGHT', 'SILVER TIDE', 'KAIYO'];
    fleetsS[key] = Array.from({ length: 80 }, (_, i) => { const tp = types[i % types.length]; return { mmsi: String(431000000 + i * 37), name: names[i % names.length] + ' ' + (i + 1), type: tp, dest: ['TOKYO', 'SINGAPORE', 'BUSAN', 'LOS ANGELES', 'ROTTERDAM', ''][i % 6], cs: 'JA' + (100 + i), imo: 9000000 + i, len: 30 + (i * 13) % 300, lat: lat0 + (rnd() - .5) * 14, lon: lon0 + (rnd() - .5) * 18, sog: i % 6 === 0 ? 0.1 : +(4 + rnd() * 16).toFixed(1), cog: Math.round(rnd() * 360), hdg: null, nav: i % 6 === 0 ? 1 : 0, flag: q.mode === 'near' ? ['JP', 'PA', 'LR', 'CN', 'KR', 'MH'][i % 6] : cc }; });
  }
  const t = Date.now();
  for (const sh of fleetsS[key]) { const d = (sh.sog || 0) / 3600 / 60 * 0.4; sh.lat += Math.cos(sh.cog * Math.PI / 180) * d; sh.lon += Math.sin(sh.cog * Math.PI / 180) * d; sh.t = t; addTrail({ hex: 's' + sh.mmsi, lat: sh.lat, lon: sh.lon }, t); }
  return { cc, mode: q.mode === 'near' ? 'near' : 'flag', list: fleetsS[key].map(x => ({ ...x })), state: 'live', since: t - 60e3, msgs: 12345, tracked: 5000, error: null, warming: false, sample: true };
};
exports.ai = (sys, user) => {
  if (/news desk/.test(sys)) return 'TOP LINE: Sample digest. In live mode this summarises only the headlines you have not seen yet.\nKEY STORIES:\n- The budget debate is the dominant story, carried by three outlets.\n- The central bank kept rates on hold and sounded cautious.\n- Flooding in the north is disrupting transport.\nWHAT CHANGED: A new breaking item appeared since your last digest.\nWATCH: The budget vote expected later this week.';
  if (/markets/.test(sys)) return 'WHAT IT IS: Sample market explanation.\nWHAT MOVED IT: In live mode Claude ties the price move to the latest Google Finance headlines.\nRISKS:\n- Currency swings\n- Policy changes';
  if (/travel planner/.test(sys)) return 'MORNING: Start at the top-rated spot from the list.\nAFTERNOON: Walk to the second place nearby.\nEVENING: Finish at the third.\nGETTING AROUND: Sample transit tip.';
  return 'SNAPSHOT: Sample posture summary built from the live aircraft counts.\nFORCE STRUCTURE: In live mode this describes publicly reported forces.\nALLIANCES AND FOREIGN BASING: Sample.';
};
