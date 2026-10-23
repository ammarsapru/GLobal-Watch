'use strict';
/* Travel panel: Prepare (visa, advisories, best time to go, weather) · Flights · Hotels · Things to do (Google via SerpAPI). */
const trv = makePanel('travel', 'Travel', [['prep', 'Prepare'], ['fly', 'Flights'], ['hotel', 'Hotels'], ['do', 'Do']], { short: 'Travel' });
const ACTS = [['tourist attractions', 'Sights'], ['restaurants', 'Food'], ['museums', 'Museums'], ['parks', 'Outdoors'], ['bars', 'Nightlife'], ['family activities', 'Family'], ['shopping', 'Shopping']];
const ADV = { 1: ['Exercise normal precautions', 'ok'], 2: ['Exercise increased caution', 'info'], 3: ['Reconsider travel', 'warn'], 4: ['Do not travel', 'down'] };
trv.body.innerHTML = `
  <div class="view" data-tab="prep"><div id="tPrep"></div></div>
  <div class="view" data-tab="fly" hidden>
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
  </div>
  <div class="view" data-tab="do" hidden>
    <div class="bar"><label class="sr" for="dCity">City</label><input id="dCity" class="inp grow"><span class="note">Pick a category:</span></div>
    ${seg('dcat', ACTS, '', 'chips')}
    <div id="dRes"><div class="empty">Choose a category to pull real places from Google Maps (1 search, cached 24 h).</div></div>
    <div class="bar"><button class="btn" id="dPlan" type="button" disabled>Plan a day from these places</button></div>
    <div class="brief" id="dPlanBox" hidden></div>
  </div>`;
trv.onTab = v => { $$('#p-travel .view[data-tab]').forEach(x => x.hidden = x.dataset.tab !== v); trv.meta(trv['meta_' + v] || ''); if (v === 'prep') loadPrep(); };
trv.onTab(trv.tab);
trv.onRefresh = () => { if (trv.tab === 'prep') loadPrep(true); if (trv.tab === 'fly' && F.last) searchFlights(true); if (trv.tab === 'hotel' && H.last) searchHotels(true); if (trv.tab === 'do' && D.cat) searchPlaces(true); };
const setTMeta = (tab, m) => { trv['meta_' + tab] = m; if (trv.tab === tab) trv.meta(m); };
trv.onCountry = () => {
  const d = S.d, iso = S.iso; if (!iso) return;
  const ex = EXTRA[iso]; $('#fTo').value = ex ? ex[0] : ''; $('#fTo').placeholder = ex ? '' : 'Airport code'; fGoogleLink();
  $('#fRes').innerHTML = `<div class="empty">${ex ? `Arrive at <b>${esc(ex[1])}</b>. ` : `Enter the airport code for ${esc(d.n)}. `}Press <b>Find flights</b> for live Google Flights fares (1 search, cached 6 h).</div>`; F.data = null; F.last = null;
  $('#hCity').value = d.cap || d.n; $('#hRes').innerHTML = `<div class="empty">Press <b>Find hotels</b> for live Google Hotels prices in ${esc(d.cap || d.n)}.</div>`; H.last = null;
  $('#dCity').value = d.cap || d.n; D.cat = ''; $$('#p-travel [data-seg="dcat"] button').forEach(b => b.setAttribute('aria-pressed', 'false')); $('#dRes').innerHTML = `<div class="empty">Choose a category to pull real places in ${esc(d.cap || d.n)} from Google Maps.</div>`; $('#dPlan').disabled = true; $('#dPlanBox').hidden = true;
  ['prep', 'fly', 'hotel', 'do'].forEach(t => setTMeta(t, '')); P.for = null;
  if (trv.tab === 'prep') loadPrep();
};

