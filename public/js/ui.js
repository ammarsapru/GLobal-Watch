'use strict';
/* App chrome: command palette (Ctrl+K), keyboard shortcuts, situation strip, alerts, settings, morning brief, risk badge. */

// ---------------- modal ----------------
function openModal(title, html, onOpen) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modal').hidden = false; onOpen && onOpen($('#modalBody')); }
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }
$('#modalClose').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// ---------------- command palette ----------------
const PAL = { items: [], hits: [], i: 0 };
const LAYER_NAMES = { night: 'Day / night', sunmoon: 'Sun & moon', tz: 'Time zones', air: 'Aircraft & ships', sats: 'Satellites', hazards: 'Hazards', unrest: 'Unrest', places: 'Places in the news', arcs: 'Trade arcs' };
function palItems() {
  const L = [];
  for (const [k, v] of Object.entries(DATA)) L.push({ kind: 'Country', label: v.n, key: k, run: () => emit('country', k) });
  for (const id of ORDER) if (panels[id]) L.push({ kind: 'Panel', label: (isOpen(id) ? 'Focus ' : 'Open ') + panels[id].title, run: () => isOpen(id) ? focusPanel(id) : restore(id, { focus: true }) });
  for (const [k, l] of Object.entries(LAYOUTS)) L.push({ kind: 'Layout', label: 'Layout: ' + l.name, run: () => setLayout(k) });
  for (const [k, n] of Object.entries(LAYER_NAMES)) L.push({ kind: 'Layer', label: (GL.layers[k] ? 'Hide ' : 'Show ') + n, run: () => toggleLayer(k) });
  for (const [k, c] of Object.entries(CHORO)) L.push({ kind: 'Map colour', label: c ? 'Colour countries by ' + c.name : 'Turn off map colouring', run: () => setChoro(k) });
  L.push({ kind: 'Action', label: 'Ask a question (voice)', hint: 'P', run: () => startListening() });
  L.push({ kind: 'Action', label: 'World view', hint: 'W', run: () => worldMode() });
  L.push({ kind: 'Action', label: 'Morning brief', run: () => showBrief() });
  L.push({ kind: 'Action', label: 'Alerts', run: () => toggleAlerts(true) });
  L.push({ kind: 'Action', label: 'Settings and watchlist', run: () => openSettings() });
  L.push({ kind: 'Action', label: 'Keyboard shortcuts', hint: '?', run: () => showKeys() });
  L.push({ kind: 'Action', label: 'Mark all news as seen', run: () => $('#nSeen')?.click() });
  L.push({ kind: 'Action', label: 'Reconnect AI', run: () => reconnectAI() });
  return L;
}
function openPalette() { PAL.items = palItems(); $('#palette').hidden = false; $('#palInput').value = ''; palFilter(); $('#palInput').focus(); }
function closePalette() { $('#palette').hidden = true; }
function palFilter() {
  const t = $('#palInput').value.trim().toLowerCase();
  const score = it => { const l = it.label.toLowerCase(); if (!t) return it.kind === 'Country' ? 0 : 1; if (l.startsWith(t) || it.key?.toLowerCase() === t) return 3; if (l.split(/\s+/).some(w => w.startsWith(t))) return 2; return l.includes(t) ? 1 : 0; };
  PAL.hits = PAL.items.map(it => [score(it), it]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 12).map(x => x[1]); PAL.i = 0;
  if (!t) PAL.hits = PAL.items.filter(i => i.kind !== 'Country').slice(0, 12);
  $('#palList').innerHTML = PAL.hits.map((h, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}" role="option">${esc(h.label)}${h.hint ? ` <kbd>${esc(h.hint)}</kbd>` : ''}<small>${esc(h.kind)}</small></button>`).join('') || '<p class="note" style="padding:8px">Nothing matches.</p>';
}
function palRun(i) { const h = PAL.hits[i]; if (!h) return; closePalette(); h.run(); }
$('#palInput').addEventListener('input', palFilter);
$('#palInput').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); PAL.i = (PAL.i + (e.key === 'ArrowDown' ? 1 : -1) + PAL.hits.length) % PAL.hits.length; $$('#palList button').forEach((b, i) => b.classList.toggle('on', i === PAL.i)); $$('#palList button')[PAL.i]?.scrollIntoView({ block: 'nearest' }); }
  if (e.key === 'Enter') { e.preventDefault(); palRun(PAL.i); }
  if (e.key === 'Escape') closePalette();
});
$('#palList').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) palRun(+b.dataset.i); });
$('#palette').addEventListener('click', e => { if (e.target.id === 'palette') closePalette(); });
$('#paletteBtn').onclick = openPalette;
function toggleLayer(k) { GL.layers[k] = !GL.layers[k]; store.set('layers', GL.layers); const c = $(`#layersMenu [data-layer="${k}"]`); if (c) c.checked = GL.layers[k]; updateSunInfo(); emit('layers', GL.layers); toast(LAYER_NAMES[k] + (GL.layers[k] ? ' on' : ' off')); }

