'use strict';
/* Global Watch — front end. Talks only to the local server (/api/*), which holds the keys. */

// ================= helpers =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const enc = encodeURIComponent;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('gw-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gw-' + k, JSON.stringify(v)); } catch (e) {} }
};
let toastT;
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
async function api(path, opts) {
  let r;
  try { r = await fetch(path, opts); } catch (e) { throw new Error('The local server is not responding. Is "node server.js" still running?'); }
  const j = await r.json().catch(() => ({ error: 'The server sent an unreadable response (' + r.status + ').' }));
  if (!r.ok || j.error) { const e = new Error(j.error || 'Request failed (' + r.status + ')'); e.code = j.code; e.status = r.status; throw e; }
  setTimeout(refreshStatus, 400);
  return j;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - (typeof ts === 'number' ? ts : Date.parse(ts))) / 1000);
  if (!isFinite(s)) return '';
  if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago';
}
const cacheNote = c => c ? (c.stale ? 'stale · ' : '') + 'updated ' + ago(c.at) + (c.hit ? ' · cached' : '') : '';
const fmtMoney = m => { if (m == null) return '—'; const v = m * 1e6; if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'; if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'; return '$' + (v / 1e6).toFixed(0) + 'M'; };
const fmtPop = p => p >= 1e9 ? (p / 1e9).toFixed(2) + 'B' : p >= 1e6 ? (p / 1e6).toFixed(1) + 'M' : p >= 1e3 ? (p / 1e3).toFixed(0) + 'K' : String(p);
const fmtN = (v, d = 2) => v == null || isNaN(v) ? '—' : (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pad = n => String(n).padStart(2, '0');
const dayISO = o => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const mins = m => m == null ? '—' : Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
const loading = t => `<div class="loading">${esc(t)}</div>`;
const errBox = e => `<p class="err">${esc(e.message || e)}</p>`;
function seg(name, opts, cur, cls = 'seg') { return `<div class="${cls}" role="group" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`; }
function onSeg(root, name, fn) {
  const g = root.querySelector(`[data-seg="${name}"]`); if (!g) return;
  g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !g.contains(b)) return; g.querySelectorAll(':scope>button').forEach(x => x.setAttribute('aria-pressed', x === b)); fn(b.dataset.v, b); });
}
const ICON = {
  min: '<svg viewBox="0 0 16 16"><path d="M3 12h10"/></svg>',
  max: '<svg viewBox="0 0 16 16"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  refresh: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3"/></svg>'
};

// ================= reference data =================
const { topo, data: DATA } = PAYLOAD;
// ISO3 → [airport IATA, airport name, exchange, benchmark name]
const EXTRA = {
  USA: ['JFK', 'New York JFK', 'NYSE / Nasdaq', 'S&P 500'], CAN: ['YYZ', 'Toronto Pearson', 'Toronto Stock Exchange', 'S&P/TSX'], MEX: ['MEX', 'Mexico City Intl', 'Bolsa Mexicana', 'IPC'], BRA: ['GRU', 'São Paulo Guarulhos', 'B3', 'Bovespa'],
  ARG: ['EZE', 'Buenos Aires Ezeiza', 'BYMA', 'Merval'], CHL: ['SCL', 'Santiago Intl', 'Santiago Exchange', 'IPSA'], COL: ['BOG', 'Bogotá El Dorado', 'BVC', 'COLCAP'], PER: ['LIM', 'Lima Jorge Chávez', 'BVL', 'S&P/BVL'],
  GBR: ['LHR', 'London Heathrow', 'London Stock Exchange', 'FTSE 100'], FRA: ['CDG', 'Paris Charles de Gaulle', 'Euronext Paris', 'CAC 40'], DEU: ['FRA', 'Frankfurt', 'Deutsche Börse', 'DAX'], ITA: ['FCO', 'Rome Fiumicino', 'Borsa Italiana', 'FTSE MIB'],
  ESP: ['MAD', 'Madrid Barajas', 'BME', 'IBEX 35'], NLD: ['AMS', 'Amsterdam Schiphol', 'Euronext Amsterdam', 'AEX'], CHE: ['ZRH', 'Zurich', 'SIX Swiss Exchange', 'SMI'], SWE: ['ARN', 'Stockholm Arlanda', 'Nasdaq Stockholm', 'OMX Stockholm 30'],
  NOR: ['OSL', 'Oslo Gardermoen', 'Oslo Børs', 'OBX'], POL: ['WAW', 'Warsaw Chopin', 'GPW', 'WIG20'], TUR: ['IST', 'Istanbul', 'Borsa Istanbul', 'BIST 100'], RUS: ['SVO', 'Moscow Sheremetyevo', 'Moscow Exchange', 'MOEX'],
  UKR: ['KBP', 'Kyiv Boryspil (airspace closed)', 'PFTS', 'PFTS'], ISR: ['TLV', 'Tel Aviv Ben Gurion', 'Tel Aviv Stock Exchange', 'TA-35'], SAU: ['RUH', 'Riyadh King Khalid', 'Saudi Exchange', 'TASI'], ARE: ['DXB', 'Dubai Intl', 'DFM / ADX', 'DFM'],
  EGY: ['CAI', 'Cairo Intl', 'Egyptian Exchange', 'EGX 30'], ZAF: ['JNB', 'Johannesburg O.R. Tambo', 'JSE', 'JSE All Share'], NGA: ['LOS', 'Lagos Murtala Muhammed', 'Nigerian Exchange', 'NGX'], KEN: ['NBO', 'Nairobi Jomo Kenyatta', 'Nairobi Securities Exchange', 'NSE 20'],
  IND: ['DEL', 'Delhi Indira Gandhi', 'BSE / NSE', 'SENSEX'], PAK: ['ISB', 'Islamabad Intl', 'Pakistan Stock Exchange', 'KSE 100'], CHN: ['PEK', 'Beijing Capital', 'Shanghai Stock Exchange', 'SSE Composite'], HKG: ['HKG', 'Hong Kong Intl', 'HKEX', 'Hang Seng'],
  TWN: ['TPE', 'Taipei Taoyuan', 'TWSE', 'TAIEX'], JPN: ['HND', 'Tokyo Haneda', 'Japan Exchange Group', 'Nikkei 225'], KOR: ['ICN', 'Seoul Incheon', 'Korea Exchange', 'KOSPI'], SGP: ['SIN', 'Singapore Changi', 'SGX', 'Straits Times'],
  IDN: ['CGK', 'Jakarta Soekarno-Hatta', 'IDX', 'Jakarta Composite'], MYS: ['KUL', 'Kuala Lumpur Intl', 'Bursa Malaysia', 'KLCI'], THA: ['BKK', 'Bangkok Suvarnabhumi', 'SET', 'SET Index'], VNM: ['HAN', 'Hanoi Noi Bai', 'HOSE', 'VN-Index'],
  PHL: ['MNL', 'Manila Ninoy Aquino', 'PSE', 'PSEi'], AUS: ['SYD', 'Sydney Kingsford Smith', 'ASX', 'ASX 200'], NZL: ['AKL', 'Auckland', 'NZX', 'NZX 50'], IRL: ['DUB', 'Dublin', 'Euronext Dublin', 'ISEQ'],
  BEL: ['BRU', 'Brussels', 'Euronext Brussels', 'BEL 20'], AUT: ['VIE', 'Vienna', 'Wiener Börse', 'ATX'], PRT: ['LIS', 'Lisbon', 'Euronext Lisbon', 'PSI'], GRC: ['ATH', 'Athens Intl', 'Athens Exchange', 'ATHEX'],
  DNK: ['CPH', 'Copenhagen Kastrup', 'Nasdaq Copenhagen', 'OMX Copenhagen 25'], FIN: ['HEL', 'Helsinki-Vantaa', 'Nasdaq Helsinki', 'OMX Helsinki 25'], IRN: ['IKA', 'Tehran Imam Khomeini', 'Tehran Stock Exchange', 'TEDPIX'], QAT: ['DOH', 'Doha Hamad', 'Qatar Stock Exchange', 'QE General'],
  MAR: ['CMN', 'Casablanca Mohammed V', 'Casablanca SE', 'MASI']
};
// Google Finance symbols: benchmark first, then major listed companies
const TICKERS = {
  USA: [['.INX:INDEXSP', 'S&P 500'], ['.DJI:INDEXDJX', 'Dow Jones'], ['.IXIC:INDEXNASDAQ', 'Nasdaq'], ['AAPL:NASDAQ', 'Apple'], ['MSFT:NASDAQ', 'Microsoft'], ['NVDA:NASDAQ', 'NVIDIA'], ['AMZN:NASDAQ', 'Amazon'], ['JPM:NYSE', 'JPMorgan']],
  JPN: [['NI225:INDEXNIKKEI', 'Nikkei 225'], ['7203:TYO', 'Toyota'], ['6758:TYO', 'Sony'], ['9984:TYO', 'SoftBank'], ['8306:TYO', 'MUFG'], ['6861:TYO', 'Keyence']],
  GBR: [['UKX:INDEXFTSE', 'FTSE 100'], ['SHEL:LON', 'Shell'], ['AZN:LON', 'AstraZeneca'], ['HSBA:LON', 'HSBC'], ['ULVR:LON', 'Unilever'], ['BP:LON', 'BP']],
  DEU: [['DAX:INDEXDB', 'DAX'], ['SAP:ETR', 'SAP'], ['SIE:ETR', 'Siemens'], ['ALV:ETR', 'Allianz'], ['DTE:ETR', 'Deutsche Telekom'], ['VOW3:ETR', 'Volkswagen']],
  FRA: [['PX1:INDEXEURO', 'CAC 40'], ['MC:EPA', 'LVMH'], ['TTE:EPA', 'TotalEnergies'], ['AIR:EPA', 'Airbus'], ['OR:EPA', "L'Oréal"], ['SAN:EPA', 'Sanofi']],
  CHN: [['000001:SHA', 'SSE Composite'], ['600519:SHA', 'Kweichow Moutai'], ['601398:SHA', 'ICBC'], ['0700:HKG', 'Tencent'], ['9988:HKG', 'Alibaba'], ['1211:HKG', 'BYD']],
  HKG: [['HSI:INDEXHANGSENG', 'Hang Seng'], ['0700:HKG', 'Tencent'], ['0005:HKG', 'HSBC'], ['1299:HKG', 'AIA'], ['0941:HKG', 'China Mobile']],
  IND: [['SENSEX:INDEXBOM', 'SENSEX'], ['NIFTY_50:INDEXNSE', 'Nifty 50'], ['RELIANCE:NSE', 'Reliance'], ['TCS:NSE', 'TCS'], ['HDFCBANK:NSE', 'HDFC Bank'], ['INFY:NSE', 'Infosys']],
  KOR: [['KOSPI:KRX', 'KOSPI'], ['005930:KRX', 'Samsung Elec.'], ['000660:KRX', 'SK Hynix'], ['005380:KRX', 'Hyundai Motor'], ['035420:KRX', 'Naver']],
  TWN: [['TAIEX:TPE', 'TAIEX'], ['2330:TPE', 'TSMC'], ['2317:TPE', 'Hon Hai'], ['2454:TPE', 'MediaTek']],
  CAN: [['OSPTX:INDEXTSI', 'S&P/TSX'], ['RY:TSE', 'Royal Bank'], ['SHOP:TSE', 'Shopify'], ['TD:TSE', 'TD Bank'], ['ENB:TSE', 'Enbridge']],
  AUS: [['XJO:INDEXASX', 'ASX 200'], ['BHP:ASX', 'BHP'], ['CBA:ASX', 'CommBank'], ['CSL:ASX', 'CSL']],
  BRA: [['IBOV:INDEXBVMF', 'Bovespa'], ['PETR4:BVMF', 'Petrobras'], ['VALE3:BVMF', 'Vale'], ['ITUB4:BVMF', 'Itaú']],
  CHE: [['SMI:INDEXSWX', 'SMI'], ['NESN:SWX', 'Nestlé'], ['NOVN:SWX', 'Novartis'], ['ROG:SWX', 'Roche']],
  NLD: [['AEX:INDEXEURO', 'AEX'], ['ASML:AMS', 'ASML'], ['INGA:AMS', 'ING']],
  ESP: [['IBEX:INDEXBME', 'IBEX 35'], ['SAN:BME', 'Santander'], ['IBE:BME', 'Iberdrola'], ['ITX:BME', 'Inditex']],
  ITA: [['FTSEMIB:INDEXFTSE', 'FTSE MIB'], ['ENI:BIT', 'Eni'], ['ISP:BIT', 'Intesa'], ['RACE:BIT', 'Ferrari']],
  SAU: [['TASI:TADAWUL', 'TASI'], ['2222:TADAWUL', 'Saudi Aramco']], SGP: [['STI:INDEXSTI', 'Straits Times'], ['D05:SGX', 'DBS']],
  SWE: [['OMXS30:INDEXOMX', 'OMX 30'], ['VOLV-B:STO', 'Volvo'], ['ERIC-B:STO', 'Ericsson']], MEX: [['ME:INDEXBMV', 'IPC'], ['AMXB:BMV', 'América Movil']],
  TUR: [['XU100:IST', 'BIST 100']], ISR: [['TA35:TLV', 'TA-35'], ['TEVA:TLV', 'Teva']], ZAF: [['J203:JSE', 'All Share'], ['NPN:JSE', 'Naspers']]
};
const regionOf = d => /America/.test(d.cont) ? 'americas' : /Europe|Africa/.test(d.cont) || ['ISR', 'SAU', 'ARE', 'QAT', 'TUR', 'IRN', 'IRQ', 'JOR', 'KWT', 'BHR', 'OMN', 'LBN', 'SYR', 'YEM'].includes(S.iso) ? 'europe-middle-east-africa' : 'asia-pacific';
const ACTS = [['tourist attractions', 'Sights'], ['restaurants', 'Food'], ['museums', 'Museums'], ['parks', 'Outdoors'], ['bars', 'Nightlife'], ['family activities', 'Family'], ['shopping', 'Shopping']];

