'use strict';
/* Finance panel: Economy (World Bank) · Outlook (IMF forecasts) · Markets (Google Finance stock viewer) · Currency (FX). */
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
  DNK: ['CPH', 'Copenhagen Kastrup', 'Nasdaq Copenhagen', 'OMX Copenhagen 25'], FIN: ['HEL', 'Helsinki-Vantaa', 'Nasdaq Helsinki', 'OMX Helsinki 25'], IRN: ['IKA', 'Tehran Imam Khomeini', 'Tehran Stock Exchange', 'TEDPIX'], QAT: ['DOH', 'Doha Hamad', 'Qatar Stock Exchange', 'QE General'], MAR: ['CMN', 'Casablanca Mohammed V', 'Casablanca SE', 'MASI']
};
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
  NLD: [['AEX:INDEXEURO', 'AEX'], ['ASML:AMS', 'ASML'], ['INGA:AMS', 'ING']], ESP: [['IBEX:INDEXBME', 'IBEX 35'], ['SAN:BME', 'Santander'], ['IBE:BME', 'Iberdrola'], ['ITX:BME', 'Inditex']],
  ITA: [['FTSEMIB:INDEXFTSE', 'FTSE MIB'], ['ENI:BIT', 'Eni'], ['ISP:BIT', 'Intesa'], ['RACE:BIT', 'Ferrari']], SAU: [['TASI:TADAWUL', 'TASI'], ['2222:TADAWUL', 'Saudi Aramco']], SGP: [['STI:INDEXSTI', 'Straits Times'], ['D05:SGX', 'DBS']],
  SWE: [['OMXS30:INDEXOMX', 'OMX 30'], ['VOLV-B:STO', 'Volvo'], ['ERIC-B:STO', 'Ericsson']], MEX: [['ME:INDEXBMV', 'IPC'], ['AMXB:BMV', 'América Movil']], TUR: [['XU100:IST', 'BIST 100']], ISR: [['TA35:TLV', 'TA-35'], ['TEVA:TLV', 'Teva']], ZAF: [['J203:JSE', 'All Share'], ['NPN:JSE', 'Naspers']]
};
const regionOf = d => /America/.test(d.cont) ? 'americas' : /Europe|Africa/.test(d.cont) || ['ISR', 'SAU', 'ARE', 'QAT', 'TUR', 'IRN', 'IRQ', 'JOR', 'KWT', 'BHR', 'OMN', 'LBN', 'SYR', 'YEM'].includes(S.iso) ? 'europe-middle-east-africa' : 'asia-pacific';
const gdpRank = Object.entries(DATA).filter(([, d]) => d.g.length).sort((a, b) => b[1].g.at(-1)[1] - a[1].g.at(-1)[1]).map(([k]) => k);
const moveSigned = m => !m ? null : (m.movement === 'Down' ? -1 : 1) * (+m.percentage || 0);

const fin = makePanel('fin', 'Finance', [['eco', 'Economy'], ['out', 'Outlook'], ['mkt', 'Markets'], ['fx', 'Currency']], { short: 'Finance' });
fin.body.innerHTML = `<div class="view" id="ecoView"></div><div class="view" id="outView" hidden></div><div class="view" id="mktView" hidden></div><div class="view" id="fxView" hidden></div>`;
const F$ = { econ: null, econFor: null, fx: null, fxFor: null };
fin.onTab = v => { for (const [t, id] of [['eco', 'ecoView'], ['out', 'outView'], ['mkt', 'mktView'], ['fx', 'fxView']]) $('#' + id).hidden = v !== t; finShow(); };
fin.onShow = () => fin.onTab(fin.tab);
fin.onRefresh = () => { if (fin.tab === 'mkt') loadQuote(true); else if (fin.tab === 'fx') { F$.fxFor = null; finShow(); } else { F$.econFor = null; finShow(); } };
fin.onCountry = () => { M.loaded = ''; F$.econFor = null; F$.fxFor = null; renderEco(); finShow(); };
function finShow() { if (!S.iso || !isOpen('fin')) return; const t = fin.tab; if (t === 'eco') loadEcon().then(renderEcoExtra); if (t === 'out') loadEcon().then(renderOutlook); if (t === 'mkt') ensureMarkets(); if (t === 'fx') loadFx(); }
async function loadEcon() { if (F$.econFor === S.iso) return F$.econ; const iso = S.iso; const r = await api('/api/econ?iso=' + iso).catch(e => ({ error: e.message })); if (iso !== S.iso) return null; F$.econ = r; F$.econFor = iso; return r; }