// ---- prepare
const P = { for: null };
const WX = c => c == null ? ['—', ''] : c === 0 ? ['Clear', '☀'] : c <= 2 ? ['Partly cloudy', '⛅'] : c === 3 ? ['Overcast', '☁'] : c <= 48 ? ['Fog', '🌫'] : c <= 57 ? ['Drizzle', '🌦'] : c <= 67 ? ['Rain', '🌧'] : c <= 77 ? ['Snow', '❄'] : c <= 82 ? ['Showers', '🌦'] : c <= 86 ? ['Snow showers', '🌨'] : ['Thunderstorm', '⛈'];
async function loadPrep(force) {
  const iso = S.iso, box = $('#tPrep'); if (!iso) { box.innerHTML = '<div class="empty">Pick a country on the globe.</div>'; return; }
  if (P.for === iso && !force) return; P.for = iso;
  box.innerHTML = skeleton(5);
  const pass = (S.settings.passport || 'US').toUpperCase(); const f = force ? '&force=1' : '';
  const [visa, adv, clim, wx] = await Promise.all([
    pass === S.d.a2 ? Promise.resolve({ req: 'home', days: null }) : api(`/api/visa?from=${pass}&to=${S.d.a2}`).catch(e => ({ error: e.message })),
    api('/api/advisory?iso=' + iso + f).catch(e => ({ error: e.message })),
    api('/api/climate?iso=' + iso + f).catch(e => ({ error: e.message })),
    api('/api/weather?iso=' + iso + f).catch(e => ({ error: e.message }))]);
  if (iso !== S.iso) return;
  const passName = DATA[byA2[pass]]?.n || pass;
  const vreq = visa.error ? null : String(visa.req || '').toLowerCase();
  const vcls = !vreq ? '' : /free|home|^\d+$/.test(vreq) ? 'up' : /arrival|eta|e-visa|evisa/.test(vreq) ? '' : 'down';
  const vtxt = !vreq ? '—' : vreq === 'home' ? 'Your home country' : /^\d+$/.test(vreq) ? `Visa-free · ${vreq} days` : vreq.replace(/\b\w/g, c => c.toUpperCase()) + (visa.days ? ` · ${visa.days} days` : '');
  const us = adv.us, uk = adv.uk; const lv = us?.level;
  const best = clim.months ? clim.months.slice().sort((a, b) => b.score - a.score).slice(0, 3).map(m => m.m) : [];
  const mx = clim.months ? Math.max(...clim.months.map(m => m.score)) : 1;
  const cur = wx.current; const w = WX(cur?.weather_code);
  box.innerHTML = `<div class="reveal"><div class="body">
    <div class="minis">
      <div class="mini"><small>Entry for a ${esc(passName)} passport</small><strong class="${vcls}">${esc(vtxt)}</strong><em class="note">Passport Index data · <button class="linkbtn" data-act="passport" type="button">change passport</button></em></div>
      <div class="mini"><small>US State Dept advisory</small><strong class="${ADV[lv]?.[1] || ''}">${lv ? 'Level ' + lv : '—'}</strong><em class="note">${esc(lv ? ADV[lv][0] : (adv.usError || 'Not listed'))}</em></div>
      <div class="mini"><small>Now in ${esc(wx.place?.name || S.d.cap || '')}</small><strong>${cur ? `${w[1]} ${Math.round(cur.temperature_2m)}°C` : '—'}</strong><em class="note">${cur ? `${esc(w[0])} · feels ${Math.round(cur.apparent_temperature)}° · wind ${Math.round(cur.wind_speed_10m)} km/h` : esc(wx.error || '')}</em></div>
    </div>
    ${clim.months ? `<span class="eyebrow">Best time to visit ${esc(S.d.cap || S.d.n)}</span>
      <div class="months">${clim.months.map(m => `<div class="${best.includes(m.m) ? 'best' : ''}" title="${MONTHS[m.m]}: ${Math.round(m.temp)}°C average, ${Math.round(m.rain)} mm rain over ${m.wetDays} wet days"><i style="height:${Math.max(6, m.score / mx * 100)}%"></i><small>${MONTHS[m.m][0]}</small></div>`).join('')}</div>
      <p class="note">Best months: <b style="color:var(--fg)">${best.map(m => MONTHS[m]).join(', ')}</b>. Scored on comfortable temperature (18–26 °C) and few wet days, from ${esc(clim.years || 'recent')} years of ERA5 data via Open-Meteo.</p>` : ''}
    ${us ? `<div class="detail"><div class="bar"><b>${esc(us.title || 'US advisory')}</b><span class="grow"></span><a class="ext" href="${esc(us.link)}" target="_blank" rel="noopener">State Dept</a></div><p class="note">${esc(String(us.summary || '').slice(0, 420))}${String(us.summary || '').length > 420 ? '…' : ''}</p><p class="note">Updated ${esc(ago(us.updated))}</p></div>` : ''}
    ${uk && !uk.error ? `<div class="detail"><div class="bar"><b>UK FCDO: ${esc(uk.title || '')}</b><span class="grow"></span><a class="ext" href="${esc(uk.link)}" target="_blank" rel="noopener">GOV.UK</a></div>${uk.alert?.length ? `<p class="down">${uk.alert.map(esc).join(' · ')}</p>` : ''}<p class="note">${esc(String(uk.summary || '').slice(0, 300))}</p>${(uk.parts || []).length ? `<div class="chiplist">${uk.parts.slice(0, 8).map(p => `<span class="tag n">${esc(p.title)}</span>`).join('')}</div>` : ''}<p class="note">Updated ${esc(ago(uk.updated))}</p></div>` : ''}
    ${wx.daily ? `<span class="eyebrow">Next 7 days</span><div class="days">${wx.daily.time.map((t, i) => { const x = WX(wx.daily.weather_code[i]); return `<div title="${esc(x[0])}"><small>${new Date(t + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })}</small><span>${x[1]}</span><b>${Math.round(wx.daily.temperature_2m_max[i])}°</b><span class="dim">${Math.round(wx.daily.temperature_2m_min[i])}°</span>${wx.daily.precipitation_probability_max?.[i] > 30 ? `<small class="info">${wx.daily.precipitation_probability_max[i]}%</small>` : ''}</div>`; }).join('')}</div>` : ''}
  </div></div>`;
  $$('.reveal>.body>*', box).forEach((el, i) => el.style.setProperty('--i', i));
  setTMeta('prep', 'visa · advisories · climate');
}
$('#p-travel').addEventListener('click', e => { if (e.target.closest('[data-act="passport"]')) emit('openSettings'); });
on('settings', () => { P.for = null; if (trv.tab === 'prep' && isOpen('travel')) loadPrep(); });

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
  F.last = p; $('#fGo').disabled = true; $('#fRes').innerHTML = skeleton(5);
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
  H.last = p; $('#hRes').innerHTML = skeleton(5);
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
        ${p.amen?.length ? `<span class="s">${p.amen.slice(0, 5).map(a => `<span class="tag n">${esc(a)}</span>`).join('')}</span>` : ''}
        ${p.deal ? `<span class="s up">${esc(p.deal)}</span>` : ''}</div>
      <div class="r"><span class="price">${p.nightText ? esc(p.nightText) : '—'}</span><span class="note">per night</span>${p.totalText ? `<span class="note">${esc(p.totalText)} total</span>` : ''}</div></div>`).join('')}</div>`;
}

// ---- things to do
const D = { cat: '', data: null };
onSeg($('#p-travel'), 'dcat', v => { D.cat = v; searchPlaces(); });
$('#dCity').addEventListener('change', () => { if (D.cat) searchPlaces(); });
async function searchPlaces(force) {
  const city = $('#dCity').value.trim() || S.d.cap || S.d.n;
  $('#dRes').innerHTML = skeleton(5); $('#dPlan').disabled = true;
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
