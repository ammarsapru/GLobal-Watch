'use strict';
/* Ships & Aircraft panel: live positions on the globe, replay of the past hours, holding-pattern (orbit) detection,
   emergency squawks worldwide, ships that went dark, and a cross-reference with the current headlines. */
const trk = makePanel('track', 'Ships & Aircraft', [['live', 'Live'], ['replay', 'Replay'], ['alerts', 'Alerts']], { short: 'Tracking' });
const SHIPTYPE = t => t == null ? 'Details pending' : t === 30 ? 'Fishing' : t === 35 ? 'Military' : t === 55 ? 'Law enforcement' : t === 51 ? 'Search & rescue' : (t === 31 || t === 32 || t === 52) ? 'Tug' : (t === 36 || t === 37) ? 'Pleasure' : t >= 60 && t <= 69 ? 'Passenger' : t >= 70 && t <= 79 ? 'Cargo' : t >= 80 && t <= 89 ? 'Tanker' : t >= 40 && t <= 49 ? 'High-speed craft' : t >= 50 && t <= 59 ? 'Service' : 'Other';
// airline from the 3-letter ICAO prefix of a callsign (OpenSky does not send aircraft types)
const AIRLINE = { AAL: 'American', DAL: 'Delta', UAL: 'United', SWA: 'Southwest', JBU: 'JetBlue', ASA: 'Alaska', NKS: 'Spirit', FFT: 'Frontier', SKW: 'SkyWest', RPA: 'Republic', ENY: 'Envoy', FDX: 'FedEx', UPS: 'UPS', GTI: 'Atlas Air', ACA: 'Air Canada', WJA: 'WestJet', AMX: 'Aeroméxico', VOI: 'Volaris', BAW: 'British Airways', VIR: 'Virgin Atlantic', EZY: 'easyJet', RYR: 'Ryanair', AFR: 'Air France', KLM: 'KLM', DLH: 'Lufthansa', EWG: 'Eurowings', SWR: 'Swiss', AUA: 'Austrian', SAS: 'SAS', FIN: 'Finnair', IBE: 'Iberia', VLG: 'Vueling', TAP: 'TAP', AZA: 'ITA', ITY: 'ITA', WZZ: 'Wizz Air', LOT: 'LOT', THY: 'Turkish', PGT: 'Pegasus', AFL: 'Aeroflot', SDM: 'Rossiya', UAE: 'Emirates', ETD: 'Etihad', QTR: 'Qatar', SVA: 'Saudia', FDB: 'flydubai', ELY: 'El Al', MSR: 'EgyptAir', ETH: 'Ethiopian', KQA: 'Kenya Airways', SAA: 'South African', RAM: 'Royal Air Maroc', AIC: 'Air India', IGO: 'IndiGo', AXB: 'Air India Express', PIA: 'PIA', CCA: 'Air China', CES: 'China Eastern', CSN: 'China Southern', CHH: 'Hainan', CXA: 'Xiamen', CPA: 'Cathay Pacific', HKE: 'HK Express', EVA: 'EVA Air', CAL: 'China Airlines', JAL: 'Japan Airlines', ANA: 'All Nippon', APJ: 'Peach', SKY: 'Skymark', JJP: 'Jetstar Japan', KAL: 'Korean Air', AAR: 'Asiana', JNA: 'Jin Air', SIA: 'Singapore', SLK: 'Scoot', TGW: 'Scoot', MAS: 'Malaysia', AXM: 'AirAsia', THA: 'Thai', VJC: 'VietJet', HVN: 'Vietnam Airlines', GIA: 'Garuda', PAL: 'Philippine', CEB: 'Cebu Pacific', QFA: 'Qantas', VOZ: 'Virgin Australia', JST: 'Jetstar', ANZ: 'Air New Zealand', LAN: 'LATAM', TAM: 'LATAM Brasil', GLO: 'GOL', AZU: 'Azul', AVA: 'Avianca', CMP: 'Copa', ARG: 'Aerolíneas Argentinas', CLX: 'Cargolux', BOX: 'AeroLogic', CKS: 'Kalitta', ABW: 'AirBridgeCargo', RCH: 'US Air Mobility Cmd', CFC: 'Canadian Forces', RRR: 'Royal Air Force', GAF: 'German Air Force', FAF: 'French Air Force', IAM: 'Italian Air Force', NATO: 'NATO' };
const airlineOf = cs => { const m = /^([A-Z]{3})\d/.exec(cs || ''); return m ? AIRLINE[m[1]] || null : null; };
const NAV = { 0: 'Under way (engine)', 1: 'At anchor', 2: 'Not under command', 3: 'Restricted manoeuvring', 4: 'Constrained by draught', 5: 'Moored', 6: 'Aground', 7: 'Fishing', 8: 'Under way (sail)', 14: 'AIS-SART' };
const A = { kind: store.get('ackind', 'air'), scope: { air: 'reg', sea: 'flag' }, list: [], dark: [], auto: store.get('acauto', true), filter: 'all', abroad: false, minAlt: 0, q: '', sort: 'alt', sel: null, trail: null, timer: null, loading: false, err: null, info: null, replay: null, rIdx: 0, playing: null };
trk.body.innerHTML = `
  <div class="view" data-tab="live">
  <div class="bar">${seg('akind', [['air', 'AIRCRAFT'], ['sea', 'SHIPS']], A.kind)}<span class="grow"></span><label class="check"><input type="checkbox" id="aAuto" ${A.auto ? 'checked' : ''}>Live updates</label></div>
  <div class="bar" id="aScopeBar"></div>
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
  <div id="aNews"></div>
  <p class="note" id="aNote"></p>
  </div>
  <div class="view" data-tab="replay" hidden><div id="rBox"></div></div>
  <div class="view" data-tab="alerts" hidden><div id="eBox"></div></div>`;