// ---------------- shortcuts ----------------
const KEYS = [['P', 'Ask out loud (tap to start, tap to send, or hold)'], ['Ctrl K or /', 'Command palette'], ['W', 'World view'], ['G', 'Raise the globe'], ['L', 'Globe layers'], ['1–9', 'Open or focus a panel'], ['B', 'Morning brief'], ['A', 'Alerts'], ['?', 'This help'], ['Esc', 'Close whatever is open']];
function showKeys() { openModal('Keyboard shortcuts', `<div class="keys">${KEYS.map(([k, d]) => `<div><kbd>${esc(k)}</kbd><span>${esc(d)}</span></div>`).join('')}</div><p class="note">Panels by number: ${ORDER.map((id, i) => `${i + 1} ${esc(panels[id]?.short || id)}`).join(' · ')}</p>`); }
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); return; }
  if (e.key === 'Escape') { if (!$('#palette').hidden) return closePalette(); if (!$('#modal').hidden) return closeModal(); if (!$('#alertsPop').hidden) return toggleAlerts(false); if (!$('#layersMenu').hidden) return toggleLayers(false); showCard(null); closeMax(); return; }
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !$('#voice').hidden) return;
  const k = e.key;
  if (k === '/') { e.preventDefault(); openPalette(); }
  else if (k === 'w' || k === 'W') worldMode();
  else if (k === 'g' || k === 'G') { lift(); $('#globe').focus(); sink(6000); }
  else if (k === 'l' || k === 'L') toggleLayers();
  else if (k === 'b' || k === 'B') showBrief();
  else if (k === 'a' || k === 'A') toggleAlerts();
  else if (k === '?') showKeys();
  else if (/^[1-9]$/.test(k)) { const id = ORDER[+k - 1]; if (id && panels[id]) isOpen(id) ? focusPanel(id) : restore(id, { focus: true }); }
});

// ---------------- layouts select ----------------
$('#layoutSel').innerHTML = Object.entries(LAYOUTS).map(([k, l]) => `<option value="${k}">${esc(l.name)}</option>`).join('') + '<option value="custom">My layout</option>';
$('#layoutSel').value = layout.key || 'custom';
$('#layoutSel').onchange = e => setLayout(e.target.value);

// ---------------- situation strip ----------------
async function loadStrip() {
  try {
    const r = await api('/api/situation');
    $('#strip').innerHTML = `<span class="lbl">Watching</span>
      <button class="sit ${S.world ? 'on' : ''}" type="button" data-world="1" title="World view"><span class="dotsev"></span><b>World</b></button>
      ${r.list.map(x => { const vals = x.mil.map(p => p[1]); return `<button class="sit ${x.iso === S.iso ? 'on' : ''}" type="button" data-iso="${x.iso}" title="${esc(x.latest?.title || 'No alerts in the last 24 h')}"><span class="dotsev ${x.level === 'calm' ? '' : x.level}"></span><b>${esc(x.name || x.iso)}</b>${x.alerts ? `<span class="why">${esc(x.latest?.title || x.alerts + ' alerts')}</span>` : ''}${vals.length > 2 ? spark(vals, 'var(--warn)', 46, 16) : ''}</button>`; }).join('')}
      <button class="sit add" type="button" data-addwatch="1" title="Edit watchlist">+ Watch</button><span class="grow"></span>`;
  } catch (e) { $('#strip').innerHTML = `<span class="lbl">Watchlist unavailable: ${esc(e.message)}</span>`; }
}
$('#strip').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.world) worldMode(); else if (b.dataset.addwatch) openSettings(); else if (b.dataset.iso) emit('country', b.dataset.iso); });
on('country', () => setTimeout(() => $$('#strip .sit[data-iso]').forEach(b => b.classList.toggle('on', b.dataset.iso === S.iso)), 50));