// ---------- Economy ----------
let ecoMetric = 'gdp', ecoCompare = '';
function renderEco() {
  if (!S.d) { $('#ecoView').innerHTML = '<div class="empty">Pick a country on the globe to see its economy.</div>'; return; }
  const d = S.d, iso = S.iso, g = d.g, i = d.i; const lastG = g.at(-1), lastI = i.at(-1);
  const perCap = lastG && d.p ? Math.round(lastG[1] * 1e6 / d.p[1]) : null;
  const growth = g.length > 1 ? (g.at(-1)[1] / g.at(-2)[1] - 1) * 100 : null;
  const cagr = g.length > 5 ? (Math.pow(g.at(-1)[1] / g.at(-6)[1], 1 / 5) - 1) * 100 : null;
  const rank = gdpRank.indexOf(iso);
  const opts = Object.entries(DATA).filter(([k, v]) => k !== iso && v.g.length > 2).sort((a, b) => a[1].n.localeCompare(b[1].n));
  $('#ecoView').innerHTML = `
    <div class="kv">
      <div><small>GDP</small><strong data-n="${lastG ? lastG[1] : ''}" data-f="money">${lastG ? fmtMoney(lastG[1]) : '—'}</strong><em>${lastG ? lastG[0] : 'n/a'}${rank >= 0 ? ' · #' + (rank + 1) + ' of ' + gdpRank.length : ''}</em></div>
      <div><small>GDP / person</small><strong data-n="${perCap ?? ''}" data-f="usd">${perCap ? '$' + perCap.toLocaleString('en-US') : '—'}</strong><em>current USD</em></div>
      <div><small>Nominal chg</small><strong class="${growth == null ? '' : growth >= 0 ? 'up' : 'down'}">${growth == null ? '—' : (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%'}</strong><em>vs prior year</em></div>
      <div><small>5-yr CAGR</small><strong class="${cagr == null ? '' : cagr >= 0 ? 'up' : 'down'}">${cagr == null ? '—' : (cagr >= 0 ? '+' : '') + cagr.toFixed(1) + '%'}</strong><em>nominal USD</em></div>
      <div><small>Inflation</small><strong>${lastI ? lastI[1] + '%' : '—'}</strong><em>${lastI ? 'CPI ' + lastI[0] : 'n/a'}</em></div>
      <div><small>Population</small><strong>${d.p ? fmtPop(d.p[1]) : '—'}</strong><em>${d.p ? d.p[0] : ''}</em></div>
    </div>
    <div class="bar">${seg('emetric', [['gdp', 'GDP'], ['inf', 'INFLATION']], ecoMetric)}
      <label class="sr" for="ecoCmp">Compare with</label><select id="ecoCmp" class="inp grow" style="flex:1;min-width:120px"><option value="">Compare with…</option>${opts.map(([k, v]) => `<option value="${k}" ${k === ecoCompare ? 'selected' : ''}>${esc(v.n)}</option>`).join('')}</select></div>
    <div class="readout" id="ecoRead"></div><div id="ecoChart"></div>
    <span class="eyebrow">More indicators · World Bank</span><div class="minis" id="ecoMore">${skeleton(3)}</div>
    <p class="note">Sources: World Bank (GDP current USD, CPI inflation and the indicators above). Hover the chart for any year.</p>`;
  $$('#ecoView .kv strong[data-n]').forEach(el => { const n = +el.dataset.n; if (n) countUp(el, n, el.dataset.f === 'money' ? fmtMoney : v => '$' + Math.round(v).toLocaleString('en-US')); });
  onSeg($('#ecoView'), 'emetric', v => { ecoMetric = v; drawEco(); });
  $('#ecoCmp').onchange = e => { ecoCompare = e.target.value; drawEco(); };
  drawEco();
}
function drawEco() {
  const pick = d => (ecoMetric === 'gdp' ? d.g : d.i).map(([yr, v]) => ({ x: yr, y: v }));
  const a = pick(S.d), cmp = ecoCompare && DATA[ecoCompare] ? pick(DATA[ecoCompare]) : null;
  const fmt = v => ecoMetric === 'gdp' ? fmtMoney(v) : (+v).toFixed(1) + '%';
  const series = [{ pts: a, color: 'var(--accent)', area: !cmp }];
  if (cmp && cmp.length) series.push({ pts: cmp.filter(p => p.x >= a[0]?.x && p.x <= a.at(-1)?.x), color: 'var(--info)', dash: true });
  const read = $('#ecoRead');
  const show = p => { const q = cmp?.find(z => z.x === p.x); read.innerHTML = `${p.x} <span>·</span> ${esc(S.d.n)} ${fmt(p.y)}${cmp ? ` <span>·</span> <span style="color:var(--info)">${esc(DATA[ecoCompare].n)} ${q ? fmt(q.y) : '—'}</span>` : ''}`; };
  const def = () => a.length ? show(a.at(-1)) : read.textContent = 'No data published for this measure.';
  def(); if (!a.length) { $('#ecoChart').innerHTML = ''; return; }
  lineChart($('#ecoChart'), series, { fmtY: fmt, fmtX: p => p.x, baseline: ecoMetric === 'inf' ? 0 : null, onHover: i => i == null ? def() : show(a[i]) });
}
function renderEcoExtra(r) {
  const box = $('#ecoMore'); if (!box || !r) return;
  if (!r.wb?.series) { box.innerHTML = errBox(r.wb?.error || r.error || 'World Bank data unavailable.'); return; }
  const ids = ['NY.GDP.MKTP.KD.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'BN.CAB.XOKA.GD.ZS', 'BX.KLT.DINV.WD.GD.ZS', 'NE.EXP.GNFS.ZS'];
  box.innerHTML = ids.map(id => { const s = r.wb.series[id]; if (!s?.length) return ''; const l = s.at(-1); const good = { 'SL.UEM.TOTL.ZS': -1, 'GC.DOD.TOTL.GD.ZS': -1 }[id] || 1; const prev = s.at(-2); const up = prev ? l[1] > prev[1] : null;
    return `<div class="mini"><small>${esc(r.wb.labels[id])}</small><strong class="${up == null ? '' : (up === (good > 0)) ? 'up' : 'down'}">${fmtN(l[1], 1)}</strong>${spark(s.slice(-12).map(x => x[1]))}<em class="dim mono" style="font-size:10px">${l[0]}</em></div>`; }).join('') || '<p class="note">No extra indicators published.</p>';
}
// ---------- Outlook (IMF) ----------
function renderOutlook(r) {
  const v = $('#outView'); if (!r) return;
  if (!r.imf?.series || !Object.values(r.imf.series).some(a => a?.length)) { v.innerHTML = errBox(r.imf?.error || 'IMF forecasts unavailable for this country.'); return; }
  const y = r.imf.thisYear;
  v.innerHTML = `<p class="note">IMF World Economic Outlook. Shaded years are forecasts.</p><div class="minis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${Object.entries(r.imf.labels).map(([id, label]) => { const s = r.imf.series[id] || []; const now = s.find(p => p[0] === y), nxt = s.find(p => p[0] === y + 1); return `<div class="mini"><small>${esc(label)}</small><strong>${now ? fmtN(now[1], 1) : '—'} <span class="dim" style="font-size:11px">${y}</span></strong><em class="note">${nxt ? 'Forecast ' + (y + 1) + ': ' + fmtN(nxt[1], 1) : ''}</em><div id="imf-${id}"></div></div>`; }).join('')}</div>
    <span class="eyebrow">Country risk score</span><div id="riskBox">${skeleton(3)}</div>`;
  for (const id of Object.keys(r.imf.labels)) { const s = (r.imf.series[id] || []).map(([x, yv]) => ({ x, y: yv })); const b = $('#imf-' + id); if (s.length > 2) lineChart(b, [{ pts: s.filter(p => p.x <= y), color: 'var(--info)', area: true }, { pts: s.filter(p => p.x >= y), color: 'var(--accent)', dash: true }], { h: 90, xTicks: 3, fmtY: n => fmtN(n, 0), fmtX: p => p.x, band: null }); }
  emit('riskRender');
}

// ---------- Markets ----------
const M = { sym: null, win: store.get('mwin', '1M'), quote: null, watch: store.get('watch2', []), loaded: '', movers: 'most-active' };
function mktSkeleton() {
  const picks = TICKERS[S.iso] || [];
  $('#mktView').innerHTML = `
    <form class="bar" id="tkForm"><label class="sr" for="tk">Ticker</label><input id="tk" class="inp grow" placeholder="Symbol, e.g. 7203:TYO or NVDA:NASDAQ" autocomplete="off"><button class="btn solid" type="submit">Go</button><button class="btn ghost" type="button" id="tkWatch" title="Add to watchlist">☆</button></form>
    ${picks.length ? `<div class="chips" id="tkPicks">${picks.map(([s, n]) => `<button type="button" data-s="${esc(s)}">${esc(n)}</button>`).join('')}</div>` : `<p class="note">No preset tickers for ${esc(S.d.n)}. Pick an index below, or type a symbol.</p>`}
    <div id="qBox"></div>
    <section class="view"><div class="bar"><span class="eyebrow">Watchlist</span><span class="grow"></span><button class="btn ghost" id="wlRefresh" type="button" title="Costs one search per symbol">Refresh prices</button></div><div id="wlBox"></div></section>
    <section class="view"><div class="bar"><span class="eyebrow" id="idxTitle">Regional indexes</span></div><div id="idxBox"></div></section>
    <section class="view"><div class="bar"><span class="eyebrow">Movers</span><span class="grow"></span>${seg('movers', [['most-active', 'ACTIVE'], ['gainers', 'GAINERS'], ['losers', 'LOSERS']], '')}</div><div id="movBox"><p class="note">Pick a list to load Google Finance's movers (one search each, cached 10 min).</p></div></section>`;
  $('#tkForm').onsubmit = e => { e.preventDefault(); const v = $('#tk').value.trim().toUpperCase(); if (v) { M.sym = v; loadQuote(); } };
  $('#tkPicks')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { M.sym = b.dataset.s; loadQuote(); } });
  $('#tkWatch').onclick = toggleWatch; $('#wlRefresh').onclick = refreshWatch;
  onSeg($('#mktView'), 'movers', v => { M.movers = v; loadMovers(); });
  renderWatch();
}
function ensureMarkets() {
  if (M.loaded !== S.iso) { M.loaded = S.iso; mktSkeleton(); M.sym = (TICKERS[S.iso] || [])[0]?.[0] || null; M.quote = null; loadIndexes(); if (M.sym) loadQuote(); else $('#qBox').innerHTML = `<div class="empty">Choose an index or type a symbol to open the stock viewer.</div>`; }
  else if (M.quote) fin.meta(cacheNote(M.quote._cache));
}
async function loadQuote(force) {
  if (!M.sym) return; $('#tk').value = M.sym; updateWatchBtn();
  $$('#tkPicks button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === M.sym));
  const box = $('#qBox');
  if (box.querySelector('.quote')) box.classList.add('busy'); else box.innerHTML = skeleton(5);
  try {
    const q = await api(`/api/finance/quote?q=${enc(M.sym)}&window=${M.win}${force ? '&force=1' : ''}`);
    q._sym = M.sym; M.quote = q; box.classList.remove('busy'); renderQuote(); fin.meta(cacheNote(q._cache));
    const w = M.watch.find(x => x.s === M.sym); if (w) { w.p = q.summary.price; w.c = moveSigned(q.summary.move); w.n = q.summary.title; w.t = Date.now(); store.set('watch2', M.watch); renderWatch(); }
  } catch (e) { box.classList.remove('busy'); box.innerHTML = errBox(e) + `<p class="note">Google Finance symbols look like SYMBOL:EXCHANGE (7203:TYO, AAPL:NASDAQ, NI225:INDEXNIKKEI).</p>`; }
}
function relTime(s) { const m = String(s || '').match(/(\d+)\s*(minute|hour|day|week)s?\s*ago/i); if (m) return Date.now() - m[1] * { minute: 60e3, hour: 36e5, day: 864e5, week: 6048e5 }[m[2].toLowerCase()]; const t = Date.parse(s); return isNaN(t) ? null : t; }
function renderQuote() {
  const q = M.quote, s = q.summary; const pts = q.graph.map((g, i) => ({ x: i, y: g.p, label: g.d, t: Date.parse(g.d) }));
  const first = pts[0]?.y, last = pts.at(-1)?.y ?? s.price; const rangeChg = first ? (last / first - 1) * 100 : null; const day = moveSigned(s.move);
  const col = (rangeChg ?? day ?? 0) >= 0 ? 'var(--ok)' : 'var(--warn)';
  const dateLbl = l => { const t = Date.parse(l); if (isNaN(t)) return String(l).slice(0, 12); const dt = new Date(t); return M.win === '1D' ? pad(dt.getHours()) + ':' + pad(dt.getMinutes()) : M.win === '5D' ? dt.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + pad(dt.getHours()) + 'h' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(/5Y|MAX/.test(M.win) ? { year: '2-digit' } : {}) }); };
  // headline markers: place each dated headline on the nearest point of the chart
  const marks = []; for (const n of q.news) { const t = n.iso ? Date.parse(n.iso) : relTime(n.date); if (!t || !pts.length || isNaN(pts[0].t)) continue; if (t < pts[0].t || t > pts.at(-1).t + 864e5) continue; const i = d3.minIndex(pts, p => Math.abs(p.t - t)); marks.push({ x: pts[i].x, label: n.title + (n.source ? ' — ' + n.source : '') }); }
  $('#qBox').innerHTML = `
    <div class="quote"><div><h3>${esc(s.title || M.sym)}</h3><span class="mono dim">${esc(s.stock || '')}${s.exchange ? ':' + esc(s.exchange) : ''}</span></div>
      <div style="text-align:right"><div class="px">${fmtN(s.price)} <span class="dim" style="font-size:12px">${esc(s.currency || '')}</span></div>
      <div class="chg ${day == null ? '' : day >= 0 ? 'up' : 'down'}">${s.move ? (day >= 0 ? '▲ +' : '▼ −') + fmtN(s.move.value) + ' (' + fmtN(s.move.percentage) + '%) today' : ''}</div></div></div>
    ${seg('mwin', ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'].map(w => [w, w]), M.win)}
    <div class="readout" id="qRead"></div><div id="qChart"></div>
    ${marks.length ? `<p class="note"><span style="color:var(--violet)">◆</span> ${marks.length} headline${marks.length > 1 ? 's' : ''} marked on the chart — hover a diamond.</p>` : ''}
    <div class="bar"><span class="note grow">${rangeChg != null ? `Over ${M.win}: <b class="${rangeChg >= 0 ? 'up' : 'down'}">${rangeChg >= 0 ? '+' : ''}${rangeChg.toFixed(2)}%</b>` : ''}</span><button class="btn" id="qAI" type="button">Explain the move</button></div>
    <div class="brief" id="qAIBox" hidden></div>
    ${q.stats.length ? `<div class="stats">${q.stats.map(x => `<div class="row"><span>${esc(x.label)}</span><span>${esc(x.value)}</span></div>`).join('')}</div>` : ''}
    ${q.about?.text ? `<details><summary>About</summary><p class="note" style="margin-top:6px">${esc(q.about.text)}</p>${(q.about.info || []).map(x => `<div class="row"><span>${esc(x.label)}</span><span>${esc(x.value)}</span></div>`).join('')}</details>` : ''}
    ${q.news.length ? `<span class="eyebrow">Headlines</span><div class="list">${q.news.map(n => `<a class="story" style="text-decoration:none" href="${esc(n.link)}" target="_blank" rel="noopener"><span style="font-weight:600;font-size:13px">${esc(n.title)}</span><span class="s note">${esc(n.source || '')} · ${esc(n.date || '')}</span></a>`).join('')}</div>` : ''}
    <a class="note ext" href="https://www.google.com/finance/quote/${enc(M.sym)}" target="_blank" rel="noopener">Open on Google Finance</a>`;
  onSeg($('#qBox'), 'mwin', v => { M.win = v; store.set('mwin', v); loadQuote(); });
  const read = $('#qRead'); const def = () => read.innerHTML = pts.length ? `${esc(String(pts.at(-1).label))} <span>· last</span> ${fmtN(last)}` : '';
  def();
  if (pts.length > 1) lineChart($('#qChart'), [{ pts, color: col, area: true }], { h: 170, marks, fmtY: v => fmtN(v, v > 1000 ? 0 : 2), fmtX: p => dateLbl(p.label), baseline: first, onHover: i => { if (i == null) return def(); const p = pts[i]; const c = (p.y / first - 1) * 100; read.innerHTML = `${esc(String(p.label))} <span>·</span> ${fmtN(p.y)} <span class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(2)}%</span>${q.graph[i].v ? ` <span>· vol ${(+q.graph[i].v).toLocaleString('en-US')}</span>` : ''}`; } });
  else $('#qChart').innerHTML = '<p class="note">No price history returned for this range.</p>';
  $('#qAI').onclick = () => runAI($('#qAI'), $('#qAIBox'), { task: 'market', name: s.title, symbol: M.sym, price: fmtN(s.price), currency: s.currency, change: s.move ? (day >= 0 ? '+' : '-') + fmtN(s.move.percentage) + '% today' : 'n/a', window: M.win, first: fmtN(first), last: fmtN(last), stats: q.stats.slice(0, 8), news: q.news.map(n => n.title).slice(0, 6) });
}
function updateWatchBtn() { const on = M.watch.some(w => w.s === M.sym); const b = $('#tkWatch'); if (b) { b.textContent = on ? '★' : '☆'; b.title = on ? 'Remove from watchlist' : 'Add to watchlist'; b.style.color = on ? 'var(--accent)' : ''; } }
function toggleWatch() { if (!M.sym) return; const i = M.watch.findIndex(w => w.s === M.sym); if (i >= 0) M.watch.splice(i, 1); else M.watch.push({ s: M.sym, n: M.quote?.summary?.title || M.sym, p: M.quote?.summary?.price, c: moveSigned(M.quote?.summary?.move), t: Date.now() }); store.set('watch2', M.watch); renderWatch(); updateWatchBtn(); }
function renderWatch() {
  const b = $('#wlBox'); if (!b) return;
  b.innerHTML = M.watch.length ? `<table class="tbl"><thead><tr><th>Symbol</th><th>Name</th><th class="n">Last</th><th class="n">Day</th><th class="n">As of</th></tr></thead><tbody>${M.watch.map(w => `<tr class="click ${w.s === M.sym ? 'on' : ''}" data-s="${esc(w.s)}"><td class="mono">${esc(w.s)}</td><td>${esc(w.n || '')}</td><td class="n">${fmtN(w.p)}</td><td class="n ${w.c == null ? '' : w.c >= 0 ? 'up' : 'down'}">${w.c == null ? '—' : (w.c >= 0 ? '+' : '') + w.c.toFixed(2) + '%'}</td><td class="n dim">${ago(w.t)}</td></tr>`).join('')}</tbody></table>` : `<p class="note">Press ☆ next to a symbol to watch it. Your watchlist works across countries.</p>`;
  $$('tr[data-s]', b).forEach(tr => tr.onclick = () => { M.sym = tr.dataset.s; loadQuote(); });
}
async function refreshWatch() { if (!M.watch.length) return; const btn = $('#wlRefresh'); btn.disabled = true; for (const w of M.watch) { btn.textContent = 'Refreshing ' + w.s + '…'; try { const q = await api(`/api/finance/quote?q=${enc(w.s)}&window=1D`); w.p = q.summary.price; w.c = moveSigned(q.summary.move); w.n = q.summary.title || w.n; w.t = q._cache?.at || Date.now(); } catch (e) {} } store.set('watch2', M.watch); renderWatch(); btn.disabled = false; btn.textContent = 'Refresh prices'; }
async function loadIndexes() {
  const region = regionOf(S.d); const box = $('#idxBox');
  $('#idxTitle').textContent = 'Indexes · ' + { americas: 'Americas', 'europe-middle-east-africa': 'Europe, Middle East & Africa', 'asia-pacific': 'Asia-Pacific' }[region];
  box.innerHTML = skeleton(4);
  try {
    const r = await api('/api/finance/markets?trend=indexes&region=' + region); const rows = r.groups.flatMap(g => g.results);
    box.innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Index</th><th class="n">Level</th><th class="n">Day</th></tr></thead><tbody>${rows.map(x => { const c = moveSigned(x.move); return `<tr class="click" data-s="${esc(x.stock)}"><td>${esc(x.name)} <span class="dim mono" style="font-size:10.5px">${esc(x.stock)}</span></td><td class="n">${fmtN(x.price)}</td><td class="n ${c == null ? '' : c >= 0 ? 'up' : 'down'}">${c == null ? '—' : (c >= 0 ? '+' : '') + c.toFixed(2) + '%'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="note">No index data returned.</p>';
    $$('tr[data-s]', box).forEach(tr => tr.onclick = () => { M.sym = tr.dataset.s; loadQuote(); fin.body.scrollTop = 0; });
    if (!M.sym && rows.length) { const name = (EXTRA[S.iso] || [])[3]; const hit = name && rows.find(x => x.name.toLowerCase().includes(name.toLowerCase().split(' ')[0])); if (hit) { M.sym = hit.stock; loadQuote(); } }
  } catch (e) { box.innerHTML = errBox(e); }
}
async function loadMovers() {
  const box = $('#movBox'); box.innerHTML = skeleton(4);
  try { const r = await api('/api/finance/markets?trend=' + M.movers); const rows = r.groups.flatMap(g => g.results).slice(0, 12);
    box.innerHTML = `<table class="tbl"><tbody>${rows.map(x => { const c = moveSigned(x.move); return `<tr class="click" data-s="${esc(x.stock)}"><td class="mono">${esc(x.stock)}</td><td>${esc(x.name)}</td><td class="n">${fmtN(x.price)}</td><td class="n ${c >= 0 ? 'up' : 'down'}">${c == null ? '—' : (c >= 0 ? '+' : '') + c.toFixed(2) + '%'}</td></tr>`; }).join('')}</tbody></table><p class="note">Google Finance's movers list (mostly US-listed).</p>`;
    $$('tr[data-s]', box).forEach(tr => tr.onclick = () => { M.sym = tr.dataset.s; loadQuote(); fin.body.scrollTop = 0; });
  } catch (e) { box.innerHTML = errBox(e); }
}
// ---------- Currency ----------
async function loadFx() {
  const v = $('#fxView'); const code = (S.d?.cur || '').split(',')[0].trim();
  if (!code) { v.innerHTML = '<div class="empty">No currency recorded for this country.</div>'; return; }
  if (F$.fxFor === S.iso && F$.fx) return renderFx(F$.fx);
  v.innerHTML = skeleton(5);
  try { const r = await api('/api/fx?code=' + code); F$.fx = r; F$.fxFor = S.iso; renderFx(r); emit('riskRender'); }
  catch (e) { v.innerHTML = errBox(e); }
}
function renderFx(r) {
  const v = $('#fxView'); const usd = r.code === 'USD';
  v.innerHTML = `<div class="kv"><div><small>${esc(r.code)} per US$</small><strong>${fmtN(r.perUSD, r.perUSD > 100 ? 1 : 4)}</strong><em>${esc(r.updated ? ago(r.updated) : '')}</em></div>
      <div><small>Per euro</small><strong>${fmtN(r.perEUR, r.perEUR > 100 ? 1 : 4)}</strong></div><div><small>Per pound</small><strong>${fmtN(r.perGBP, r.perGBP > 100 ? 1 : 4)}</strong></div>
      <div><small>30-day</small><strong class="${r.change30 == null ? '' : r.change30 > 0 ? 'down' : 'up'}">${r.change30 == null ? '—' : (r.change30 > 0 ? '+' : '') + r.change30.toFixed(1) + '%'}</strong><em>vs US$</em></div>
      <div><small>1-year</small><strong class="${r.change365 == null ? '' : r.change365 > 0 ? 'down' : 'up'}">${r.change365 == null ? '—' : (r.change365 > 0 ? '+' : '') + r.change365.toFixed(1) + '%'}</strong><em>vs US$</em></div>
      <div><small>Volatility</small><strong>${r.volatility == null ? '—' : r.volatility.toFixed(1) + '%'}</strong><em>annualised</em></div></div>
    <p class="note">${usd ? 'This country uses the US dollar.' : `A rising line means it takes more ${esc(r.code)} to buy one dollar, so the currency is weakening.`}</p>
    <div class="readout" id="fxRead"></div><div id="fxChart">${r.history.length ? '' : '<p class="note">No daily history for this currency from the European Central Bank feed.</p>'}</div>
    <div class="form"><label>Amount in US$<input id="fxAmt" type="number" value="100" min="0"></label><label>In ${esc(r.code)}<input id="fxOut" readonly></label></div>
    <p class="note">Sources: ExchangeRate-API (spot, daily) and the ECB via Frankfurter (history).</p>`;
  const upd = () => { $('#fxOut').value = fmtN((+$('#fxAmt').value || 0) * r.perUSD, 2); }; $('#fxAmt').oninput = upd; upd();
  if (r.history.length > 2) { const pts = r.history.map(([d, val], i) => ({ x: i, y: val, label: d })); const read = $('#fxRead'); const def = () => read.innerHTML = `${pts.at(-1).label} <span>·</span> ${fmtN(pts.at(-1).y, 4)}`; def();
    lineChart($('#fxChart'), [{ pts, color: 'var(--accent)', area: true }], { h: 140, fmtY: n => fmtN(n, n > 100 ? 0 : 3), fmtX: p => p.label.slice(5), onHover: i => i == null ? def() : read.innerHTML = `${pts[i].label} <span>·</span> ${fmtN(pts[i].y, 4)}` }); }
}