trk.onTab = v => { $$('#p-track .view[data-tab]').forEach(x => x.hidden = x.dataset.tab !== v); stopReplay(); if (v === 'replay') loadReplay(); else { A.replay = null; pushGlobe(); } if (v === 'alerts') loadTrackAlerts(); };
function trackChrome() {
  const air = A.kind === 'air';
  $('#aScopeBar').innerHTML = air ? seg('ascope', [['reg', 'REGISTERED HERE'], ['over', 'IN ITS AIRSPACE']], A.scope.air) : seg('ascope', [['flag', 'FLAGGED HERE'], ['near', 'NEAR ITS COAST']], A.scope.sea);
  onSeg($('#aScopeBar'), 'ascope', v => { A.scope[A.kind] = v; A.sel = null; A.trail = null; A.list = []; A.abroad = false; trackChrome(); renderAc(); loadAircraft(); });
  $('#aFilterBar').innerHTML = (air ? seg('afilter', [['all', 'ALL'], ['mil', 'MILITARY'], ['civ', 'CIVIL'], ['orbit', 'ORBITING']], A.filter) : seg('afilter', [['all', 'ALL'], ['Cargo', 'CARGO'], ['Tanker', 'TANKER'], ['Fishing', 'FISHING'], ['Passenger', 'PASSENGER'], ['Military', 'MILITARY']], A.filter))
    + `<label class="check"><input type="checkbox" id="aAbroad" ${A.abroad ? 'checked' : ''}>${air ? (A.scope.air === 'over' ? 'Foreign only' : 'Abroad only') : 'Moving only'}</label>`;
  onSeg($('#aFilterBar'), 'afilter', v => { A.filter = v; renderAc(); });
  $('#aAbroad').onchange = e => { A.abroad = e.target.checked; renderAc(); };
  $('#aAltWrap').hidden = !air;
  $('#aQ').placeholder = air ? 'callsign, type, reg.' : 'ship name, MMSI, destination';
  $('#aNote').innerHTML = air
    ? (A.scope.air === 'over' ? 'Every aircraft broadcasting inside this country’s borders right now, from any country.' : 'Aircraft whose transponder address was issued by this country (ICAO 24-bit block), shown anywhere in the world.') + ' Sources: OpenSky Network (all aircraft) and adsb.lol (military). Many military aircraft fly with transponders off, so counts are a floor. A dashed ring marks an aircraft that has turned more than 540° in 30 minutes (holding, surveillance or refuelling orbit).'
    : (A.scope.sea === 'near' ? 'Every ship broadcasting AIS in a box around this country, whatever its flag.' : 'Ships whose MMSI is registered to this country’s flag (the first three digits of the MMSI). Flag is not always the owner: many ships fly Panama, Liberia or Marshall Islands flags.') + ' Source: AISStream (shore-based receivers, so mid-ocean coverage is thin). Warships usually switch AIS off.';
}
onSeg(trk.body, 'akind', v => { A.kind = v; store.set('ackind', v); A.filter = 'all'; A.abroad = false; A.sel = null; A.trail = null; A.list = []; A.sort = v === 'air' ? 'alt' : 'spd'; trackChrome(); renderAc(); loadAircraft(); armAc(); });
$('#aAuto').onchange = e => { A.auto = e.target.checked; store.set('acauto', A.auto); armAc(); };
trk.onRefresh = () => { if (trk.tab === 'replay') loadReplay(); else if (trk.tab === 'alerts') loadTrackAlerts(); else loadAircraft(); };
trk.onCountry = () => { A.sel = null; A.trail = null; A.list = []; A.dark = []; A.replay = null; stopReplay(); GL.sel = null; GL.trail = null; renderAc(); if (trk.tab === 'replay') loadReplay(); else if (trk.tab === 'alerts') loadTrackAlerts(); else loadAircraft(); armAc(); };
trk.onShow = () => { if (S.iso && !A.list.length) loadAircraft(); pushGlobe(); };
$('#aAlt').oninput = e => { A.minAlt = +e.target.value; $('#aAltV').textContent = A.minAlt.toLocaleString('en-US') + ' ft'; renderAc(); };
$('#aQ').oninput = e => { A.q = e.target.value.trim().toUpperCase(); renderAc(); };
function armAc() { clearInterval(A.timer); if (A.auto) A.timer = setInterval(() => { if (!document.hidden && isOpen('track') && trk.tab === 'live') loadAircraft(true); }, A.kind === 'sea' ? 30e3 : 60e3); }
function normShip(s) {
  const cat = SHIPTYPE(s.type);
  return { ...s, ship: true, hex: s.mmsi, callsign: s.cs, seen: s.t, cs: s.name || ('MMSI ' + s.mmsi), t: cat, mil: s.type === 35, gs: s.sog != null ? +(+s.sog).toFixed(1) : null, trk: s.hdg ?? (s.cog != null ? Math.round(s.cog) : null), gnd: (s.sog ?? 0) < 0.5, alt: null };
}
// what the globe draws: the filtered live list, or a replay frame
function pushGlobe() {
  if (A.replay && trk.tab === 'replay') { const fr = A.replay.frames[A.rIdx]; GL.data.air = fr ? fr.a.map(([hex, lat, lon, alt, mil]) => ({ hex, lat, lon, alt, mil: !!mil, trk: 0 })) : []; return; }
  GL.data.air = isOpen('track') && GL.layers.air ? acFiltered() : [];
  GL.sel = A.sel ? { kind: 'track', id: A.sel } : (GL.sel?.kind === 'track' ? null : GL.sel);
  GL.trail = A.trail;
  const air = A.kind === 'air'; const n = GL.data.air.length;
  $('#legend').hidden = !n; $('#legend').innerHTML = air ? `<span><i class="dot mil"></i>Military</span><span><i class="dot civ"></i>Civil</span><span>${n} on globe</span>` : `<span><i class="dot mil"></i>Military</span><span><i class="dot" style="background:var(--ok)"></i>Ships</span><span>${n} on globe</span>`;
}
on('layers', pushGlobe); on('panels', pushGlobe);
async function loadAircraft(quiet) {
  if (A.loading || !S.iso) return; A.loading = true; const iso = S.iso, kind = A.kind;
  if (!quiet) { if ($('#aList tr')) $('#aList').classList.add('busy'); else $('#aList').innerHTML = skeleton(6); }
  try {
    const c = S.f?.c || [0, 0]; const scope = A.scope[kind]; const box = countryBox(S.f, kind === 'sea' ? 3 : 0.3);
    const qs = new URLSearchParams({ cc: S.d.a2, lat: c[1], lon: c[0], mode: scope, ...(box && (scope === 'over' || scope === 'near') ? { bbox: box.join(',') } : {}) });
    const r = await api((kind === 'air' ? '/api/aircraft?' : '/api/ships?') + qs);
    if (iso !== S.iso || kind !== A.kind) return;
    A.info = r;
    if (kind === 'air') {
      A.list = r.list;
      if (r.mode === 'over' && S.f) A.list = A.list.filter(a => d3.geoContains(S.f, [a.lon, a.lat]));
      const near = countryBox(S.f, 2);
      for (const a of A.list) { a.op = airlineOf(a.cs); a.abroad = r.mode === 'over' ? a.cc !== S.d.a2 : (S.f ? !d3.geoContains(S.f, [a.lon, a.lat]) && !inBox(near, a.lon, a.lat) : false); }
      A.err = r.errors?.length ? r.errors.join(' ') : null; A.dark = [];
      trk.meta((r.sample ? 'sample data · ' : '') + 'updated ' + ago(Math.max(r.osAt || 0, r.milAt || 0) || Date.now()) + (r.stale ? ' · stale' : ''));
    } else {
      A.list = r.list.map(normShip); for (const s of A.list) s.abroad = !s.gnd; A.dark = (r.dark || []).map(normShip);
      A.err = r.error && !r.list.length ? r.error : null;
      trk.meta((r.sample ? 'sample data · ' : '') + (r.state === 'live' ? `live · ${(r.tracked || 0).toLocaleString('en-US')} ships worldwide` : r.state));
    }
    if (A.sel) { if (!A.list.find(a => a.hex === A.sel)) { A.sel = null; A.trail = null; } else loadTrail(); }
    renderAc(); emit('tracks', A.list);
  } catch (e) { $('#aList').innerHTML = errBox(e); } finally { A.loading = false; $('#aList').classList.remove('busy'); }
}
function acFiltered() {
  const air = A.kind === 'air';
  return A.list.filter(a => (A.filter === 'all' || (air ? (A.filter === 'orbit' ? !!a.orbit : (A.filter === 'mil') === !!a.mil) : a.t === A.filter)) && (!A.abroad || a.abroad) && (!air || A.minAlt === 0 || (a.alt || 0) >= A.minAlt)
    && (!A.q || [a.cs, a.t, a.r, a.hex, a.dest, a.flag, a.role].some(v => String(v || '').toUpperCase().includes(A.q))));
}
function renderAc() {
  const air = A.kind === 'air', L = A.list;
  const tiles = air ? [['Airborne', L.filter(a => !a.gnd).length], ['Military', L.filter(a => a.mil).length, 'down'], ['Orbiting', L.filter(a => a.orbit).length, 'warn'], [A.scope.air === 'over' ? 'Foreign' : 'Abroad', L.filter(a => a.abroad).length]]
    : [['Under way', L.filter(a => !a.gnd).length], ['Military', L.filter(a => a.mil).length, 'down'], ['Stopped', L.filter(a => a.gnd).length], ['Went dark', A.dark.length, A.dark.length ? 'warn' : '']];
  $('#aTiles').innerHTML = tiles.map(([l, n, c]) => `<div><small>${l}</small><strong class="${c || ''}">${n}</strong></div>`).join('');
  let warn = A.err ? errBox(A.err) : '';
  const em = L.filter(a => a.emergency); if (em.length) warn += `<p class="down"><b>Emergency squawk:</b> ${em.map(a => `<button class="linkbtn" data-hex="${esc(a.hex)}" type="button">${esc(a.cs || a.hex)} (${esc(a.emergency)})</button>`).join(', ')}</p>`;
  if (!air && A.info?.warming) warn += `<p class="note">Collecting ships: connected ${ago(A.info.since)}, ${(A.info.tracked || 0).toLocaleString('en-US')} seen worldwide so far. The list fills in over the first few minutes; names arrive more slowly than positions.</p>`;
  if (!air && L.length && L.filter(x => x.type == null).length > L.length / 2) warn += `<p class="note">Ship types and destinations are broadcast only every few minutes, so many show as pending at first. They are saved as they arrive, so the list fills in and stays filled across restarts.</p>`;
  if (!air && A.dark.length) warn += `<details class="detail"><summary><b>${A.dark.length} ship${A.dark.length > 1 ? 's' : ''} went dark</b> <span class="note">(was moving, then silent for over an hour)</span></summary>${A.dark.slice(0, 20).map(s => `<div class="row"><span>${esc(s.cs)} · ${esc(s.t)}</span><span class="dim">silent ${mins(s.silentMin)} · last ${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}</span></div>`).join('')}</details>`;
  $('#aErr').innerHTML = warn;
  const groups = air ? d3.rollups(L.filter(a => a.mil && (a.role || a.t)), v => v.length, a => a.role || a.t) : d3.rollups(L, v => v.length, a => a.t);
  const types = groups.sort((a, b) => b[1] - a[1]).slice(0, 7); const mx = types[0]?.[1] || 1;
  $('#aTypesTitle').textContent = air ? 'Military roles visible' : 'Ship types';
  $('#aTypes').innerHTML = types.length ? types.map(([t, n]) => `<div><span>${esc(t)}</span><b style="width:${n / mx * 100}%;${!air && t !== 'Military' ? 'background:var(--ok)' : ''}"></b><span class="dim">${n}</span></div>`).join('') : `<p class="note">${air ? 'No military aircraft with a known type are broadcasting right now.' : 'No ships yet.'}</p>`;
  const list = acFiltered();
  const key = { alt: a => -(a.alt || 0), spd: a => -(a.gs || 0), cs: a => a.cs || 'zzz' }[A.sort] || (a => 0);
  list.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
  $('#aListTitle').textContent = `${air ? 'Aircraft' : 'Ships'} · ${list.length} shown`;
  const rows = list.slice(0, 250);
  const head = air ? `<th><button class="linkbtn" data-sort="cs">Callsign</button></th><th>Type · operator</th><th class="n"><button class="linkbtn" data-sort="alt">Alt ft</button></th><th class="n"><button class="linkbtn" data-sort="spd">Kt</button></th><th></th>`
    : `<th><button class="linkbtn" data-sort="cs">Ship</button></th><th>Type</th><th class="n"><button class="linkbtn" data-sort="spd">Knots</button></th><th>Heading to</th><th></th>`;
  const row = a => air ? `<td class="mono">${esc(a.cs || a.hex)}</td><td>${a.t ? esc(a.t) : ''}${a.op ? `${a.t ? ' · ' : ''}<span class="dim">${esc(a.op)}</span>` : ''}${!a.t && !a.op ? '<span class="dim">—</span>' : ''}${a.role ? ` <span class="tag warn">${esc(a.role)}</span>` : ''}</td><td class="n">${a.gnd ? 'GND' : a.alt != null ? a.alt.toLocaleString('en-US') : '—'}</td><td class="n">${a.gs ?? '—'}</td><td>${a.emergency ? '<span class="tag down">SQ ' + esc(a.sq) + '</span>' : ''}${a.mil ? '<span class="tag warn">MIL</span>' : ''}${a.orbit ? ' <span class="tag warn" title="Turning in circles">ORBIT</span>' : ''}${a.abroad ? ` <span class="tag info">${A.scope.air === 'over' ? esc(a.cc || '?') : 'ABROAD'}</span>` : ''}</td>`
    : `<td>${esc(a.cs)}</td><td>${esc(a.t)}</td><td class="n">${a.gs ?? '—'}</td><td class="dim" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.dest || (a.gnd ? NAV[a.nav] || 'stopped' : '—'))}</td><td>${a.mil ? '<span class="tag warn">MIL</span>' : ''}${A.scope.sea === 'near' && a.flag ? ` <span class="tag n">${esc(a.flag)}</span>` : ''}</td>`;
  const empty = !S.iso ? 'Pick a country on the globe.' : !A.list.length ? (air ? 'No aircraft found for this country right now.' : (A.info?.state === 'live' ? 'No ships found yet. Give it a minute after connecting.' : 'No ships yet. Add an AISStream key to see ships.')) : 'Nothing matches these filters.';
  $('#aList').innerHTML = list.length ? `<table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows.map(a => `<tr class="click ${a.hex === A.sel ? 'on' : ''}" data-hex="${esc(a.hex)}">${row(a)}</tr>`).join('')}</tbody></table>${list.length > rows.length ? `<p class="note">Showing 250 of ${list.length}. Narrow with the filters.</p>` : ''}` : `<div class="empty">${empty}</div>`;
  renderAcDetail(); pushGlobe(); renderTrackNews();
}
$('#p-track').addEventListener('click', e => {
  const s = e.target.closest('[data-sort]'); if (s) { A.sort = s.dataset.sort; renderAc(); return; }
  const h = e.target.closest('[data-hex]'); if (h && h.closest('#aList, #aErr')) selectAc(h.dataset.hex, true);
  const em = e.target.closest('[data-em]'); if (em) { const [lon, lat] = em.dataset.em.split(',').map(Number); flyTo([lon, lat], 4); lift(); }
});
function renderAcDetail() {
  const a = A.list.find(x => x.hex === A.sel);
  if (!a) { $('#aDetail').innerHTML = ''; return; }
  let rows, links, tag;
  if (a.ship) {
    tag = a.mil ? '<span class="tag warn">MILITARY</span>' : `<span class="tag ok">${esc(a.t.toUpperCase())}</span>`;
    rows = [['MMSI', a.mmsi], ['IMO', a.imo], ['Call sign', a.callsign], ['Flag', a.flag ? (DATA[byA2[a.flag]]?.n || a.flag) : null], ['Type', a.t + (a.type != null ? ' (' + a.type + ')' : '')], ['Status', NAV[a.nav]], ['Speed', a.gs != null ? a.gs + ' kn' : null], ['Course', a.cog != null ? Math.round(a.cog) + '°' : null], ['Heading', a.hdg != null ? a.hdg + '°' : null], ['Destination', a.dest], ['Length', a.len ? a.len + ' m' : null], ['Position', a.lat.toFixed(3) + ', ' + a.lon.toFixed(3)], ['Last report', a.seen ? ago(a.seen) : null], ['Trail points', A.trail ? A.trail.length : '…']].filter(r => r[1]);
    links = `<a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${enc(a.mmsi)}" target="_blank" rel="noopener">MarineTraffic</a><a href="https://www.vesselfinder.com/vessels/details/${enc(a.imo || a.mmsi)}" target="_blank" rel="noopener">VesselFinder</a>`;
  } else {
    tag = (a.mil ? '<span class="tag warn">MILITARY</span>' : '<span class="tag info">CIVIL</span>') + (a.orbit ? '<span class="tag warn">ORBITING</span>' : '') + (a.emergency ? `<span class="tag down">${esc(a.emergency.toUpperCase())}</span>` : '') + (a.abroad && A.scope.air !== 'over' ? '<span class="tag info">ABROAD</span>' : '');
    rows = [['Hex', a.hex], ['Operator', a.op], ['Registered in', a.cc ? (DATA[byA2[a.cc]]?.n || a.cc) : null], ['Registration', a.r], ['Type', [a.t, a.desc].filter(Boolean).join(' · ')], ['Role', a.role], ['Operator', a.own], ['Altitude', a.gnd ? 'On ground' : a.alt != null ? a.alt.toLocaleString('en-US') + ' ft' : null], ['Ground speed', a.gs != null ? a.gs + ' kt' : null], ['Heading', a.trk != null ? a.trk + '°' : null], ['Vertical rate', a.vr != null ? a.vr + ' ft/min' : null], ['Squawk', a.sq ? a.sq + (a.emergency ? ' · ' + a.emergency : '') : null, a.emergency ? 'sq-em' : ''], ['Turning', a.orbit ? Math.round(a.orbit) + '° in 30 min' : null], ['Position', a.lat.toFixed(3) + ', ' + a.lon.toFixed(3)], ['Source', a.src], ['Trail points', A.trail ? A.trail.length : '…']].filter(r => r[1]);
    links = `<a href="https://globe.adsbexchange.com/?icao=${enc(a.hex)}" target="_blank" rel="noopener">ADS-B Exchange</a>${a.cs ? `<a href="https://www.flightradar24.com/${enc(a.cs)}" target="_blank" rel="noopener">Flightradar24</a>` : ''}<a href="https://adsb.lol/?icao=${enc(a.hex)}" target="_blank" rel="noopener">adsb.lol</a>`;
  }
  $('#aDetail').innerHTML = `<div class="detail"><div class="bar"><b class="mono" style="font-size:15px">${esc(a.cs || a.hex)}</b>${tag}<span class="grow"></span><button class="ic" id="aClose" title="Close" type="button">${ICON.close}</button></div>
    <div class="stats">${rows.map(([k, v, c]) => `<div class="row"><span>${k}</span><span class="${c || ''}">${esc(v)}</span></div>`).join('')}</div><div class="links">${links}</div></div>`;
  $('#aClose').onclick = () => { A.sel = null; A.trail = null; renderAc(); };
}
function selectAc(hex, fly) {
  A.sel = hex; A.trail = null; renderAc();
  const a = A.list.find(x => x.hex === hex); if (fly && a) { flyTo([a.lon, a.lat], Math.max(G.zoom, 3)); lift(); if (!G.over) sink(6000); }
  loadTrail();
}
async function loadTrail() { if (!A.sel) return; const sel = A.sel, key = A.kind === 'sea' ? 's' + sel : sel; try { const r = await api('/api/aircraft/trail?hex=' + enc(key)); if (A.sel === sel) { A.trail = r.trail; renderAcDetail(); pushGlobe(); } } catch (e) {} }
on('pick', ({ kind, item }) => { if (kind !== 'track' || !item.hex) return; if (A.replay && trk.tab === 'replay') return; if (!isOpen('track')) restore('track'); if (trk.tab !== 'live') { trk.tab = 'live'; $$('#p-track [data-seg="tab-track"] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === 'live')); trk.onTab('live'); } selectAc(item.hex, false); focusPanel('track'); });
$('#aAI').onclick = () => {
  const L = A.list; const pool = A.kind === 'air' ? L.filter(a => a.mil && (a.role || a.t)) : L.filter(a => a.mil);
  const types = d3.rollups(pool, v => v.length, a => a.role || a.t).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => t + ' ×' + n).join(', ');
  runAI($('#aAI'), $('#aAIBox'), { task: 'posture', country: S.d.n, total: A.kind === 'air' ? L.filter(a => !a.gnd).length : 0, mil: L.filter(a => a.mil).length, abroad: L.filter(a => a.abroad).length, orbit: L.filter(a => a.orbit).length, types: (A.kind === 'sea' ? 'ships: ' : '') + types });
};
// headlines that mention military movement, cross-referenced with what is visible on the radar
const MILWORDS = /\b(military|air ?force|jets?|fighter|bomber|drone|navy|naval|warship|destroyer|frigate|carrier|submarine|exercise|drill|airspace|intercept\w*|patrol|strike|missile|troops|deploy\w*)\b/i;
function renderTrackNews() {
  const box = $('#aNews'); if (!box) return;
  const heads = (typeof N !== 'undefined' ? N.clusters : []).filter(g => MILWORDS.test(g.lead.title)).slice(0, 5);
  const mil = A.list.filter(a => a.mil).length;
  box.innerHTML = heads.length ? `<span class="eyebrow">In the news · military activity</span><div class="list">${heads.map(g => `<div class="story"><div class="h"><a href="${esc(g.lead.link)}" target="_blank" rel="noopener">${esc(g.lead.title)}</a></div><div class="s"><span>${esc(g.lead.source)}</span><span>${esc(ago(g.lead.date))}</span></div></div>`).join('')}</div>
    <p class="note">${mil ? `${mil} military ${A.kind === 'air' ? 'aircraft are' : 'ships are'} broadcasting now.` : `None of this country's military ${A.kind === 'air' ? 'aircraft' : 'ships'} are broadcasting right now, which is common: transponders are often off.`}</p>` : '';
}
on('news', renderTrackNews);

// ---- replay: snapshots the server kept each time this country was loaded (up to 24 h)
async function loadReplay() {
  const box = $('#rBox'); if (!S.iso) { box.innerHTML = '<div class="empty">Pick a country on the globe.</div>'; return; }
  box.innerHTML = skeleton(3);
  try {
    const r = await api(`/api/aircraft/replay?cc=${S.d.a2}&mode=${A.scope.air}`);
    if (!r.frames?.length) { A.replay = null; box.innerHTML = '<div class="empty">No history yet. The server keeps a snapshot each time this country’s aircraft are loaded (every 1–10 minutes while it is open, and by the collector for your watchlist). Come back later.</div>'; pushGlobe(); return; }
    A.replay = r; A.rIdx = r.frames.length - 1; renderReplay();
  } catch (e) { box.innerHTML = errBox(e); }
}
function renderReplay() {
  const r = A.replay, n = r.frames.length; const fr = r.frames[A.rIdx];
  const mil = r.frames.map(f => f.a.filter(x => x[4]).length), all = r.frames.map(f => f.a.length);
  $('#rBox').innerHTML = `<div class="replay">
    <div class="bar"><button class="btn" id="rPlay" type="button">${A.playing ? 'Pause' : 'Play'}</button><input type="range" id="rSlider" class="grow" min="0" max="${n - 1}" value="${A.rIdx}" aria-label="Replay time"><b class="mono" id="rTime">${new Date(fr.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
    <div class="minis"><div class="mini"><small>Aircraft in frame</small><strong id="rAll">${fr.a.length}</strong>${spark(all, 'var(--info)')}</div><div class="mini"><small>Military in frame</small><strong class="down" id="rMil">${fr.a.filter(x => x[4]).length}</strong>${spark(mil, 'var(--warn)')}</div></div>
    <p class="note">${n} snapshots from ${esc(ago(r.frames[0].t))} to ${esc(ago(r.frames[n - 1].t))}. Drag the slider or press Play; the globe shows each moment. Switch back to Live to resume.</p></div>`;
  $('#rSlider').oninput = e => { A.rIdx = +e.target.value; stepReplay(); };
  $('#rPlay').onclick = () => { if (A.playing) stopReplay(); else { if (A.rIdx >= n - 1) A.rIdx = 0; A.playing = setInterval(() => { A.rIdx++; if (A.rIdx >= n) { A.rIdx = n - 1; stopReplay(); } stepReplay(); }, 450); } $('#rPlay').textContent = A.playing ? 'Pause' : 'Play'; };
  pushGlobe();
}
function stepReplay() { const fr = A.replay.frames[A.rIdx]; $('#rSlider').value = A.rIdx; $('#rTime').textContent = new Date(fr.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); $('#rAll').textContent = fr.a.length; $('#rMil').textContent = fr.a.filter(x => x[4]).length; pushGlobe(); }
function stopReplay() { clearInterval(A.playing); A.playing = null; const b = $('#rPlay'); if (b) b.textContent = 'Play'; }

// ---- alerts: emergency squawks worldwide + collector alerts about tracking
async function loadTrackAlerts() {
  const box = $('#eBox'); box.innerHTML = skeleton(3);
  try {
    const [em, al] = await Promise.all([api('/api/emergencies'), api('/api/alerts?hours=48' + (S.iso ? '&iso=' + S.iso : '')).catch(() => ({ list: [] }))]);
    const trackAl = al.list.filter(a => /air|mil|squawk|ship|orbit/i.test(a.kind + ' ' + a.title));
    box.innerHTML = `<span class="eyebrow">Emergency squawks worldwide</span>
      ${em.list.length ? `<div class="list">${em.list.map(a => `<div class="alert-row"><span class="sev crit">${esc(a.sq)}</span><div class="grow"><b>${esc(a.cs || a.hex)}</b> · ${esc(a.kind)}<div class="note">${esc(DATA[byA2[a.cc]]?.n || a.cc || 'Unknown registration')} · ${a.alt != null ? a.alt.toLocaleString('en-US') + ' ft' : ''}</div></div><button class="btn ghost" data-em="${a.lon},${a.lat}" type="button">Show</button></div>`).join('')}</div>` : '<p class="note">No aircraft are squawking 7500 (hijack), 7600 (radio failure) or 7700 (emergency) in the latest snapshot.</p>'}
      <span class="eyebrow">Tracking alerts${S.iso ? ' · ' + esc(S.d.n) : ''} · last 48 h</span>
      ${trackAl.length ? `<div class="list">${trackAl.map(a => `<div class="alert-row"><span class="sev ${esc(a.sev)}">${esc(a.sev)}</span><div class="grow"><b>${esc(a.title)}</b><div class="note">${esc(a.detail || '')} · ${esc(ago(a.t))}</div></div></div>`).join('')}</div>` : '<p class="note">No unusual activity. The collector compares military aircraft counts with the same hour over the past 14 days and raises an alert when it is 3 standard deviations above normal.</p>'}`;
  } catch (e) { box.innerHTML = errBox(e); }
}
trackChrome(); trk.onTab(trk.tab);