// ---------------- alerts ----------------
const AL = { list: [], seen: store.get('alertsSeen', 0), notified: store.get('alertsNotified', 0) };
async function pollAlerts() {
  try {
    const r = await api('/api/alerts?hours=48'); AL.list = r.list.slice().sort((a, b) => b.t - a.t);
    const fresh = AL.list.filter(a => a.t > AL.seen).length; const b = $('#alertCount'); b.hidden = !fresh; b.textContent = fresh > 99 ? '99+' : fresh;
    $('#alertBtn').classList.toggle('hot', AL.list.some(a => a.t > AL.seen && a.sev === 'crit'));
    const toNotify = AL.list.filter(a => a.t > AL.notified && a.sev !== 'info');
    if (toNotify.length && 'Notification' in window && Notification.permission === 'granted' && document.hidden) for (const a of toNotify.slice(0, 3)) new Notification('Global Watch', { body: a.title, tag: a.key });
    if (AL.list[0]) { AL.notified = Math.max(AL.notified, AL.list[0].t); store.set('alertsNotified', AL.notified); }
    if (!$('#alertsPop').hidden) renderAlerts();
  } catch (e) {}
}
function renderAlerts() {
  const p = $('#alertsPop');
  p.innerHTML = `<div class="bar"><b class="grow">Alerts · last 48 h</b>${'Notification' in window && Notification.permission === 'default' ? '<button class="btn ghost" id="alNotif" type="button">Desktop notifications</button>' : ''}<button class="btn ghost" id="alRules" type="button">Rules</button></div>
    ${AL.list.length ? AL.list.slice(0, 60).map(a => `<div class="alert-row ${a.t > AL.seen ? 'unseen' : ''}" ${a.iso ? `data-iso="${a.iso}"` : ''} ${a.lat != null ? `data-ll="${a.lon},${a.lat}"` : ''}><span class="sev ${esc(a.sev)}">${esc(a.kind)}</span><div class="grow"><b>${esc(a.title)}</b><div class="note">${esc(a.detail || '')}${a.detail ? ' · ' : ''}${esc(ago(a.t))}${a.link ? ` · <a class="ext" href="${esc(a.link)}" target="_blank" rel="noopener">source</a>` : ''}</div></div></div>`).join('')
      : '<p class="note" style="padding:6px">No alerts. The collector checks earthquakes, disaster alerts, internet outages, advisory changes, emergency squawks, unusual military air activity and your keyword rules in the background.</p>'}`;
  $('#alNotif')?.addEventListener('click', () => Notification.requestPermission().then(renderAlerts));
  $('#alRules').onclick = () => { toggleAlerts(false); openSettings(); };
}
function toggleAlerts(show) {
  const p = $('#alertsPop'); show = show ?? p.hidden; p.hidden = !show;
  if (show) { renderAlerts(); AL.seen = Date.now(); store.set('alertsSeen', AL.seen); $('#alertCount').hidden = true; $('#alertBtn').classList.remove('hot'); }
}
$('#alertBtn').onclick = e => { e.stopPropagation(); toggleAlerts(); };
$('#alertsPop').addEventListener('click', e => { if (e.target.closest('a')) return; const r = e.target.closest('.alert-row'); if (!r) return; if (r.dataset.iso) emit('country', r.dataset.iso); if (r.dataset.ll) { const [lon, lat] = r.dataset.ll.split(',').map(Number); setTimeout(() => { flyTo([lon, lat], 3); lift(); sink(5000); }, 300); } });
document.addEventListener('click', e => { if (!$('#alertsPop').hidden && !e.target.closest('#alertsPop, #alertBtn')) toggleAlerts(false); });