// ================= state =================
const S = { iso: null, d: null, f: null, status: null };
const features = topojson.feature(topo, topo.objects.countries).features;
const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
const byNum = {}; for (const k in DATA) { const d = DATA[k]; if (d.num) byNum[+d.num] = k; }
for (const f of features) { f.iso3 = byNum[+f.id] || null; if (!f.iso3 && f.properties?.name === 'Kosovo' && DATA.XKX) f.iso3 = 'XKX'; f.c = d3.geoCentroid(f); }
const featByIso = {}; features.forEach(f => { if (f.iso3) featByIso[f.iso3] = f; });
const gdpRank = Object.entries(DATA).filter(([, d]) => d.g.length).sort((a, b) => b[1].g[b[1].g.length - 1][1] - a[1].g[a[1].g.length - 1][1]).map(([k]) => k);

// ================= panels framework =================
const panels = {};
const minimized = new Set(store.get('min', []));
function makePanel(id, title, colId, tabs) {
  const el = document.createElement('section');
  el.className = 'win'; el.id = 'p-' + id; el.dataset.id = id;
  el.innerHTML = `<header><h2>${title}</h2>${tabs ? seg('tab-' + id, tabs, store.get('tab-' + id, tabs[0][0]), 'htabs') : ''}<span class="meta"></span>
    <button class="ic" data-act="refresh" aria-label="Refresh ${title}" title="Refresh">${ICON.refresh}</button>
    <button class="ic" data-act="min" aria-label="Minimise ${title}" title="Minimise">${ICON.min}</button>
    <button class="ic" data-act="max" aria-label="Expand ${title}" title="Expand">${ICON.max}</button></header><div class="body"></div>`;
  $('#' + colId).appendChild(el);
  const p = { id, title, el, body: $('.body', el), meta: m => { $('.meta', el).textContent = m || ''; }, tab: tabs ? store.get('tab-' + id, tabs[0][0]) : null, onTab: null, onRefresh: null };
  if (tabs) onSeg(el, 'tab-' + id, v => { p.tab = v; store.set('tab-' + id, v); p.onTab && p.onTab(v); });
  panels[id] = p;
  if (minimized.has(id)) el.hidden = true;
  return p;
}
let maxed = null, scrim = null;
function closeMax() { if (!maxed) return; maxed.classList.remove('max'); const b = $('[data-act="max"]', maxed); b.innerHTML = ICON.max; b.title = 'Expand'; maxed = null; scrim?.remove(); scrim = null; }
document.addEventListener('click', e => {
  const b = e.target.closest('.win>header [data-act]'); if (!b) return;
  const w = b.closest('.win'), id = w.dataset.id, act = b.dataset.act;
  if (act === 'min') minimize(id);
  if (act === 'refresh') panels[id].onRefresh && panels[id].onRefresh();
  if (act === 'max') {
    if (maxed === w) return closeMax();
    closeMax(); w.classList.add('max'); maxed = w; b.innerHTML = ICON.close; b.title = 'Close';
    scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.onclick = closeMax; document.body.appendChild(scrim);
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMax(); });
const PICON = {
  fin: '<svg viewBox="0 0 24 24"><path d="M3 20h18"/><path d="M4 16l5-6 4 4 7-8"/><path d="M16 6h4v4"/></svg>',
  travel: '<svg viewBox="0 0 24 24"><path d="M10.5 13.5L3 11l1.5-1.5 7 1 4-4.5c1-1 2.6-1.4 3.3-.7.7.7.3 2.3-.7 3.3l-4.5 4 1 7L13 21l-2.5-7.5z"/><path d="M5 19l3-3"/></svg>',
  news: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="15" height="16" rx="1.5"/><path d="M18 8h3v10.5A1.5 1.5 0 0 1 19.5 20H18"/><path d="M6.5 8h8M6.5 12h8M6.5 16h5"/></svg>',
  track: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>'
};
const SHORT = { fin: 'Finance', travel: 'Travel', news: 'News', track: 'Tracking' };
const ORDER = ['fin', 'travel', 'news', 'track'];
const anim = (el, kf, o) => reduce || !el.animate ? { finished: Promise.resolve() } : el.animate(kf, o);
function renderDock(fresh) {
  const items = ORDER.filter(id => minimized.has(id) && panels[id]);
  const d = $('#pdock'); d.hidden = !items.length; stage.classList.toggle('has-dock', !!items.length);
  d.innerHTML = items.map(id => `<button type="button" data-restore="${id}" class="${id === fresh ? 'fresh' : ''}" title="Bring back ${esc(panels[id].title)}" aria-label="Bring back ${esc(panels[id].title)}"><span class="ring">${PICON[id]}</span><small>${SHORT[id]}</small></button>`).join('');
}
function flyGhost(fromRect, toRect, el, reverse) {
  const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2), dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
  const s = Math.max(.04, toRect.width / Math.max(fromRect.width, fromRect.height));
  const kf = [{ transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '4px' }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .15, borderRadius: '50%' }];
  return anim(el, reverse ? kf.reverse() : kf, { duration: reverse ? 480 : 440, easing: reverse ? 'cubic-bezier(.2,.8,.2,1)' : 'cubic-bezier(.55,0,.8,.3)' });
}
function minimize(id) {
  if (maxed && maxed.dataset.id === id) closeMax();
  const el = panels[id].el, from = el.getBoundingClientRect();
  const g = el.cloneNode(true); g.removeAttribute('id'); g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  g.classList.add('flyghost'); Object.assign(g.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
  minimized.add(id); store.set('min', [...minimized]); el.hidden = true; layout(); renderDock(id);
  document.body.appendChild(g);
  const btn = $(`#pdock [data-restore="${id}"]`), to = btn ? $('.ring', btn).getBoundingClientRect() : from;
  if (btn) btn.style.visibility = 'hidden';
  flyGhost(from, to, g).finished.then(() => {
    g.remove(); if (!btn) return; btn.style.visibility = '';
    anim($('.ring', btn), [{ transform: 'scale(.2)' }, { transform: 'scale(1.18)', offset: .65 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
  });
}
function restore(id) {
  const btn = $(`#pdock [data-restore="${id}"]`), from = btn ? $('.ring', btn).getBoundingClientRect() : null;
  const finish = () => {
    minimized.delete(id); store.set('min', [...minimized]); const el = panels[id].el; el.hidden = false; layout(); renderDock();
    if (from) flyGhost(el.getBoundingClientRect(), from, el, true);
    panels[id].onShow && panels[id].onShow();
  };
  if (btn) anim($('.ring', btn), [{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: .3 }, { transform: 'scale(.3)', opacity: 0 }], { duration: 220, easing: 'ease-in' }).finished.then(finish); else finish();
}
function layout() {
  const hidden = col => $$('#' + col + '>.win').every(w => w.hidden);
  $('#main').classList.toggle('no-left', hidden('left'));
  $('#main').classList.toggle('no-right', hidden('right'));
  requestAnimationFrame(resize);
}
$('#pdock').addEventListener('click', e => { const b = e.target.closest('[data-restore]'); if (b) restore(b.dataset.restore); });

// ================= generic line chart =================
// series: [{pts:[{x, y, label}], color, dash, area}] ; x numeric. onHover(i|null)
const chartRO = new ResizeObserver(es => { for (const e of es) { const b = e.target; if (b._chart && Math.abs(b.clientWidth - b._w) > 24) lineChart(b, ...b._chart); } });
function lineChart(box, series, opts = {}) {
  const { h = 150, fmtY = v => v, fmtX = v => v, xTicks = 5, onHover, baseline } = opts;
  box._chart = [series, opts]; box._w = box.clientWidth; chartRO.observe(box);
  const w = Math.max(280, Math.round(box.clientWidth) || 460), m = { l: 50, r: 10, t: 8, b: 20 };
  const all = series.flatMap(s => s.pts);
  if (all.length < 2) { box.innerHTML = '<p class="note">Not enough data to chart.</p>'; return; }
  const x = d3.scaleLinear().domain(d3.extent(all, p => p.x)).range([m.l, w - m.r]);
  const ext = d3.extent(all, p => p.y); if (baseline != null) { ext[0] = Math.min(ext[0], baseline); ext[1] = Math.max(ext[1], baseline); }
  const pad = (ext[1] - ext[0]) * 0.06 || Math.abs(ext[0]) * 0.05 || 1;
  const y = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).nice(4).range([h - m.b, m.t]);
  const line = d3.line().x(p => x(p.x)).y(p => y(p.y));
  const area = d3.area().x(p => x(p.x)).y0(h - m.b).y1(p => y(p.y));
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">`;
  y.ticks(4).forEach(t => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${m.l - 6}" y="${y(t) + 3}" text-anchor="end">${esc(fmtY(t))}</text>`; });
  const p0 = series[0].pts; const idx = d3.range(xTicks).map(i => Math.round(i * (p0.length - 1) / (xTicks - 1)));
  [...new Set(idx)].forEach(i => { const p = p0[i]; s += `<text x="${x(p.x)}" y="${h - 5}" text-anchor="${i === 0 ? 'start' : i === p0.length - 1 ? 'end' : 'middle'}">${esc(fmtX(p))}</text>`; });
  if (baseline != null) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(baseline)}" y2="${y(baseline)}" stroke="var(--muted)" stroke-dasharray="3 3" opacity=".6"/>`;
  series.forEach(sr => {
    if (sr.area) s += `<path d="${area(sr.pts)}" fill="${sr.color}" opacity=".12"/>`;
    s += `<path d="${line(sr.pts)}" fill="none" stroke="${sr.color}" stroke-width="1.8" ${sr.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    const l = sr.pts[sr.pts.length - 1]; s += `<circle cx="${x(l.x)}" cy="${y(l.y)}" r="3" fill="${sr.color}"/>`;
  });
  s += `<g class="hov" style="display:none"><line y1="${m.t}" y2="${h - m.b}" stroke="var(--muted)"/>${series.map(sr => `<circle r="3.5" fill="${sr.color}" stroke="var(--bg)"/>`).join('')}</g>`;
  s += `<rect x="${m.l}" y="${m.t}" width="${w - m.l - m.r}" height="${h - m.t - m.b}" fill="transparent" class="ov"/></svg>`;
  box.innerHTML = s;
  const svg = $('svg', box), hov = $('.hov', svg), ov = $('.ov', svg);
  const move = e => {
    const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * w / r.width; const xv = x.invert(px);
    const i = d3.minIndex(p0, p => Math.abs(p.x - xv)); const p = p0[i]; hov.style.display = '';
    $('line', hov).setAttribute('x1', x(p.x)); $('line', hov).setAttribute('x2', x(p.x));
    $$('circle', hov).forEach((c, k) => { const q = series[k].pts.find(z => z.x === p.x) || series[k].pts[d3.minIndex(series[k].pts, z => Math.abs(z.x - p.x))]; c.setAttribute('cx', x(q.x)); c.setAttribute('cy', y(q.y)); });
    onHover && onHover(i);
  };
  ov.addEventListener('pointermove', move); ov.addEventListener('pointerdown', move);
  ov.addEventListener('pointerleave', () => { hov.style.display = 'none'; onHover && onHover(null); });
}

// ================= status bar =================
let statusT = 0;
async function refreshStatus(force) {
  if (!force && Date.now() - statusT < 20e3) return; statusT = Date.now();
  try {
    const s = await (await fetch('/api/status')).json(); S.status = s;
    const pills = [];
    if (s.mock) pills.push(`<span class="pill acc" title="No SERPAPI_KEY in .env, or MOCK=1. Everything shown is sample data.">SAMPLE DATA</span>`);
    else if (s.serp.error) pills.push(`<span class="pill bad" title="${esc(s.serp.error)}">SERPAPI ERROR</span>`);
    else pills.push(`<span class="pill ${s.serp.searches_left > 20 ? 'ok' : 'bad'}" title="SerpAPI searches left this month (${esc(s.serp.plan || '')}). Every new search costs one; repeats come from the cache.">SERPAPI · ${s.serp.searches_left ?? '?'} LEFT</span>`);
    pills.push(s.ai.connected ? `<span class="pill ok" title="${esc(s.ai.base + ' · ' + s.ai.model)}">AI · ${esc(s.ai.provider)}</span>` : `<button class="pill bad" id="aiRetry" title="${esc(s.ai.error || '')} — click to retry">AI OFFLINE · RETRY</button>`);
    $('#status').innerHTML = pills.join('');
    $('#aiRetry')?.addEventListener('click', async () => { toast('Looking for an AI endpoint…'); const r = await api('/api/ai/reconnect').catch(e => ({ error: e.message })); toast(r.connected ? 'AI connected: ' + r.provider : 'Still offline. ' + (r.error || ''), 6000); refreshStatus(true); });
  } catch (e) { $('#status').innerHTML = '<span class="pill bad">SERVER OFFLINE</span>'; }
}

// =====================================================================
// PANEL 1 — ECONOMY & MARKETS
// =====================================================================
const fin = makePanel('fin', 'Finance', 'left', [['eco', 'Economy'], ['mkt', 'Markets']]);
fin.body.innerHTML = `<div class="view" id="ecoView"></div><div class="view" id="mktView" hidden></div>`;
const M = { sym: null, win: store.get('mwin', '1M'), quote: null, watch: store.get('watch2', []), loaded: '', region: null, movers: 'most-active' };
fin.onTab = v => { $('#ecoView').hidden = v !== 'eco'; $('#mktView').hidden = v !== 'mkt'; if (v === 'mkt') ensureMarkets(); else fin.meta('World Bank data'); };
fin.onRefresh = () => { if (fin.tab === 'mkt') loadQuote(true); };
fin.onShow = () => fin.onTab(fin.tab);
let ecoMetric = 'gdp', ecoCompare = '';
function renderEco() {
  const d = S.d, iso = S.iso, g = d.g, i = d.i;
  const lastG = g.at(-1), lastI = i.at(-1);
  const perCap = lastG && d.p ? Math.round(lastG[1] * 1e6 / d.p[1]) : null;
  const growth = g.length > 1 ? (g.at(-1)[1] / g.at(-2)[1] - 1) * 100 : null;
  const cagr = g.length > 5 ? (Math.pow(g.at(-1)[1] / g.at(-6)[1], 1 / 5) - 1) * 100 : null;
  const rank = gdpRank.indexOf(iso);
  const opts = Object.entries(DATA).filter(([k, v]) => k !== iso && v.g.length > 2).sort((a, b) => a[1].n.localeCompare(b[1].n));
  $('#ecoView').innerHTML = `
    <div class="kv">
      <div><small>GDP</small><strong>${lastG ? fmtMoney(lastG[1]) : '—'}</strong><em>${lastG ? lastG[0] : 'n/a'}${rank >= 0 ? ' · #' + (rank + 1) + ' of ' + gdpRank.length : ''}</em></div>
      <div><small>GDP / person</small><strong>${perCap ? '$' + perCap.toLocaleString('en-US') : '—'}</strong><em>current USD</em></div>
      <div><small>Nominal chg</small><strong class="${growth == null ? '' : growth >= 0 ? 'up' : 'down'}">${growth == null ? '—' : (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%'}</strong><em>vs prior year</em></div>
      <div><small>5-yr CAGR</small><strong class="${cagr == null ? '' : cagr >= 0 ? 'up' : 'down'}">${cagr == null ? '—' : (cagr >= 0 ? '+' : '') + cagr.toFixed(1) + '%'}</strong><em>nominal USD</em></div>
      <div><small>Inflation</small><strong>${lastI ? lastI[1] + '%' : '—'}</strong><em>${lastI ? 'CPI ' + lastI[0] : 'n/a'}</em></div>
      <div><small>Population</small><strong>${d.p ? fmtPop(d.p[1]) : '—'}</strong><em>${d.p ? d.p[0] : ''}</em></div>
    </div>
    <div class="bar">${seg('emetric', [['gdp', 'GDP'], ['inf', 'INFLATION']], ecoMetric)}
      <label class="sr" for="ecoCmp">Compare with</label><select id="ecoCmp" class="inp grow" style="flex:1;min-width:120px"><option value="">Compare with…</option>${opts.map(([k, v]) => `<option value="${k}" ${k === ecoCompare ? 'selected' : ''}>${esc(v.n)}</option>`).join('')}</select></div>
    <div class="readout" id="ecoRead"></div><div id="ecoChart"></div>
    <p class="note">Source: World Bank via the open datasets project (GDP current USD, CPI inflation). Hover the chart for any year.</p>`;
  onSeg($('#ecoView'), 'emetric', v => { ecoMetric = v; drawEco(); });
  $('#ecoCmp').onchange = e => { ecoCompare = e.target.value; drawEco(); };
  drawEco(); fin.meta('World Bank data');
}
function drawEco() {
  const pick = d => (ecoMetric === 'gdp' ? d.g : d.i).map(([yr, v]) => ({ x: yr, y: v }));
  const a = pick(S.d), cmp = ecoCompare && DATA[ecoCompare] ? pick(DATA[ecoCompare]) : null;
  const fmt = v => ecoMetric === 'gdp' ? fmtMoney(v) : (+v).toFixed(1) + '%';
  const series = [{ pts: a, color: 'var(--accent)', area: !cmp }];
  if (cmp && cmp.length) series.push({ pts: cmp.filter(p => p.x >= a[0]?.x && p.x <= a.at(-1)?.x), color: 'var(--info)', dash: true });
  const read = $('#ecoRead');
  const def = () => { const l = a.at(-1); read.innerHTML = l ? `${l.x} <span>·</span> ${esc(S.d.n)} ${fmt(l.y)}${cmp ? ` <span>·</span> <span style="color:var(--info)">${esc(DATA[ecoCompare].n)} ${(() => { const q = cmp.find(z => z.x === l.x); return q ? fmt(q.y) : '—'; })()}</span>` : ''}` : 'No data published for this measure.'; };
  def();
  if (!a.length) { $('#ecoChart').innerHTML = ''; return; }
  lineChart($('#ecoChart'), series, { fmtY: fmt, fmtX: p => p.x, baseline: ecoMetric === 'inf' ? 0 : null, onHover: i => {
    if (i == null) return def(); const p = a[i]; const q = cmp?.find(z => z.x === p.x);
    read.innerHTML = `${p.x} <span>·</span> ${esc(S.d.n)} ${fmt(p.y)}${cmp ? ` <span>·</span> <span style="color:var(--info)">${esc(DATA[ecoCompare].n)} ${q ? fmt(q.y) : '—'}</span>` : ''}`;
  } });
}

// ---------- Markets ----------
function mktSkeleton() {
  const picks = TICKERS[S.iso] || [];
  $('#mktView').innerHTML = `
    <form class="bar" id="tkForm"><label class="sr" for="tk">Ticker</label><input id="tk" class="inp grow" placeholder="Symbol, e.g. 7203:TYO or NVDA:NASDAQ" autocomplete="off"><button class="btn solid" type="submit">Go</button><button class="btn ghost" type="button" id="tkWatch" title="Add to watchlist">☆</button></form>
    ${picks.length ? `<div class="chips" id="tkPicks">${picks.map(([s, n]) => `<button type="button" data-s="${esc(s)}">${esc(n)}</button>`).join('')}</div>` : `<p class="note">No preset tickers for ${esc(S.d.n)}. Pick an index from the regional board below, or type a symbol.</p>`}
    <div id="qBox"></div>
    <section class="view"><div class="bar"><span class="eyebrow">Watchlist</span><span class="grow"></span><button class="btn ghost" id="wlRefresh" type="button" title="Costs one search per symbol">Refresh prices</button></div><div id="wlBox"></div></section>
    <section class="view"><div class="bar"><span class="eyebrow" id="idxTitle">Regional indexes</span></div><div id="idxBox"></div></section>
    <section class="view"><div class="bar"><span class="eyebrow">Movers</span><span class="grow"></span>${seg('movers', [['most-active', 'ACTIVE'], ['gainers', 'GAINERS'], ['losers', 'LOSERS']], '')}</div><div id="movBox"><p class="note">Pick a list to load Google Finance's movers (one search each, cached 10 min).</p></div></section>`;
  $('#tkForm').onsubmit = e => { e.preventDefault(); const v = $('#tk').value.trim().toUpperCase(); if (v) { M.sym = v; loadQuote(); } };
  $('#tkPicks')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { M.sym = b.dataset.s; loadQuote(); } });
  $('#tkWatch').onclick = toggleWatch;
  $('#wlRefresh').onclick = refreshWatch;
  onSeg($('#mktView'), 'movers', v => { M.movers = v; loadMovers(); });
  renderWatch();
}
function ensureMarkets() {
  if (M.loaded !== S.iso) {
    M.loaded = S.iso; mktSkeleton();
    M.sym = (TICKERS[S.iso] || [])[0]?.[0] || null; M.quote = null;
    loadIndexes();
    if (M.sym) loadQuote(); else $('#qBox').innerHTML = `<div class="empty">Choose an index or type a symbol to open the stock viewer.</div>`;
  } else if (M.quote) fin.meta(cacheNote(M.quote._cache));
}
async function loadQuote(force) {
  if (!M.sym) return;
  $('#tk').value = M.sym; updateWatchBtn();
  $$('#tkPicks button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === M.sym));
  const box = $('#qBox'); const keep = M.quote && M.quote._sym === M.sym;
  if (box.querySelector('.quote')) box.classList.add('busy'); else box.innerHTML = loading('Loading ' + M.sym + ' from Google Finance…');
  try {
    const q = await api(`/api/finance/quote?q=${enc(M.sym)}&window=${M.win}${force ? '&force=1' : ''}`);
    q._sym = M.sym; M.quote = q; box.classList.remove('busy'); renderQuote(); fin.meta(cacheNote(q._cache));
    const w = M.watch.find(x => x.s === M.sym); if (w) { w.p = q.summary.price; w.c = moveSigned(q.summary.move); w.n = q.summary.title; w.t = Date.now(); store.set('watch2', M.watch); renderWatch(); }
  } catch (e) { box.classList.remove('busy'); box.innerHTML = errBox(e) + `<p class="note">Google Finance symbols look like SYMBOL:EXCHANGE (7203:TYO, AAPL:NASDAQ, NI225:INDEXNIKKEI).</p>`; }
}
const moveSigned = m => !m ? null : (m.movement === 'Down' ? -1 : 1) * (+m.percentage || 0);
function renderQuote() {
  const q = M.quote, s = q.summary; const pts = q.graph.map((g, i) => ({ x: i, y: g.p, label: g.d }));
  const first = pts[0]?.y, last = pts.at(-1)?.y ?? s.price;
  const rangeChg = first ? (last / first - 1) * 100 : null;
  const day = moveSigned(s.move);
  const col = (rangeChg ?? day ?? 0) >= 0 ? 'var(--ok)' : 'var(--warn)';
  const dateLbl = l => { const t = Date.parse(l); if (isNaN(t)) return String(l).slice(0, 12); const dt = new Date(t); return M.win === '1D' ? pad(dt.getHours()) + ':' + pad(dt.getMinutes()) : M.win === '5D' ? dt.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + pad(dt.getHours()) + 'h' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(/5Y|MAX/.test(M.win) ? { year: '2-digit' } : {}) }); };
  $('#qBox').innerHTML = `
    <div class="quote"><div><h3>${esc(s.title || M.sym)}</h3><span class="mono dim">${esc(s.stock || '')}${s.exchange ? ':' + esc(s.exchange) : ''}</span></div>
      <div style="text-align:right"><div class="px">${fmtN(s.price)} <span class="dim" style="font-size:12px">${esc(s.currency || '')}</span></div>
      <div class="chg ${day == null ? '' : day >= 0 ? 'up' : 'down'}">${s.move ? (day >= 0 ? '▲ +' : '▼ −') + fmtN(s.move.value) + ' (' + fmtN(s.move.percentage) + '%) today' : ''}</div></div></div>
    ${seg('mwin', ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'].map(w => [w, w]), M.win)}
    <div class="readout" id="qRead"></div><div id="qChart"></div>
    <div class="bar"><span class="note grow">${rangeChg != null ? `Over ${M.win}: <b class="${rangeChg >= 0 ? 'up' : 'down'}">${rangeChg >= 0 ? '+' : ''}${rangeChg.toFixed(2)}%</b>` : ''}</span><button class="btn" id="qAI" type="button">Explain the move</button></div>
    <div class="brief" id="qAIBox" hidden></div>
    ${q.stats.length ? `<div class="stats">${q.stats.map(x => `<div class="row"><span>${esc(x.label)}</span><span>${esc(x.value)}</span></div>`).join('')}</div>` : ''}
    ${q.about?.text ? `<details><summary>About</summary><p class="note" style="margin-top:6px">${esc(q.about.text)}</p>${(q.about.info || []).map(x => `<div class="row"><span>${esc(x.label)}</span><span>${esc(x.value)}</span></div>`).join('')}</details>` : ''}
    ${q.news.length ? `<span class="eyebrow">Headlines</span><div class="list">${q.news.map(n => `<a class="story" style="text-decoration:none" href="${esc(n.link)}" target="_blank" rel="noopener"><span style="font-weight:600;font-size:13px">${esc(n.title)}</span><span class="s note">${esc(typeof n.source === 'object' ? n.source?.name : n.source || '')} · ${esc(n.date || '')}</span></a>`).join('')}</div>` : ''}
    <a class="note ext" href="https://www.google.com/finance/quote/${enc(M.sym)}" target="_blank" rel="noopener">Open on Google Finance</a>`;
  onSeg($('#qBox'), 'mwin', v => { M.win = v; store.set('mwin', v); loadQuote(); });
  const read = $('#qRead'); const def = () => read.innerHTML = pts.length ? `${esc(String(pts.at(-1).label))} <span>· last</span> ${fmtN(last)}` : '';
  def();
  if (pts.length > 1) lineChart($('#qChart'), [{ pts, color: col, area: true }], { h: 170, fmtY: v => fmtN(v, v > 1000 ? 0 : 2), fmtX: p => dateLbl(p.label), baseline: first, onHover: i => { if (i == null) return def(); const p = pts[i]; const c = (p.y / first - 1) * 100; read.innerHTML = `${esc(String(p.label))} <span>·</span> ${fmtN(p.y)} <span class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(2)}%</span>${q.graph[i].v ? ` <span>· vol ${(+q.graph[i].v).toLocaleString('en-US')}</span>` : ''}`; } });
  else $('#qChart').innerHTML = '<p class="note">No price history returned for this range.</p>';
  $('#qAI').onclick = () => runAI($('#qAI'), $('#qAIBox'), { task: 'market', name: s.title, symbol: M.sym, price: fmtN(s.price), currency: s.currency, change: s.move ? (day >= 0 ? '+' : '-') + fmtN(s.move.percentage) + '% today' : 'n/a', window: M.win, first: fmtN(first), last: fmtN(last), stats: q.stats.slice(0, 8), news: q.news.map(n => n.title).slice(0, 6) });
}
function updateWatchBtn() { const on = M.watch.some(w => w.s === M.sym); const b = $('#tkWatch'); if (b) { b.textContent = on ? '★' : '☆'; b.title = on ? 'Remove from watchlist' : 'Add to watchlist'; b.style.color = on ? 'var(--accent)' : ''; } }
function toggleWatch() {
  if (!M.sym) return; const i = M.watch.findIndex(w => w.s === M.sym);
  if (i >= 0) M.watch.splice(i, 1); else M.watch.push({ s: M.sym, n: M.quote?.summary?.title || M.sym, p: M.quote?.summary?.price, c: moveSigned(M.quote?.summary?.move), t: Date.now() });
  store.set('watch2', M.watch); renderWatch(); updateWatchBtn();
}
function renderWatch() {
  const b = $('#wlBox'); if (!b) return;
  b.innerHTML = M.watch.length ? `<table class="tbl"><thead><tr><th>Symbol</th><th>Name</th><th class="n">Last</th><th class="n">Day</th><th class="n">As of</th></tr></thead><tbody>${M.watch.map(w => `<tr class="click ${w.s === M.sym ? 'on' : ''}" data-s="${esc(w.s)}"><td class="mono">${esc(w.s)}</td><td>${esc(w.n || '')}</td><td class="n">${fmtN(w.p)}</td><td class="n ${w.c == null ? '' : w.c >= 0 ? 'up' : 'down'}">${w.c == null ? '—' : (w.c >= 0 ? '+' : '') + w.c.toFixed(2) + '%'}</td><td class="n dim">${ago(w.t)}</td></tr>`).join('')}</tbody></table>` : `<p class="note">Press ☆ next to a symbol to watch it. Your watchlist works across countries.</p>`;
  $$('tr[data-s]', b).forEach(tr => tr.onclick = () => { M.sym = tr.dataset.s; loadQuote(); });
}
async function refreshWatch() {
  if (!M.watch.length) return;
  const btn = $('#wlRefresh'); btn.disabled = true;
  for (const w of M.watch) {
    btn.textContent = 'Refreshing ' + w.s + '…';
    try { const q = await api(`/api/finance/quote?q=${enc(w.s)}&window=1D`); w.p = q.summary.price; w.c = moveSigned(q.summary.move); w.n = q.summary.title || w.n; w.t = q._cache?.at || Date.now(); } catch (e) { w.err = e.message; }
  }
  store.set('watch2', M.watch); renderWatch(); btn.disabled = false; btn.textContent = 'Refresh prices';
}
async function loadIndexes() {
  const region = regionOf(S.d); M.region = region; const box = $('#idxBox');
  $('#idxTitle').textContent = 'Indexes · ' + { americas: 'Americas', 'europe-middle-east-africa': 'Europe, Middle East & Africa', 'asia-pacific': 'Asia-Pacific' }[region];
  box.innerHTML = loading('Loading regional indexes…');
  try {
    const r = await api('/api/finance/markets?trend=indexes&region=' + region);
    const rows = r.groups.flatMap(g => g.results);
    box.innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Index</th><th class="n">Level</th><th class="n">Day</th></tr></thead><tbody>${rows.map(x => { const c = moveSigned(x.move); return `<tr class="click" data-s="${esc(x.stock)}"><td>${esc(x.name)} <span class="dim mono" style="font-size:10.5px">${esc(x.stock)}</span></td><td class="n">${fmtN(x.price)}</td><td class="n ${c == null ? '' : c >= 0 ? 'up' : 'down'}">${c == null ? '—' : (c >= 0 ? '+' : '') + c.toFixed(2) + '%'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="note">No index data returned.</p>';
    $$('tr[data-s]', box).forEach(tr => tr.onclick = () => { M.sym = tr.dataset.s; loadQuote(); $('#p-fin .body').scrollTop = 0; });
    if (!M.sym && rows.length) { const name = (EXTRA[S.iso] || [])[3]; const hit = name && rows.find(x => x.name.toLowerCase().includes(name.toLowerCase().split(' ')[0])); if (hit) { M.sym = hit.stock; loadQuote(); } }
  } catch (e) { box.innerHTML = errBox(e); }
}
async function loadMovers() {
  const box = $('#movBox'); box.innerHTML = loading('Loading ' + M.movers + '…');
  try {
    const r = await api('/api/finance/markets?trend=' + M.movers);
    const rows = r.groups.flatMap(g => g.results).slice(0, 12);
    box.innerHTML = `<table class="tbl"><tbody>${rows.map(x => { const c = moveSigned(x.move); return `<tr class="click" data-s="${esc(x.stock)}"><td class="mono">${esc(x.stock)}</td><td>${esc(x.name)}</td><td class="n">${fmtN(x.price)}</td><td class="n ${c >= 0 ? 'up' : 'down'}">${c == null ? '—' : (c >= 0 ? '+' : '') + c.toFixed(2) + '%'}</td></tr>`; }).join('')}</tbody></table><p class="note">Google Finance's movers list (mostly US-listed).</p>`;
    $$('tr[data-s]', box).forEach(tr => tr.onclick = () => { M.sym = tr.dataset.s; loadQuote(); $('#p-fin .body').scrollTop = 0; });
  } catch (e) { box.innerHTML = errBox(e); }
}

// ---------- shared AI runner ----------
async function runAI(btn, box, payload, after) {
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Thinking…'; box.hidden = false; box.innerHTML = loading('Asking ' + (S.status?.ai?.provider || 'the AI') + '…');
  let res = null, err = null;
  try {
    res = await post('/api/ai', payload);
    box.innerHTML = esc(res.text) + `<span class="src">${esc(res.provider || '')}${res.model ? ' · ' + esc(res.model) : ''}${res._cache?.hit ? ' · cached' : ''}</span>`;
  } catch (e) {
    err = e;
    box.innerHTML = e.code === 'no_ai' ? `<span class="down">AI isn't connected.</span> ${esc(e.message)}\n\nSet LUMINAL_TEXT_BASE_URL (and LUMINAL_TEXT_MODEL) in .env, or start Ollama, then press AI OFFLINE · RETRY in the top bar.` : errBox(e);
  }
  btn.disabled = false; btn.textContent = label;
  after && after(res, err);
}

// =====================================================================
// PANEL 2 — TRAVEL (flights · hotels · things to do)
// =====================================================================
const trv = makePanel('travel', 'Travel', 'left', [['fly', 'Flights'], ['hotel', 'Hotels'], ['do', 'Do']]);
trv.body.innerHTML = `
  <div class="view" data-tab="fly">
    <form class="form" id="fForm">
      <label>From<input id="fFrom" maxlength="3" required autocapitalize="characters" placeholder="JFK"></label>
      <label>To<input id="fTo" maxlength="3" required autocapitalize="characters"></label>
      <label>Depart<input id="fDep" type="date" required></label>
      <label>Return<input id="fRet" type="date"></label>
      <label>Trip<select id="fType"><option value="1">Round trip</option><option value="2">One way</option></select></label>
      <label>Adults<select id="fAd">${[1, 2, 3, 4, 5, 6].map(n => `<option>${n}</option>`).join('')}</select></label>
      <label>Cabin<select id="fCls"><option value="1">Economy</option><option value="2">Premium econ.</option><option value="3">Business</option><option value="4">First</option></select></label>
      <label>Stops<select id="fStops"><option value="0">Any</option><option value="1">Nonstop</option><option value="2">1 stop or fewer</option></select></label>
      <div class="full bar"><button class="btn solid grow" type="submit" id="fGo">Find flights</button><a class="btn ghost" id="fGoogle" target="_blank" rel="noopener">Google Flights ↗</a></div>
    </form>
    <div id="fRes"></div>
  </div>
  <div class="view" data-tab="hotel" hidden>
    <form class="form" id="hForm">
      <label class="full">City<input id="hCity" required></label>
      <label>Check in<input id="hIn" type="date" required></label>
      <label>Check out<input id="hOut" type="date" required></label>
      <label>Guests<select id="hAd">${[1, 2, 3, 4, 5, 6].map(n => `<option ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Sort<select id="hSort"><option value="">Relevance</option><option value="3">Lowest price</option><option value="8">Highest rating</option><option value="13">Most reviewed</option></select></label>
      <label>Rating<select id="hRate"><option value="">Any</option><option value="7">3.5+</option><option value="8">4.0+</option><option value="9">4.5+</option></select></label>
      <label>Stars<select id="hCls"><option value="">Any</option><option value="2,3">2–3 ★</option><option value="4">4 ★</option><option value="5">5 ★</option><option value="4,5">4–5 ★</option></select></label>
      <label>Max $/night<input id="hMax" type="number" min="0" step="10" placeholder="no limit"></label>
      <div class="full bar"><button class="btn solid grow" type="submit">Find hotels</button></div>
    </form>
    <div id="hRes"></div>
    <a class="note ext" href="https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html" target="_blank" rel="noopener">Check the US travel advisory before booking</a>
  </div>
  <div class="view" data-tab="do" hidden>
    <div class="bar"><label class="sr" for="dCity">City</label><input id="dCity" class="inp grow"><span class="note">Pick a category:</span></div>
    ${seg('dcat', ACTS, '', 'chips')}
    <div id="dRes"><div class="empty">Choose a category to pull real places from Google Maps (1 search, cached 24 h).</div></div>
    <div class="bar"><button class="btn" id="dPlan" type="button" disabled>Plan a day from these places</button></div>
    <div class="brief" id="dPlanBox" hidden></div>
  </div>`;
trv.onTab = v => { $$('#p-travel .view[data-tab]').forEach(x => x.hidden = x.dataset.tab !== v); trv.meta(trv['meta_' + v] || ''); };
trv.onTab(trv.tab);
trv.onRefresh = () => { if (trv.tab === 'fly' && F.last) searchFlights(true); if (trv.tab === 'hotel' && H.last) searchHotels(true); if (trv.tab === 'do' && D.cat) searchPlaces(true); };
const setTMeta = (tab, m) => { trv['meta_' + tab] = m; if (trv.tab === tab) trv.meta(m); };

// ---- flights
const F = { last: null, data: null, sort: 'best', nonstop: false, open: -1 };
$('#fFrom').value = store.get('from', 'JFK'); $('#fDep').value = dayISO(1); $('#fRet').value = dayISO(8); $('#fDep').min = dayISO(0);
const fType = () => $('#fType').value;
function fGoogleLink() {
  const q = `Flights from ${$('#fFrom').value} to ${$('#fTo').value} on ${$('#fDep').value}` + (fType() === '1' && $('#fRet').value ? ` returning ${$('#fRet').value}` : ' one way');
  $('#fGoogle').href = 'https://www.google.com/travel/flights?q=' + enc(q);
}
['fFrom', 'fTo', 'fDep', 'fRet', 'fType'].forEach(id => $('#' + id).addEventListener('input', () => { if (id === 'fFrom') store.set('from', $('#fFrom').value.toUpperCase()); if (id === 'fType') $('#fRet').disabled = fType() === '2'; if (id === 'fDep' && $('#fRet').value < $('#fDep').value) $('#fRet').value = $('#fDep').value; fGoogleLink(); }));
$('#fForm').onsubmit = e => { e.preventDefault(); searchFlights(); };
async function searchFlights(force) {
  const p = { from: $('#fFrom').value.trim().toUpperCase(), to: $('#fTo').value.trim().toUpperCase(), out: $('#fDep').value, ret: $('#fRet').value, type: fType(), adults: $('#fAd').value, cls: $('#fCls').value, stops: $('#fStops').value };
  if (!/^[A-Z]{3}$/.test(p.from) || !/^[A-Z]{3}$/.test(p.to)) { $('#fRes').innerHTML = errBox('Use 3-letter airport codes, e.g. JFK and HND.'); return; }
  if (p.type === '1' && (!p.ret || p.ret < p.out)) { $('#fRes').innerHTML = errBox('Pick a return date on or after the departure date, or switch to one way.'); return; }
  F.last = p; $('#fGo').disabled = true; $('#fRes').innerHTML = loading('Searching Google Flights ' + p.from + ' → ' + p.to + '…');
  try {
    const r = await api('/api/flights?' + new URLSearchParams({ ...p, ...(force ? { force: 1 } : {}) }));
    F.data = r; F.open = -1; renderFlights(); setTMeta('fly', cacheNote(r._cache));
  } catch (e) { $('#fRes').innerHTML = errBox(e); } finally { $('#fGo').disabled = false; }
}
const tparse = s => { const t = Date.parse(String(s).replace(' ', 'T')); return isNaN(t) ? null : t; };
const hm = s => String(s || '').slice(11, 16) || '—';
function renderFlights() {
  const r = F.data; let list = r.flights.slice();
  if (!list.length) { $('#fRes').innerHTML = '<div class="empty">No flights found for those dates. Try other dates or a nearby airport.</div>'; return; }
  if (F.nonstop) list = list.filter(f => f.legs.length === 1);
  const sorters = { best: (a, b) => (b.best - a.best) || (a.price - b.price), cheap: (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9), fast: (a, b) => a.total - b.total, early: (a, b) => (tparse(a.legs[0]?.dep) ?? 0) - (tparse(b.legs[0]?.dep) ?? 0) };
  list.sort(sorters[F.sort]);
  const all = r.flights, cheapest = d3.min(all, f => f.price), fastest = d3.min(all, f => f.total);
  const next = all.slice().sort(sorters.early)[0];
  const ins = r.insights;
  let insight = '';
  if (ins) {
    const [lo, hi] = ins.range || []; const pos = lo != null && hi != null && ins.lowest != null ? Math.max(0, Math.min(100, (ins.lowest - lo * .8) / ((hi * 1.2) - lo * .8) * 100)) : null;
    insight = `<div class="insight"><div class="bar"><span class="eyebrow">Price insight</span><span class="grow"></span><span class="tag ${ins.level === 'low' ? 'ok' : ins.level === 'high' ? 'warn' : 'n'}">${esc((ins.level || 'n/a').toUpperCase())}</span></div>
      <div class="bar"><span class="price">$${fmtN(ins.lowest, 0)}</span><span class="note grow">lowest now · typical $${fmtN(lo, 0)}–$${fmtN(hi, 0)}</span></div>
      ${pos != null ? `<div class="rangebar"><i style="left:${pos}%"></i></div>` : ''}<div id="fHist"></div></div>`;
  }
  $('#fRes').innerHTML = `${insight}
    ${next ? `<div class="bar note">Next departure in results: <b class="mono" style="color:var(--fg)">${esc(next.legs[0]?.dep || '')}</b> · ${esc(next.legs.map(l => l.airline).filter((v, i, a) => a.indexOf(v) === i).join(' + '))}</div>` : ''}
    <div class="bar">${seg('fsort', [['best', 'BEST'], ['cheap', 'CHEAPEST'], ['fast', 'FASTEST'], ['early', 'EARLIEST']], F.sort)}<label class="check"><input type="checkbox" id="fNon" ${F.nonstop ? 'checked' : ''}>Nonstop</label></div>
    <p class="note">${list.length} of ${all.length} options · prices are ${esc(F.last.type === '1' ? 'round trip' : 'one way')} per ${esc(F.last.adults)} adult(s), USD</p>
    <div class="list">${list.map((f, i) => {
      const a = f.legs[0], z = f.legs.at(-1); const stops = f.legs.length - 1; const airlines = [...new Set(f.legs.map(l => l.airline))].join(' + ');
      const tags = [f.price === cheapest ? '<span class="tag ok">CHEAPEST</span>' : '', f.total === fastest ? '<span class="tag info">FASTEST</span>' : '', f.best ? '<span class="tag new">BEST</span>' : ''].join(' ');
      return `<div class="card flight" data-i="${i}" tabindex="0"><div class="top-l">${f.logo ? `<img class="logo" src="${esc(f.logo)}" alt="" loading="lazy">` : '<span class="logo"></span>'}
        <div class="main-c"><span class="times">${hm(a?.dep)} → ${hm(z?.arr)}${a && z && a.dep?.slice(0, 10) !== z.arr?.slice(0, 10) ? '<sup class="dim">+1</sup>' : ''}</span><span class="s"><span>${esc(airlines)}</span><span>${mins(f.total)}</span><span>${stops ? stops + ' stop' + (stops > 1 ? 's' : '') + ' · ' + f.layovers.map(l => esc(l.id) + ' ' + mins(l.dur)).join(', ') : 'Nonstop'}</span></span><span>${tags}</span></div>
        <div class="r"><span class="price">${f.price != null ? '$' + fmtN(f.price, 0) : '—'}</span>${f.co2diff != null ? `<span class="note ${f.co2diff < 0 ? 'up' : ''}">${f.co2diff > 0 ? '+' : ''}${f.co2diff}% CO₂</span>` : ''}</div></div>
        ${F.open === i ? `<div class="legs">${f.legs.map(l => `<div><b class="mono" style="color:var(--fg)">${hm(l.dep)} ${esc(l.from)} → ${hm(l.arr)} ${esc(l.to)}</b> · ${esc(l.airline)} ${esc(l.no || '')} · ${esc(l.plane || '')} · ${mins(l.dur)}${l.legroom ? ' · legroom ' + esc(l.legroom) : ''}${l.overnight ? ' · overnight' : ''}${l.delayed ? ' · <span class="down">often delayed 30+ min</span>' : ''}</div>`).join('')}
          ${f.layovers.map(l => `<div>Layover: ${esc(l.name || l.id)} · ${mins(l.dur)}${l.overnight ? ' · overnight' : ''}</div>`).join('')}<div><a class="ext" href="${esc($('#fGoogle').href)}" target="_blank" rel="noopener">Book via Google Flights</a></div></div>` : ''}</div>`;
    }).join('')}</div>`;
  onSeg($('#fRes'), 'fsort', v => { F.sort = v; F.open = -1; renderFlights(); });
  $('#fNon').onchange = e => { F.nonstop = e.target.checked; renderFlights(); };
  $$('#fRes .flight').forEach(c => { const t = () => { F.open = F.open === +c.dataset.i ? -1 : +c.dataset.i; renderFlights(); }; c.addEventListener('click', e => { if (!e.target.closest('a')) t(); }); c.addEventListener('keydown', e => { if (e.key === 'Enter') t(); }); });
  if (ins?.history?.length > 2) lineChart($('#fHist'), [{ pts: ins.history.map(([t, p]) => ({ x: t, y: p })), color: 'var(--accent)', area: true }], { h: 90, fmtY: v => '$' + Math.round(v), fmtX: p => new Date(p.x * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), xTicks: 3 });
}

// ---- hotels
const H = { last: null, data: null };
$('#hIn').value = dayISO(1); $('#hOut').value = dayISO(4);
$('#hIn').addEventListener('change', () => { if ($('#hOut').value <= $('#hIn').value) { const d = new Date($('#hIn').value); d.setDate(d.getDate() + 2); $('#hOut').value = d.toISOString().slice(0, 10); } });
$('#hForm').onsubmit = e => { e.preventDefault(); searchHotels(); };
async function searchHotels(force) {
  const p = { q: $('#hCity').value.trim() + ', ' + S.d.n, in: $('#hIn').value, out: $('#hOut').value, adults: $('#hAd').value, sort: $('#hSort').value, rating: $('#hRate').value, cls: $('#hCls').value, max: $('#hMax').value, gl: 'us' };
  if (p.out <= p.in) { $('#hRes').innerHTML = errBox('Check-out must be after check-in.'); return; }
  H.last = p; $('#hRes').innerHTML = loading('Searching Google Hotels in ' + p.q + '…');
  try { const r = await api('/api/hotels?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...p, ...(force ? { force: 1 } : {}) }).filter(([, v]) => v)))); H.data = r; renderHotels(); setTMeta('hotel', cacheNote(r._cache)); }
  catch (e) { $('#hRes').innerHTML = errBox(e); }
}
function renderHotels() {
  const ps = H.data.props; const nights = Math.round((Date.parse(H.last.out) - Date.parse(H.last.in)) / 864e5);
  if (!ps.length) { $('#hRes').innerHTML = '<div class="empty">No hotels matched. Loosen the filters or change the dates.</div>'; return; }
  const prices = ps.map(p => p.night).filter(v => v != null).sort((a, b) => a - b);
  $('#hRes').innerHTML = `<p class="note">${ps.length} properties · ${nights} night${nights > 1 ? 's' : ''}${prices.length ? ` · from <b class="mono" style="color:var(--fg)">$${prices[0]}</b>/night · median $${prices[Math.floor(prices.length / 2)]}` : ''}</p>
    <div class="list">${ps.map(p => `<div class="card">${p.img ? `<img class="thumb" src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="thumb"></span>'}
      <div class="main-c"><span class="t">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</span>
        <span class="s">${p.stars ? `<span class="stars">${'★'.repeat(p.stars)}</span>` : `<span>${esc(p.type || '')}</span>`}${p.rating ? `<span><b style="color:var(--fg)">${p.rating}</b>/5 · ${(p.reviews || 0).toLocaleString('en-US')} reviews</span>` : ''}${p.loc ? `<span>location ${(+p.loc).toFixed(1)}</span>` : ''}</span>
        ${p.amen.length ? `<span class="s">${p.amen.slice(0, 5).map(a => `<span class="tag n">${esc(a)}</span>`).join('')}</span>` : ''}
        ${p.deal ? `<span class="s up">${esc(p.deal)}</span>` : ''}</div>
      <div class="r"><span class="price">${p.nightText ? esc(p.nightText) : '—'}</span><span class="note">per night</span>${p.totalText ? `<span class="note">${esc(p.totalText)} total</span>` : ''}</div></div>`).join('')}</div>`;
}

// ---- things to do
const D = { cat: '', data: null };
onSeg($('#p-travel'), 'dcat', v => { D.cat = v; searchPlaces(); });
$('#dCity').addEventListener('change', () => { if (D.cat) searchPlaces(); });
async function searchPlaces(force) {
  const city = $('#dCity').value.trim() || S.d.cap || S.d.n;
  const c = S.f?.c; $('#dRes').innerHTML = loading('Finding ' + D.cat + ' in ' + city + '…'); $('#dPlan').disabled = true;
  try {
    const r = await api('/api/places?' + new URLSearchParams({ q: `${D.cat} in ${city}, ${S.d.n}`, ...(force ? { force: 1 } : {}) }));
    D.data = r; D.city = city; setTMeta('do', cacheNote(r._cache));
    $('#dRes').innerHTML = r.list.length ? `<div class="list">${r.list.map(p => `<div class="card">${p.thumb ? `<img class="thumb" src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="thumb"></span>'}
      <div class="main-c"><span class="t">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}</span>
      <span class="s">${p.rating ? `<span><span class="stars">★</span> <b style="color:var(--fg)">${p.rating}</b> (${(p.reviews || 0).toLocaleString('en-US')})</span>` : ''}${p.type ? `<span>${esc(p.type)}</span>` : ''}${p.price ? `<span>${esc(p.price)}</span>` : ''}</span>
      ${p.address ? `<span class="s">${esc(p.address)}</span>` : ''}${p.open ? `<span class="s ${/open/i.test(p.open) && !/closed/i.test(p.open) ? 'up' : ''}">${esc(typeof p.open === 'string' ? p.open : '')}</span>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">No places found. Try another category or city.</div>';
    $('#dPlan').disabled = !r.list.length;
  } catch (e) { $('#dRes').innerHTML = errBox(e); }
}
$('#dPlan').onclick = () => runAI($('#dPlan'), $('#dPlanBox'), { task: 'plan', city: D.city, country: S.d.n, guests: $('#hAd').value, focus: D.cat, places: D.data.list.slice(0, 10) });

// =====================================================================
// PANEL 3 — LOCAL NEWS (unseen-first ranking + AI digest)
// =====================================================================
const news = makePanel('news', 'Local News', 'newsSlot');
const N = { topic: 'top', lang: store.get('nlang', 'en'), clusters: [], data: null, auto: store.get('nauto', 0), timer: null, showFormula: false };
const SEEN_KEY = 'seen';
let seen = store.get(SEEN_KEY, {});
(function pruneSeen() { const cut = Date.now() - 21 * 864e5; for (const k in seen) if (seen[k] < cut) delete seen[k]; store.set(SEEN_KEY, seen); })();
const STOP = new Set('a an the of to in on for and or but with at by from as is are was were be been it its this that after over into new says say said amid about than more up out vs not will can has have had his her their our your who what when how why'.split(' '));
const normTitle = t => String(t).toLowerCase().replace(/\s[-–—|]\s[^-–—|]{2,40}$/, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const fp = t => { const s = normTitle(t).slice(0, 90); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const toks = t => new Set(normTitle(t).split(' ').filter(w => w.length > 2 && !STOP.has(w)));
const jacc = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
const ageH = d => { const t = Date.parse(d); return isNaN(t) ? 24 : Math.max(0, (Date.now() - t) / 36e5); };
function cluster(items) {
  const groups = [];
  const byG = new Map();
  for (const it of items) {
    it.fp = fp(it.title); it.tk = toks(it.title);
    let g = it.cluster && byG.get(it.cluster);
    if (!g) g = groups.find(G => G.items.some(o => jacc(o.tk, it.tk) >= 0.42));
    if (!g) { g = { items: [] }; groups.push(g); }
    if (it.cluster) byG.set(it.cluster, g);
    if (!g.items.some(o => o.fp === it.fp && o.source === it.source)) g.items.push(it);
  }
  for (const g of groups) {
    g.items.sort((a, b) => ageH(a.date) - ageH(b.date));
    g.lead = g.items[0]; g.sources = new Set(g.items.map(i => i.source)).size;
    g.age = Math.min(...g.items.map(i => ageH(i.date)));
    g.isNew = g.items.some(i => !seen[i.fp]);
    g.score = (1 + Math.log(g.sources)) * Math.exp(-g.age / 8) * (g.isNew ? 1.6 : 1);
  }
  return groups.sort((a, b) => b.score - a.score);
}
const FORMULA = `RANK  = (1 + ln(outlets)) × e^(−age_h / 8) × (unseen ? 1.6 : 1)
STORY = headlines grouped by Google's own story clusters, then by title overlap (Jaccard ≥ 0.42 on key words)
SEEN  = a fingerprint of each normalised title, stored in this browser when you open a story,
        press "Mark all seen", or include it in an AI digest. Forgotten after 21 days.
DIGEST = only stories with at least one unseen headline go to the AI, plus your previous digest so it can say what changed.`;
function newsQuery() {
  const d = S.d; const lang = N.lang === 'local' ? (d.lang || 'EN').split(',')[0].trim().toLowerCase() : 'en';
  const topicWord = { top: '', politics: 'politics', economy: 'economy', security: 'military OR security', business: 'business', tech: 'technology', culture: 'culture' }[N.topic];
  const q = N.lang === 'local' && N.topic === 'top' ? '' : (d.n + (topicWord ? ' ' + topicWord : ''));
  return { gl: d.a2, hl: lang, q };
}
function newsSkeleton() {
  news.body.innerHTML = `
    <div class="bar">${seg('ntopic', [['top', 'Top'], ['politics', 'Politics'], ['economy', 'Economy'], ['security', 'Security'], ['business', 'Business'], ['tech', 'Tech'], ['culture', 'Culture']], N.topic, 'chips')}</div>
    <div class="bar">${seg('nlang', [['en', 'ENGLISH'], ['local', 'LOCAL EDITION']], N.lang)}
      <label class="check" title="Each automatic refresh costs one SerpAPI search">Auto<select id="nAuto" class="inp" style="width:auto;padding:2px 4px">${[[0, 'off'], [15, '15 min'], [30, '30 min'], [60, '1 h']].map(([v, l]) => `<option value="${v}" ${v == N.auto ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="grow"></span><button class="linkbtn" id="nFormulaBtn" type="button">How ranking works</button></div>
    <pre class="formula" id="nFormula" hidden>${esc(FORMULA)}</pre>
    <div class="bar"><span class="note grow" id="nStat"></span><button class="btn ghost" id="nSeen" type="button">Mark all seen</button><button class="btn" id="nDigest" type="button">AI digest</button></div>
    <div class="brief" id="nDigestBox" hidden></div>
    <div class="list" id="nList"></div>`;
  onSeg(news.body, 'ntopic', v => { N.topic = v; loadNews(); });
  onSeg(news.body, 'nlang', v => { N.lang = v; store.set('nlang', v); loadNews(); });
  $('#nAuto').onchange = e => { N.auto = +e.target.value; store.set('nauto', N.auto); armNewsTimer(); };
  $('#nFormulaBtn').onclick = () => { $('#nFormula').hidden = !$('#nFormula').hidden; };
  $('#nSeen').onclick = () => { markSeen(N.clusters.flatMap(g => g.items)); renderNews(); toast('All headlines marked as seen.'); };
  $('#nDigest').onclick = digest;
}
function armNewsTimer() { clearInterval(N.timer); if (N.auto) N.timer = setInterval(() => loadNews(true), N.auto * 60e3); }
news.onRefresh = () => loadNews(true);
function markSeen(items) { const t = Date.now(); for (const i of items) if (!seen[i.fp]) seen[i.fp] = t; store.set(SEEN_KEY, seen); }
async function loadNews(force) {
  const box = $('#nList'); const q = newsQuery();
  const msg = 'Pulling ' + (q.q || 'top stories') + ' from Google News' + (N.lang === 'local' ? ' (' + q.hl + '-' + q.gl + ' edition)' : '') + '…';
  if (box.querySelector('.story')) { box.classList.add('busy'); $('#nStat').textContent = msg; } else box.innerHTML = loading(msg);
  $('#nDigestBox').hidden = true;
  try {
    const r = await api('/api/news?' + new URLSearchParams({ ...q, ...(force ? { force: 1 } : {}) }));
    N.data = r; N.clusters = cluster(r.items); renderNews(); news.meta(cacheNote(r._cache)); news.body.scrollTop = 0;
  } catch (e) { box.innerHTML = errBox(e); $('#nStat').textContent = ''; } finally { box.classList.remove('busy'); }
}
function renderNews() {
  for (const g of N.clusters) g.isNew = g.items.some(i => !seen[i.fp]);
  const nNew = N.clusters.filter(g => g.isNew).length;
  $('#nStat').innerHTML = N.clusters.length ? `<b style="color:var(--fg)">${N.clusters.length}</b> stories · <b style="color:var(--accent)">${nNew}</b> new to you · ${N.data.items.length} headlines` : '';
  $('#nDigest').textContent = nNew ? (nNew > 14 ? `AI digest of top 14 new` : `AI digest of ${nNew} new`) : 'AI digest';
  $('#nDigest').title = nNew > 14 ? `The ${nNew} new stories are ranked; the top 14 go to the AI.` : '';
  $('#nDigest').disabled = !nNew;
  $('#nList').innerHTML = N.clusters.length ? N.clusters.map((g, gi) => `<article class="story ${g.isNew ? 'isnew' : ''}" data-g="${gi}">
      <div class="h"><a href="${esc(g.lead.link)}" target="_blank" rel="noopener" data-open="${gi}">${esc(g.lead.title)}</a>${g.isNew ? '<span class="tag new">NEW</span>' : ''}</div>
      <div class="s"><span>${esc(g.lead.source)}</span><span>${esc(ago(g.lead.date) || '')}</span>${g.sources > 1 ? `<button class="linkbtn" data-more="${gi}" type="button">${g.sources} outlets ▾</button>` : ''}</div>
      <div class="more" hidden>${g.items.slice(1).map(i => `<a href="${esc(i.link)}" target="_blank" rel="noopener" data-open="${gi}">${esc(i.source)} — ${esc(i.title)} <span class="dim">${esc(ago(i.date))}</span></a>`).join('')}</div></article>`).join('')
    : '<div class="empty">No headlines returned. Try another topic or switch edition.</div>';
}
$('#p-news').addEventListener('click', e => {
  const m = e.target.closest('[data-more]'); if (m) { const more = $('.more', m.closest('.story')); more.hidden = !more.hidden; return; }
  const o = e.target.closest('[data-open]'); if (o) { const g = N.clusters[+o.dataset.open]; markSeen(g.items); setTimeout(renderNews, 300); }
});
async function digest() {
  const fresh = N.clusters.filter(g => g.isNew).slice(0, 14);
  const key = 'digest-' + S.iso + '-' + N.topic;
  const prev = store.get(key, null);
  const payload = { task: 'digest', country: S.d.n, previous: prev?.text || '', stories: fresh.map(g => ({ n: g.sources, title: g.lead.title, source: [...new Set(g.items.map(i => i.source))].slice(0, 3).join(', '), age: ago(g.lead.date) || 'recent' })) };
  await runAI($('#nDigest'), $('#nDigestBox'), payload, (r, err) => {
    if (r) { store.set(key, { text: r.text, t: Date.now() }); markSeen(fresh.flatMap(g => g.items)); renderNews(); $('#nDigestBox').hidden = false; }
    else if (err?.code === 'no_ai') {
      $('#nDigestBox').innerHTML += `\n\nWithout AI, here are the new stories by rank:\n` + fresh.map((g, i) => `${i + 1}. ${esc(g.lead.title)} (${g.sources} outlet${g.sources > 1 ? 's' : ''})`).join('\n');
    }
  });
}

// =====================================================================
// PANEL 4 — SHIPS & AIRCRAFT (live tracking on the globe)
// =====================================================================
const trk = makePanel('track', 'Ships & Aircraft', 'right');
const SHIPTYPE = t => t == null ? 'Unknown' : t === 30 ? 'Fishing' : t === 35 ? 'Military' : t === 55 ? 'Law enforcement' : t === 51 ? 'Search & rescue' : (t === 31 || t === 32 || t === 52) ? 'Tug' : (t === 36 || t === 37) ? 'Pleasure' : t >= 60 && t <= 69 ? 'Passenger' : t >= 70 && t <= 79 ? 'Cargo' : t >= 80 && t <= 89 ? 'Tanker' : t >= 40 && t <= 49 ? 'High-speed craft' : t >= 50 && t <= 59 ? 'Service' : 'Other';
const NAV = { 0: 'Under way (engine)', 1: 'At anchor', 2: 'Not under command', 3: 'Restricted manoeuvring', 4: 'Constrained by draught', 5: 'Moored', 6: 'Aground', 7: 'Fishing', 8: 'Under way (sail)', 14: 'AIS-SART' };
const A = { kind: store.get('ackind', 'air'), scope: { air: 'reg', sea: 'flag' }, list: [], layer: store.get('aclayer', true), auto: store.get('acauto', true), filter: 'all', abroad: false, minAlt: 0, q: '', sort: 'alt', sel: null, trail: null, timer: null, loading: false, err: null, info: null };
trk.body.innerHTML = `
  <div class="bar">${seg('akind', [['air', 'AIRCRAFT'], ['sea', 'SHIPS']], A.kind)}<span class="grow"></span><button class="btn ghost" id="aRefresh" type="button">Refresh</button></div>
  <div class="bar" id="aScopeBar"></div>
  <div class="bar"><label class="check"><input type="checkbox" id="aLayer" ${A.layer ? 'checked' : ''}>Show on globe</label><label class="check"><input type="checkbox" id="aAuto" ${A.auto ? 'checked' : ''}>Live updates</label></div>
  <div class="tiles" id="aTiles"></div>
  <div id="aErr"></div>
  <div class="bar" id="aFilterBar"></div>
  <div class="form"><label id="aAltWrap">Min altitude <span id="aAltV">0 ft</span><input type="range" id="aAlt" min="0" max="40000" step="1000" value="0"></label><label id="aQLbl">Search<input id="aQ" placeholder="name, callsign, type"></label></div>
  <div id="aDetail"></div>
  <div class="view"><span class="eyebrow" id="aTypesTitle"></span><div class="typebars" id="aTypes"></div></div>
  <div class="bar"><span class="eyebrow grow" id="aListTitle"></span></div>
  <div id="aList" class="aclist"></div>
  <div class="bar"><button class="btn" id="aAI" type="button">Summarise military posture</button></div>
  <div class="brief" id="aAIBox" hidden></div>
  <p class="note" id="aNote"></p>`;
function trackChrome() {
  const air = A.kind === 'air';
  $('#aScopeBar').innerHTML = air ? seg('ascope', [['reg', 'REGISTERED HERE'], ['over', 'IN ITS AIRSPACE']], A.scope.air) : seg('ascope', [['flag', 'FLAGGED HERE'], ['near', 'NEAR ITS COAST']], A.scope.sea);
  onSeg(trk.body, 'ascope', v => { A.scope[A.kind] = v; A.sel = null; A.trail = null; A.list = []; A.abroad = false; trackChrome(); renderAc(); loadAircraft(); });
  $('#aFilterBar').innerHTML = (air ? seg('afilter', [['all', 'ALL'], ['mil', 'MILITARY'], ['civ', 'CIVIL']], A.filter) : seg('afilter', [['all', 'ALL'], ['Cargo', 'CARGO'], ['Tanker', 'TANKER'], ['Fishing', 'FISHING'], ['Passenger', 'PASSENGER'], ['Military', 'MILITARY']], A.filter))
    + `<label class="check"><input type="checkbox" id="aAbroad" ${A.abroad ? 'checked' : ''}>${air ? (A.scope.air === 'over' ? 'Foreign only' : 'Abroad only') : 'Moving only'}</label>`;
  onSeg(trk.body, 'afilter', v => { A.filter = v; renderAc(); });
  $('#aAbroad').onchange = e => { A.abroad = e.target.checked; renderAc(); };
  $('#aAltWrap').hidden = !air;
  $('#aQ').placeholder = air ? 'callsign, type, reg.' : 'ship name, MMSI, destination';
  $('#aAI').hidden = false;
  $('#aNote').innerHTML = air
    ? (A.scope.air === 'over' ? 'Every aircraft broadcasting inside this country’s borders right now, from any country.' : 'Aircraft whose transponder address was issued by this country (ICAO 24-bit block), shown anywhere in the world.') + ' Sources: OpenSky Network (all aircraft) and adsb.lol (military). Many military aircraft fly with transponders off, so counts are a floor.'
    : (A.scope.sea === 'near' ? 'Every ship broadcasting AIS in a box around this country, whatever its flag.' : 'Ships whose MMSI is registered to this country’s flag (the first three digits of the MMSI). Flag is not always the owner: many ships fly Panama, Liberia or Marshall Islands flags.') + ' Source: AISStream (shore-based receivers, so mid-ocean coverage is thin). Warships usually switch AIS off.';
}
onSeg(trk.body, 'akind', v => { A.kind = v; store.set('ackind', v); A.filter = 'all'; A.abroad = false; A.sel = null; A.trail = null; A.list = []; A.sort = v === 'air' ? 'alt' : 'spd'; trackChrome(); renderAc(); loadAircraft(); armAc(); });
$('#aLayer').onchange = e => { A.layer = e.target.checked; store.set('aclayer', A.layer); $('#legend').hidden = !A.layer; };
$('#aAuto').onchange = e => { A.auto = e.target.checked; store.set('acauto', A.auto); armAc(); };
$('#aRefresh').onclick = () => loadAircraft();
trk.onRefresh = () => loadAircraft();
$('#aAlt').oninput = e => { A.minAlt = +e.target.value; $('#aAltV').textContent = A.minAlt.toLocaleString('en-US') + ' ft'; renderAc(); };
$('#aQ').oninput = e => { A.q = e.target.value.trim().toUpperCase(); renderAc(); };
function armAc() { clearInterval(A.timer); if (A.auto) A.timer = setInterval(() => { if (!document.hidden && !minimized.has('track')) loadAircraft(true); }, A.kind === 'sea' ? 30e3 : 60e3); }
function countryBox() {
  if (!S.f) return null; const [[w, s], [e, n]] = d3.geoBounds(S.f); const pad = A.kind === 'sea' ? 3 : 0.3;
  const W = w - pad < -180 ? w - pad + 360 : w - pad, E = e + pad > 180 ? e + pad - 360 : e + pad;
  return [W, Math.max(-90, s - pad), E, Math.min(90, n + pad)].map(v => +v.toFixed(2)).join(',');
}
function normShip(s) {
  const cat = SHIPTYPE(s.type);
  return { ...s, ship: true, hex: s.mmsi, callsign: s.cs, seen: s.t, cs: s.name || ('MMSI ' + s.mmsi), t: cat, mil: s.type === 35, gs: s.sog != null ? +(+s.sog).toFixed(1) : null, trk: s.hdg ?? (s.cog != null ? Math.round(s.cog) : null), gnd: (s.sog ?? 0) < 0.5, alt: null };
}
async function loadAircraft(quiet) {
  if (A.loading || !S.iso) return; A.loading = true; const iso = S.iso, kind = A.kind;
  if (!quiet) { if ($('#aList tr')) $('#aList').classList.add('busy'); else $('#aList').innerHTML = loading(kind === 'air' ? 'Loading live aircraft…' : 'Loading live ships…'); }
  try {
    const c = S.f?.c || [0, 0]; const scope = A.scope[kind]; const box = countryBox();
    const qs = new URLSearchParams({ cc: S.d.a2, lat: c[1], lon: c[0], mode: scope, ...(box && (scope === 'over' || scope === 'near') ? { bbox: box } : {}) });
    const r = await api((kind === 'air' ? '/api/aircraft?' : '/api/ships?') + qs);
    if (iso !== S.iso || kind !== A.kind) return;
    A.info = r;
    if (kind === 'air') {
      A.list = r.list;
      if (r.mode === 'over' && S.f) A.list = A.list.filter(a => d3.geoContains(S.f, [a.lon, a.lat]));
      for (const a of A.list) { a.abroad = r.mode === 'over' ? a.cc !== S.d.a2 : (S.f ? !d3.geoContains(S.f, [a.lon, a.lat]) : false); }
      A.err = r.errors?.length ? r.errors.join(' ') : null;
      trk.meta((r.sample ? 'sample data · ' : '') + 'updated ' + ago(Math.max(r.osAt || 0, r.milAt || 0) || Date.now()) + (r.stale ? ' · stale' : ''));
    } else {
      A.list = r.list.map(normShip); for (const s of A.list) s.abroad = !s.gnd;
      A.err = r.error && !r.list.length ? r.error : null;
      trk.meta((r.sample ? 'sample data · ' : '') + (r.state === 'live' ? `live · ${(r.tracked || 0).toLocaleString('en-US')} ships worldwide` : r.state));
    }
    if (A.sel) { if (!A.list.find(a => a.hex === A.sel)) { A.sel = null; A.trail = null; } else loadTrail(); }
    renderAc();
  } catch (e) { $('#aList').innerHTML = errBox(e); } finally { A.loading = false; $('#aList').classList.remove('busy'); }
}
function acFiltered() {
  const air = A.kind === 'air';
  return A.list.filter(a => (A.filter === 'all' || (air ? (A.filter === 'mil') === !!a.mil : a.t === A.filter)) && (!A.abroad || a.abroad) && (!air || A.minAlt === 0 || (a.alt || 0) >= A.minAlt)
    && (!A.q || [a.cs, a.t, a.r, a.hex, a.dest, a.flag].some(v => String(v || '').toUpperCase().includes(A.q))));
}
function renderAc() {
  const air = A.kind === 'air', L = A.list;
  const tiles = air ? [['Airborne', L.filter(a => !a.gnd).length], ['Military', L.filter(a => a.mil).length, 'down'], ['On ground', L.filter(a => a.gnd).length], [A.scope.air === 'over' ? 'Foreign' : 'Abroad', L.filter(a => a.abroad).length]]
    : [['Under way', L.filter(a => !a.gnd).length], ['Military', L.filter(a => a.mil).length, 'down'], ['Stopped', L.filter(a => a.gnd).length], ['Cargo + tanker', L.filter(a => a.t === 'Cargo' || a.t === 'Tanker').length]];
  $('#aTiles').innerHTML = tiles.map(([l, n, c]) => `<div><small>${l}</small><strong class="${c || ''}">${n}</strong></div>`).join('');
  let warn = A.err ? errBox(A.err) : '';
  if (!air && A.info?.warming) warn += `<p class="note">Collecting ships: connected ${ago(A.info.since)}, ${(A.info.tracked || 0).toLocaleString('en-US')} seen worldwide so far. The list fills in over the first few minutes; names arrive more slowly than positions.</p>`;
  $('#aErr').innerHTML = warn;
  const groups = air ? d3.rollups(L.filter(a => a.mil && a.t), v => v.length, a => a.t) : d3.rollups(L, v => v.length, a => a.t);
  const types = groups.sort((a, b) => b[1] - a[1]).slice(0, 7); const mx = types[0]?.[1] || 1;
  $('#aTypesTitle').textContent = air ? 'Military types visible' : 'Ship types';
  $('#aTypes').innerHTML = types.length ? types.map(([t, n]) => `<div><span>${esc(t)}</span><b style="width:${n / mx * 100}%;${!air && t !== 'Military' ? 'background:var(--ok)' : ''}"></b><span class="dim">${n}</span></div>`).join('') : `<p class="note">${air ? 'No military aircraft with a known type are broadcasting right now.' : 'No ships yet.'}</p>`;
  const list = acFiltered();
  const key = { alt: a => -(a.alt || 0), spd: a => -(a.gs || 0), cs: a => a.cs || 'zzz' }[A.sort] || (a => 0);
  list.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
  $('#aListTitle').textContent = `${air ? 'Aircraft' : 'Ships'} · ${list.length} shown`;
  $('#legend').innerHTML = air ? `<span><i class="dot mil"></i>Military</span><span><i class="dot civ"></i>Civil</span><span>${A.layer ? list.length + ' on globe' : ''}</span>` : `<span><i class="dot mil"></i>Military</span><span><i class="dot" style="background:var(--ok)"></i>Ships</span><span>${A.layer ? list.length + ' on globe' : ''}</span>`;
  const rows = list.slice(0, 250);
  const head = air ? `<th><button class="linkbtn" data-sort="cs">Callsign</button></th><th>Type</th><th class="n"><button class="linkbtn" data-sort="alt">Alt ft</button></th><th class="n"><button class="linkbtn" data-sort="spd">Kt</button></th><th></th>`
    : `<th><button class="linkbtn" data-sort="cs">Ship</button></th><th>Type</th><th class="n"><button class="linkbtn" data-sort="spd">Kn</button></th><th>To</th><th></th>`;
  const row = a => air ? `<td class="mono">${esc(a.cs || a.hex)}</td><td>${esc(a.t || '')}</td><td class="n">${a.gnd ? 'GND' : a.alt != null ? a.alt.toLocaleString('en-US') : '—'}</td><td class="n">${a.gs ?? '—'}</td><td>${a.mil ? '<span class="tag warn">MIL</span>' : ''}${a.abroad ? ` <span class="tag info">${A.scope.air === 'over' ? esc(a.cc || '?') : 'ABROAD'}</span>` : ''}</td>`
    : `<td>${esc(a.cs)}</td><td>${esc(a.t)}</td><td class="n">${a.gs ?? '—'}</td><td class="dim" style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.dest || '')}</td><td>${a.mil ? '<span class="tag warn">MIL</span>' : ''}${A.scope.sea === 'near' && a.flag ? ` <span class="tag n">${esc(a.flag)}</span>` : ''}</td>`;
  const empty = !A.list.length ? (air ? 'No aircraft found for this country right now.' : (A.info?.state === 'live' ? 'No ships found yet. Give it a minute after connecting.' : 'No ships yet.')) : 'Nothing matches these filters.';
  $('#aList').innerHTML = list.length ? `<table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows.map(a => `<tr class="click ${a.hex === A.sel ? 'on' : ''}" data-hex="${esc(a.hex)}">${row(a)}</tr>`).join('')}</tbody></table>${list.length > rows.length ? `<p class="note">Showing 250 of ${list.length}. Narrow with the filters.</p>` : ''}` : `<div class="empty">${empty}</div>`;
  $$('#aList tr[data-hex]').forEach(tr => tr.onclick = () => selectAc(tr.dataset.hex, true));
  $$('#aList [data-sort]').forEach(b => b.onclick = () => { A.sort = b.dataset.sort; renderAc(); });
  renderAcDetail();
}
function renderAcDetail() {
  const a = A.list.find(x => x.hex === A.sel);
  if (!a) { $('#aDetail').innerHTML = ''; return; }
  let rows, links, tag;
  if (a.ship) {
    tag = a.mil ? '<span class="tag warn">MILITARY</span>' : `<span class="tag ok">${esc(a.t.toUpperCase())}</span>`;
    rows = [['MMSI', a.mmsi], ['IMO', a.imo], ['Call sign', a.callsign], ['Flag', a.flag ? (Object.values(DATA).find(d => d.a2 === a.flag)?.n || a.flag) : null], ['Type', a.t + (a.type != null ? ' (' + a.type + ')' : '')], ['Status', NAV[a.nav]], ['Speed', a.gs != null ? a.gs + ' kn' : null], ['Course', a.cog != null ? Math.round(a.cog) + '°' : null], ['Heading', a.hdg != null ? a.hdg + '°' : null], ['Destination', a.dest], ['Length', a.len ? a.len + ' m' : null], ['Position', a.lat.toFixed(3) + ', ' + a.lon.toFixed(3)], ['Last report', a.seen ? ago(a.seen) : null], ['Trail points', A.trail ? A.trail.length : '…']];
    rows = rows.filter(r => r[1]);
    links = `<a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${enc(a.mmsi)}" target="_blank" rel="noopener">MarineTraffic</a><a href="https://www.vesselfinder.com/vessels/details/${enc(a.imo || a.mmsi)}" target="_blank" rel="noopener">VesselFinder</a>`;
  } else {
    const em = { '7500': 'HIJACK', '7600': 'RADIO FAILURE', '7700': 'EMERGENCY' }[a.sq];
    tag = (a.mil ? '<span class="tag warn">MILITARY</span>' : '<span class="tag info">CIVIL</span>') + (a.abroad && A.scope.air !== 'over' ? '<span class="tag info">ABROAD</span>' : '');
    rows = [['Hex', a.hex], ['Registered in', a.cc ? (Object.values(DATA).find(d => d.a2 === a.cc)?.n || a.cc) : null], ['Registration', a.r], ['Type', [a.t, a.desc].filter(Boolean).join(' · ')], ['Operator', a.own], ['Altitude', a.gnd ? 'On ground' : a.alt != null ? a.alt.toLocaleString('en-US') + ' ft' : null], ['Ground speed', a.gs != null ? a.gs + ' kt' : null], ['Heading', a.trk != null ? a.trk + '°' : null], ['Vertical rate', a.vr != null ? a.vr + ' ft/min' : null], ['Squawk', a.sq ? a.sq + (em ? ' · ' + em : '') : null, em ? 'sq-em' : ''], ['Position', a.lat.toFixed(3) + ', ' + a.lon.toFixed(3)], ['Source', a.src], ['Trail points', A.trail ? A.trail.length : '…']].filter(r => r[1]);
    links = `<a href="https://globe.adsbexchange.com/?icao=${enc(a.hex)}" target="_blank" rel="noopener">ADS-B Exchange</a>${a.cs ? `<a href="https://www.flightradar24.com/${enc(a.cs)}" target="_blank" rel="noopener">Flightradar24</a>` : ''}<a href="https://adsb.lol/?icao=${enc(a.hex)}" target="_blank" rel="noopener">adsb.lol</a>`;
  }
  $('#aDetail').innerHTML = `<div class="detail"><div class="bar"><b class="mono" style="font-size:15px">${esc(a.cs || a.hex)}</b>${tag}<span class="grow"></span><button class="ic" id="aClose" title="Close">${ICON.close}</button></div>
    <div class="stats">${rows.map(([k, v, c]) => `<div class="row"><span>${k}</span><span class="${c || ''}">${esc(v)}</span></div>`).join('')}</div><div class="links">${links}</div></div>`;
  $('#aClose').onclick = () => { A.sel = null; A.trail = null; renderAc(); };
}
async function selectAc(hex, fly) {
  A.sel = hex; A.trail = null; renderAc();
  const a = A.list.find(x => x.hex === hex); if (fly && a) { flyTo([a.lon, a.lat], Math.max(G.zoom, 3)); lift(); if (!G.over) sink(6000); }
  loadTrail();
}
async function loadTrail() { if (!A.sel) return; const sel = A.sel, key = A.kind === 'sea' ? 's' + sel : sel; try { const r = await api('/api/aircraft/trail?hex=' + enc(key)); if (A.sel === sel) { A.trail = r.trail; renderAcDetail(); } } catch (e) {} }
$('#aAI').onclick = () => {
  const L = A.list; const pool = A.kind === 'air' ? L.filter(a => a.mil && a.t) : L.filter(a => a.mil);
  const types = d3.rollups(pool, v => v.length, a => a.t).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => t + ' ×' + n).join(', ');
  runAI($('#aAI'), $('#aAIBox'), { task: 'posture', country: S.d.n, total: A.kind === 'air' ? L.filter(a => !a.gnd).length : 0, mil: L.filter(a => a.mil).length, abroad: L.filter(a => a.abroad).length, types: (A.kind === 'sea' ? 'ships: ' : '') + types });
};
trackChrome();

// =====================================================================
// GLOBE
// =====================================================================
const stage = $('#stage'), orb = $('#orb'), canvas = $('#globe'), ctx = canvas.getContext('2d'), tip = $('#tip');
const proj = d3.geoOrthographic().clipAngle(90).precision(.4);
const gpath = d3.geoPath(proj, ctx);
const grat = d3.geoGraticule10();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = { W: 0, dpr: 1, rot: [-20, -20, 0], zoom: 1, base: 1, hover: null, hoverAc: null, auto: !reduce, last: 0, fly: null, lifted: false, sinkT: null, down: null, moved: 0 };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = { ocean: css('--ocean'), land: css('--land'), hover: css('--land-hover'), border: css('--border'), grat: css('--grat'), accent: css('--accent'), line: css('--line-2'), info: css('--info'), warn: css('--warn'), fg: css('--fg'), ok: css('--ok') };
function resize() {
  const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
  const size = Math.round(Math.max(200, Math.min(r.width * .96, r.height * .98, 900)));
  orb.style.setProperty('--lift', (-(r.height - size) / 2) + 'px');
  if (Math.abs(size - G.W) < 2) return;
  orb.style.width = orb.style.height = size + 'px';
  orb.style.setProperty('--rest', (size * .34) + 'px'); orb.style.setProperty('--lift', (-(r.height - size) / 2) + 'px');
  G.W = size; G.dpr = Math.min(1.5, devicePixelRatio || 1, 1400 / size); canvas.width = Math.round(size * G.dpr); canvas.height = Math.round(size * G.dpr); G.dirty = true;
  G.base = size / 2 * .94; proj.translate([size / 2, size / 2]);
}
new ResizeObserver(resize).observe(stage);
const visible = ll => d3.geoDistance(ll, [-G.rot[0], -G.rot[1]]) < Math.PI / 2;
function draw() {
  if (!G.W) return;
  proj.rotate(G.rot).scale(G.base * G.zoom);
  const W = G.W; ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0); ctx.clearRect(0, 0, W, W);
  const [cx, cy] = proj.translate(), r = proj.scale();
  if (G.zoom < 1.3) { const g = ctx.createRadialGradient(cx, cy, r * .95, cx, cy, r * 1.06); g.addColorStop(0, 'rgba(230,162,60,.22)'); g.addColorStop(1, 'rgba(230,162,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.06, 0, 2 * Math.PI); ctx.fill(); }
  ctx.save(); ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 1, 0, 2 * Math.PI); ctx.clip();
  ctx.beginPath(); gpath({ type: 'Sphere' }); ctx.fillStyle = C.ocean; ctx.fill();
  ctx.beginPath(); gpath(grat); ctx.strokeStyle = C.grat; ctx.lineWidth = .6; ctx.stroke();
  ctx.beginPath(); features.forEach(f => gpath(f)); ctx.fillStyle = C.land; ctx.fill();
  if (G.lifted && G.hover && G.hover !== S.f) { ctx.beginPath(); gpath(G.hover); ctx.fillStyle = C.hover; ctx.fill(); }
  if (S.f) { ctx.beginPath(); gpath(S.f); ctx.fillStyle = 'rgba(230,162,60,.26)'; ctx.fill(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.3; ctx.stroke(); }
  ctx.beginPath(); gpath(borders); ctx.strokeStyle = C.border; ctx.lineWidth = .5; ctx.stroke();
  // aircraft
  G.pts = [];
  if (A.layer && A.list.length) {
    const list = acFiltered();
    if (A.trail && A.trail.length > 1) { ctx.beginPath(); gpath({ type: 'LineString', coordinates: A.trail.map(p => [p[2], p[1]]) }); ctx.strokeStyle = C.fg; ctx.globalAlpha = .7; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    for (const a of list) {
      const ll = [a.lon, a.lat]; if (!visible(ll)) continue; const p = proj(ll); if (!p) continue;
      G.pts.push([p[0], p[1], a]);
      const sel = a.hex === A.sel, hov = a === G.hoverAc;
      ctx.fillStyle = a.mil ? C.warn : a.ship ? C.ok : C.info; ctx.globalAlpha = a.gnd ? .45 : .95;
      if (a.ship && !(sel || hov)) { const r = G.zoom >= 2.5 ? 3 : 2; ctx.beginPath(); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath(); ctx.fill(); continue; }
      if (sel || hov || G.zoom >= 2.5) { // heading arrow
        const s = sel ? 7 : 5, th = ((a.trk || 0) - 90) * Math.PI / 180;
        ctx.beginPath(); ctx.moveTo(p[0] + Math.cos(th) * s, p[1] + Math.sin(th) * s); ctx.lineTo(p[0] + Math.cos(th + 2.5) * s * .8, p[1] + Math.sin(th + 2.5) * s * .8); ctx.lineTo(p[0] + Math.cos(th - 2.5) * s * .8, p[1] + Math.sin(th - 2.5) * s * .8); ctx.closePath(); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(p[0], p[1], a.mil ? 2.4 : 1.7, 0, 2 * Math.PI); ctx.fill(); }
      if (sel) { ctx.globalAlpha = 1; ctx.strokeStyle = C.fg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 2 * Math.PI); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  if (S.f && !(A.layer && A.list.length)) { const p = proj(S.f.c); if (p && visible(S.f.c)) { const t = (performance.now() % 1800) / 1800; ctx.beginPath(); ctx.arc(p[0], p[1], 3 + t * 14, 0, 2 * Math.PI); ctx.strokeStyle = `rgba(230,162,60,${1 - t})`; ctx.lineWidth = 1.5; ctx.stroke(); ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 2 * Math.PI); ctx.fillStyle = C.accent; ctx.fill(); } }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, Math.min(r, W / 2 - 1), 0, 2 * Math.PI); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
  $('#lat').textContent = (-G.rot[1]).toFixed(1); $('#lon').textContent = (((-G.rot[0] + 540) % 360) - 180).toFixed(1); $('#zoomv').textContent = G.zoom.toFixed(1) + '×';
}
const local = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * G.W / b.width, (e.clientY - b.top) * G.W / b.height]; };
function pickCountry(x, y) { const ll = proj.invert([x, y]); if (!ll || !visible(ll)) return null; for (const f of features) if (d3.geoContains(f, ll)) return f; return null; }
function pickAc(x, y) { let best = null, bd = 8 * 8; for (const [px, py, a] of G.pts || []) { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = a; } } return best; }
function lift() { clearTimeout(G.sinkT); if (G.lifted) return; G.lifted = true; stage.classList.add('lifted'); G.last = performance.now(); }
function sink(delay = 600) { clearTimeout(G.sinkT); G.sinkT = setTimeout(() => { if (G.down) return; G.lifted = false; stage.classList.remove('lifted'); G.hover = null; G.hoverAc = null; tip.hidden = true; }, delay); }
canvas.addEventListener('pointerenter', e => { G.over = true; if (e.pointerType === 'mouse') lift(); });
canvas.addEventListener('pointerleave', e => { G.over = false; if (!G.down) { G.hover = null; G.hoverAc = null; tip.hidden = true; if (e.pointerType === 'mouse') sink(); } });
canvas.addEventListener('focus', lift); canvas.addEventListener('blur', () => sink(300));
stage.addEventListener('pointerdown', e => { if (e.target === stage && e.pointerType !== 'mouse') sink(0); });
canvas.addEventListener('pointerdown', e => { if (!G.lifted) { lift(); return; } G.down = { x: e.clientX, y: e.clientY, rot: G.rot.slice() }; G.moved = 0; canvas.setPointerCapture(e.pointerId); G.fly = null; G.last = performance.now(); });
canvas.addEventListener('pointermove', e => {
  if (!G.lifted) return; const [x, y] = local(e);
  if (G.down) {
    const dx = e.clientX - G.down.x, dy = e.clientY - G.down.y; G.moved = Math.max(G.moved, Math.hypot(dx, dy));
    if (G.moved > 3) { canvas.classList.add('dragging'); const k = 90 / proj.scale() * (G.W / canvas.getBoundingClientRect().width); G.rot = [G.down.rot[0] + dx * k, Math.max(-85, Math.min(85, G.down.rot[1] - dy * k)), 0]; tip.hidden = true; }
    G.last = performance.now(); return;
  }
  const ac = A.layer ? pickAc(x, y) : null; G.hoverAc = ac;
  const f = ac ? null : pickCountry(x, y); G.hover = f; canvas.classList.toggle('hovering', !!(f || ac));
  if ((f || ac) && e.pointerType === 'mouse') { const sb = stage.getBoundingClientRect(); const d = f?.iso3 && DATA[f.iso3]; tip.textContent = ac ? (ac.ship ? `${ac.cs} · ${ac.t} · ${ac.gs ?? 0} kn${ac.dest ? ' → ' + ac.dest : ''}` : `${ac.cs || ac.hex}${ac.t ? ' · ' + ac.t : ''} · ${ac.gnd ? 'ground' : (ac.alt || 0).toLocaleString('en-US') + ' ft'}`) : d ? d.n : (f.properties.name || ''); tip.style.left = (e.clientX - sb.left) + 'px'; tip.style.top = (e.clientY - sb.top) + 'px'; tip.hidden = false; } else tip.hidden = true;
});
canvas.addEventListener('pointerup', e => {
  canvas.classList.remove('dragging');
  if (G.down && G.moved <= 3) { const [x, y] = local(e); const ac = A.layer ? pickAc(x, y) : null; if (ac) selectAc(ac.hex, false); else { const f = pickCountry(x, y); if (f && f.iso3) select(f.iso3); } }
  G.down = null; G.last = performance.now();
});
canvas.addEventListener('wheel', e => { if (!G.lifted) return; e.preventDefault(); G.zoom = Math.max(1, Math.min(12, G.zoom * Math.exp(-e.deltaY * 0.0015))); G.last = performance.now(); }, { passive: false });
canvas.addEventListener('dblclick', () => { G.zoom = Math.min(12, G.zoom * 1.8); });
canvas.addEventListener('keydown', e => {
  const s = 6 / G.zoom; const m = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  if (m) { e.preventDefault(); lift(); G.fly = null; G.rot = [G.rot[0] + m[0], Math.max(-85, Math.min(85, G.rot[1] + m[1])), 0]; G.last = performance.now(); }
  if (e.key === '+' || e.key === '=') G.zoom = Math.min(12, G.zoom * 1.25); if (e.key === '-') G.zoom = Math.max(1, G.zoom / 1.25);
});
$('#spin').setAttribute('aria-pressed', G.auto);
$('#spin').onclick = () => { G.auto = !G.auto; $('#spin').setAttribute('aria-pressed', G.auto); };
$('#zoomReset').onclick = () => { if (S.f) flyTo(S.f.c, 1); else G.zoom = 1; };
function flyTo(c, zoom) { const from = G.rot.slice(), to = [-c[0], -c[1], 0]; let d = to[0] - from[0]; d = ((d + 540) % 360) - 180; to[0] = from[0] + d; G.fly = { i: d3.interpolate(from, to), z: d3.interpolate(G.zoom, zoom ?? G.zoom), t0: performance.now(), dur: reduce ? 1 : 1100 }; }
let lastDraw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const busy = G.fly || G.down || G.lifted;
  if (!busy && now - lastDraw < 33) return;
  lastDraw = now;
  if (G.fly) { const t = Math.min(1, (now - G.fly.t0) / G.fly.dur), k = d3.easeCubicInOut(t); G.rot = G.fly.i(k); G.zoom = G.fly.z(k); if (t >= 1) { G.fly = null; G.last = now; } }
  else if (G.auto && !G.down && (!G.lifted || now - G.last > 5000) && G.zoom < 1.5) G.rot[0] += G.lifted ? .04 : .08;
  draw();
}

// =====================================================================
// COUNTRY SELECTION
// =====================================================================
function select(iso) {
  const d = DATA[iso]; if (!d) return;
  S.iso = iso; S.d = d; S.f = featByIso[iso] || null; store.set('last', iso);
  if (S.f) flyTo(S.f.c, 1);
  $('#country').innerHTML = `<h1>${esc(d.n)}</h1><span class="eyebrow">${iso} · ${esc(d.cont)}</span><div class="facts"><span>Capital <b>${esc(d.cap || '—')}</b></span><span>Pop. <b>${d.p ? fmtPop(d.p[1]) : '—'}</b></span><span>Currency <b>${esc(d.cur || '—')}</b></span><span>Languages <b>${esc(d.lang || '—')}</b></span></div>`;
  document.title = d.n + ' · Global Watch';
  Object.values(panels).forEach(p => { p.body.scrollTop = 0; });
  // economy & markets
  renderEco(); M.loaded = ''; fin.onTab(fin.tab);
  // travel
  const ex = EXTRA[iso]; $('#fTo').value = ex ? ex[0] : ''; $('#fTo').placeholder = ex ? '' : 'Airport code'; fGoogleLink();
  $('#fRes').innerHTML = `<div class="empty">${ex ? `Arrive at <b>${esc(ex[1])}</b>. ` : `Enter the airport code for ${esc(d.n)}. `}Press <b>Find flights</b> for live Google Flights fares (1 search, cached 6 h).</div>`; F.data = null; F.last = null;
  $('#hCity').value = d.cap || d.n; $('#hRes').innerHTML = `<div class="empty">Press <b>Find hotels</b> for live Google Hotels prices in ${esc(d.cap || d.n)}.</div>`; H.last = null;
  $('#dCity').value = d.cap || d.n; D.cat = ''; $$('#p-travel [data-seg="dcat"] button').forEach(b => b.setAttribute('aria-pressed', 'false')); $('#dRes').innerHTML = `<div class="empty">Choose a category to pull real places in ${esc(d.cap || d.n)} from Google Maps.</div>`; $('#dPlan').disabled = true; $('#dPlanBox').hidden = true;
  ['fly', 'hotel', 'do'].forEach(t => setTMeta(t, ''));
  // news
  if (!$('#nList')) newsSkeleton(); $('#nDigestBox').hidden = true; loadNews();
  // tracking
  A.sel = null; A.trail = null; $('#aAIBox').hidden = true; A.loading = false; loadAircraft();
}

// ================= search box =================
const q = $('#q'), res = $('#results');
const clist = Object.entries(DATA).map(([k, v]) => ({ k, n: v.n })).sort((a, b) => a.n.localeCompare(b.n));
let hits = [], hi = 0;
function showRes() { const t = q.value.trim().toLowerCase(); if (!t) { res.hidden = true; return; } hits = clist.filter(x => x.n.toLowerCase().includes(t) || x.k.toLowerCase() === t).slice(0, 8); hi = 0; res.innerHTML = hits.length ? hits.map((h, i) => `<button data-k="${h.k}" class="${i === 0 ? 'on' : ''}">${esc(h.n)}<small>${h.k}</small></button>`).join('') : '<p class="note" style="padding:8px 10px">No country matches that name.</p>'; res.hidden = false; }
q.addEventListener('input', showRes);
q.addEventListener('keydown', e => { if (res.hidden || !hits.length) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; [...res.children].forEach((b, i) => b.classList.toggle('on', i === hi)); } if (e.key === 'Enter') choose(hits[hi].k); if (e.key === 'Escape') res.hidden = true; });
res.addEventListener('click', e => { const b = e.target.closest('button'); if (b) choose(b.dataset.k); });
function choose(k) { q.value = ''; res.hidden = true; select(k); }
document.addEventListener('click', e => { if (!e.target.closest('.search')) res.hidden = true; });

// ================= boot =================
setInterval(() => { $('#clock').textContent = new Date().toISOString().slice(11, 19) + ' UTC'; }, 1000);
setInterval(() => refreshStatus(true), 120e3);
$('#legend').hidden = !A.layer;
layout(); renderDock(); resize(); refreshStatus(true); armAc(); armNewsTimer();
let start = store.get('last', 'JPN'); if (!DATA[start]) start = 'JPN';
if (featByIso[start]) { const c = featByIso[start].c; G.rot = [-c[0] + 25, -c[1], 0]; }
select(start);
requestAnimationFrame(frame);