// ---------------- settings ----------------
async function openSettings() {
  const s = S.settings; const st = S.status || {};
  const voices = ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter(v => /^en|^(fr|de|es|ar|zh|ja|hi|ur)/.test(v.lang));
  openModal('Settings', `
    <section><span class="eyebrow">Watchlist</span><p class="note">Countries in the strip at the top. The collector checks them every 15 minutes and builds baselines for anomaly alerts.</p>
      <div class="chiplist" id="stWatch">${s.watch.map(i => `<button class="tag n" type="button" data-rm="${i}">${esc(DATA[i]?.n || i)} ✕</button>`).join('')}</div>
      <div class="bar"><input id="stWatchAdd" class="inp grow" placeholder="Add a country…" list="stCountries"><datalist id="stCountries">${Object.entries(DATA).map(([k, v]) => `<option value="${esc(v.n)}">`).join('')}</datalist>${S.iso ? `<button class="btn ghost" id="stAddCur" type="button">Add ${esc(S.d.n)}</button>` : ''}</div></section>
    <section><span class="eyebrow">Keyword alert rules</span><p class="note">Raise an alert when a watched country's headlines contain any of these words.</p>
      <div class="chiplist" id="stRules">${s.rules.map((r, i) => `<button class="tag n" type="button" data-rr="${i}">${esc(r.kw)} ✕</button>`).join('')}</div>
      <div class="bar"><input id="stRuleAdd" class="inp grow" placeholder="e.g. coup, blockade, default"><button class="btn ghost" id="stRuleBtn" type="button">Add rule</button></div></section>
    <section><span class="eyebrow">Travel</span><div class="form"><label>Your passport<select id="stPass">${Object.values(DATA).map(d => d.a2).filter(Boolean).sort().map(a => `<option value="${a}" ${a === s.passport ? 'selected' : ''}>${esc(DATA[byA2[a]]?.n || a)}</option>`).join('')}</select></label>
      <label>Morning brief at<input id="stBrief" type="time" value="${esc(s.briefTime)}"></label></div></section>
    <section><span class="eyebrow">Voice</span><div class="form"><label>Voice<select id="stVoice"><option value="">Automatic</option>${voices.map(v => `<option ${v.name === store.get('voiceName', '') ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <label>Speed<input id="stRate" type="range" min=".7" max="1.4" step=".05" value="${store.get('voiceRate', 1.02)}"></label>
      <label class="check"><input type="checkbox" id="stMute" ${store.get('voiceMute', false) ? 'checked' : ''}>Show answers without speaking</label>
      <label>Speech language<input id="stLang" value="${esc(store.get('vlang', navigator.language || 'en-US'))}" placeholder="en-US"></label></div>
      <div class="bar"><button class="btn ghost" id="stTest" type="button">Test voice</button></div></section>
    <section><span class="eyebrow">Connections</span>
      <div class="stats"><div class="row"><span>AI</span><span class="${st.ai?.connected ? 'up' : 'down'}">${st.ai?.connected ? esc(st.ai.provider + ' · ' + st.ai.model) : 'offline'}</span></div>
      <div class="row"><span>SerpAPI</span><span>${st.mock ? 'sample data' : esc((st.serp?.searches_left ?? '?') + ' searches left')}</span></div>
      <div class="row"><span>Ships (AISStream)</span><span>${esc(st.ais?.state || 'off')}</span></div>
      <div class="row"><span>OpenSky</span><span>${st.opensky?.authenticated ? 'signed in' : 'anonymous'} · refresh ${esc(st.opensky?.refreshSeconds ?? '?')} s</span></div>
      <div class="row"><span>Collector</span><span>${esc(st.collector?.runs ?? 0)} runs${Object.keys(st.collector?.errors || {}).length ? ' · errors: ' + esc(Object.keys(st.collector.errors).join(', ')) : ''}</span></div></div>
      <div class="bar"><button class="btn ghost" id="stAI" type="button">Reconnect AI</button><a class="btn ghost" href="/api/diag${S.iso ? '?iso=' + S.iso : ''}" target="_blank" rel="noopener">Check every data source</a></div></section>
    <div class="bar"><span class="grow"></span><button class="btn solid" id="stSave" type="button">Save</button></div>`, body => {
    const draft = structuredClone(s);
    const redraw = () => { $('#stWatch').innerHTML = draft.watch.map(i => `<button class="tag n" type="button" data-rm="${i}">${esc(DATA[i]?.n || i)} ✕</button>`).join(''); $('#stRules').innerHTML = draft.rules.map((r, i) => `<button class="tag n" type="button" data-rr="${i}">${esc(r.kw)} ✕</button>`).join(''); };
    const addIso = iso => { if (iso && !draft.watch.includes(iso) && draft.watch.length < 12) { draft.watch.push(iso); redraw(); } };
    $('#stWatch').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { draft.watch = draft.watch.filter(x => x !== b.dataset.rm); redraw(); } };
    $('#stRules').onclick = e => { const b = e.target.closest('[data-rr]'); if (b) { draft.rules.splice(+b.dataset.rr, 1); redraw(); } };
    $('#stWatchAdd').onchange = e => { const n = e.target.value.trim().toLowerCase(); const k = Object.keys(DATA).find(k => DATA[k].n.toLowerCase() === n || k.toLowerCase() === n); addIso(k); e.target.value = ''; };
    $('#stAddCur') && ($('#stAddCur').onclick = () => addIso(S.iso));
    const addRule = () => { const v = $('#stRuleAdd').value.trim(); if (v && !draft.rules.some(r => r.kw.toLowerCase() === v.toLowerCase())) { draft.rules.push({ kw: v }); redraw(); } $('#stRuleAdd').value = ''; };
    $('#stRuleBtn').onclick = addRule; $('#stRuleAdd').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } };
    $('#stTest').onclick = () => { store.set('voiceName', $('#stVoice').value); store.set('voiceRate', +$('#stRate').value); store.set('voiceMute', false); speak('Global Watch is ready. Press P whenever you want to ask something.'); };
    $('#stAI').onclick = reconnectAI;
    $('#stSave').onclick = async () => {
      draft.passport = $('#stPass').value; draft.briefTime = $('#stBrief').value || '07:30';
      store.set('voiceName', $('#stVoice').value); store.set('voiceRate', +$('#stRate').value); store.set('voiceMute', $('#stMute').checked); store.set('vlang', $('#stLang').value.trim() || 'en-US');
      try { S.settings = await post('/api/settings', draft); emit('settings', S.settings); closeModal(); toast('Settings saved.'); loadStrip(); } catch (e) { toast(e.message, 5000); }
    };
  });
}
on('openSettings', openSettings);
$('#settingsBtn').onclick = openSettings;
async function reconnectAI() { toast('Looking for an AI endpoint…'); const r = await api('/api/ai/reconnect').catch(e => ({ error: e.message })); toast(r.connected ? 'AI connected: ' + r.provider + ' · ' + r.model : 'Still offline. ' + (r.error || ''), 6000); refreshStatus(); }

// ---------------- morning brief ----------------
async function showBrief(regen) {
  openModal('Morning brief', skeleton(6));
  try {
    const r = await api('/api/brief' + (regen ? '?generate=1' : ''));
    $('#modalBody').innerHTML = (r.text ? `<div class="brief" style="white-space:pre-wrap">${esc(r.text)}</div><p class="note">Written ${esc(ago(r.t))}${r.provider ? ' by ' + esc(r.provider) : ''} from the last 24 h of alerts, headlines and indicators for your watchlist. Next one at ${esc(S.settings.briefTime)}.</p>`
      : `<p class="note">No brief yet. It is written every day at ${esc(S.settings.briefTime)} from what the collector saw overnight.</p>`)
      + `<div class="bar"><button class="btn" id="brGen" type="button">${r.text ? 'Rewrite now' : 'Write one now'}</button><button class="btn ghost" id="brSpeak" type="button" ${r.text ? '' : 'disabled'}>Read aloud</button></div>`;
    $('#brGen').onclick = () => showBrief(true); $('#brSpeak').onclick = () => speak(r.text);
  } catch (e) { $('#modalBody').innerHTML = e.code === 'no_ai' ? `<p class="down">The brief needs the AI to be connected.</p><p class="note">${esc(e.message)}</p>` : errBox(e); }
}

// ---------------- risk badge in header ----------------
on('risk', r => { const b = $('#riskBadge'); if (!b || r.iso !== S.iso) return; b.hidden = r.score == null; b.className = 'risk l' + r.level; b.textContent = r.score ?? ''; b.title = `Risk score ${r.score}/100 (open Government › Risk for the breakdown)`; });
document.addEventListener('click', e => { if (e.target.closest('#riskBadge')) { restore('gov', { focus: true }); setTimeout(() => { const btn = $('#p-gov [data-seg="tab-gov"] [data-v="risk"]'); btn && btn.click(); }, 400); } });

// ---------------- status pills ----------------
async function refreshStatus() {
  try {
    const s = await api('/api/status'); S.status = s;
    const pills = [];
    if (s.mock) pills.push(`<span class="pill acc" title="No SERPAPI_KEY in .env, or MOCK=1. Google data is sample data.">SAMPLE DATA</span>`);
    else if (s.serp.error) pills.push(`<span class="pill bad" title="${esc(s.serp.error)}">SERPAPI ERROR</span>`);
    else pills.push(`<span class="pill ${s.serp.searches_left > 20 ? 'ok' : 'bad'}" title="SerpAPI searches left this month (${esc(s.serp.plan || '')}).">SERPAPI · ${s.serp.searches_left ?? '?'}</span>`);
    pills.push(s.ai.connected ? `<span class="pill ok" title="${esc((s.ai.base || '') + ' · ' + s.ai.model)}">AI · ${esc(s.ai.provider)}</span>` : `<button class="pill bad" id="aiRetry" type="button" title="${esc(s.ai.error || '')} — click to retry">AI OFFLINE</button>`);
    if (s.ais?.state === 'live') pills.push(`<span class="pill ok" title="AISStream connected">SHIPS LIVE</span>`);
    $('#status').innerHTML = pills.join('');
    $('#aiRetry')?.addEventListener('click', reconnectAI);
  } catch (e) { $('#status').innerHTML = '<span class="pill bad">SERVER OFFLINE</span>'; }
}
