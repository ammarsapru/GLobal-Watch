'use strict';
/* Voice assistant. Press P (tap to start, tap again to send; or hold P and release to send).
   Speech → text in the browser (Web Speech API), question + on-screen context → /api/ask (routes to the right feeds,
   answers with citations), answer read aloud with speech synthesis. The orb reacts to your microphone level. */
const V = { state: 'idle', rec: null, final: '', interim: '', stream: null, an: null, ac: null, level: 0, raf: 0, t0: 0, holdT: 0, held: false, last: null, speakLvl: 0 };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const ORB_COLS = ['#e6a23c', '#6ea8d6', '#5fbf88', '#e0735a', '#9b86d6'];
const PANEL_OF = { news: 'news', finance: 'fin', fx: 'fin', trade: 'trade', travel: 'travel', weather: 'weather', tracking: 'track', defence: 'track', hazards: 'events', unrest: 'events', stability: 'events', gov: 'gov', space: 'space', alerts: 'events' };

function setVState(s, label) {
  V.state = s; $('#voice').dataset.state = s;
  $('#vState').textContent = label || { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking', idle: 'Ask anything', error: 'Something went wrong' }[s];
  $('#micBtn').classList.toggle('on', s === 'listening');
  $('#vStop').textContent = s === 'listening' ? 'Send (P)' : 'Stop speaking'; $('#vStop').classList.toggle('solid', s === 'listening');
}
function openVoice() {
  const v = $('#voice'); if (v.hidden) { v.hidden = false; anim(v, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 }); }
  if (!V.raf) { V.t0 = performance.now(); V.raf = requestAnimationFrame(drawOrb); }
}
function closeVoice() {
  stopListening(true); speechSynthesis.cancel(); setVState('idle');
  $('#voice').hidden = true; cancelAnimationFrame(V.raf); V.raf = 0;
}
async function startListening() {
  speechSynthesis.cancel(); openVoice();
  V.final = ''; V.interim = ''; $('#vQ').innerHTML = ''; $('#vAnswer').hidden = true; $('#vInput').value = '';
  if (!SR) { setVState('idle', 'Voice input isn’t supported in this browser. Type your question below (Chrome and Edge support voice).'); $('#vInput').focus(); return; }
  setVState('listening');
  try {
    V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    V.ac = new (window.AudioContext || window.webkitAudioContext)(); const src = V.ac.createMediaStreamSource(V.stream);
    V.an = V.ac.createAnalyser(); V.an.fftSize = 512; V.an.smoothingTimeConstant = .6; src.connect(V.an);
  } catch (e) { V.an = null; if (e.name === 'NotAllowedError') { setVState('error', 'Microphone access was blocked. Allow it in the address bar, or type below.'); $('#vInput').focus(); return; } }
  const rec = new SR(); V.rec = rec; rec.lang = store.get('vlang', navigator.language || 'en-US'); rec.continuous = true; rec.interimResults = true;
  rec.onresult = e => { let fin = '', int = ''; for (let i = 0; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else int += t; } V.final = fin; V.interim = int; $('#vQ').innerHTML = esc(fin) + `<span class="interim">${esc(int)}</span>`; };
  rec.onerror = e => { if (e.error === 'no-speech' || e.error === 'aborted') return; setVState('error', e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it, or type below.' : e.error === 'network' ? 'Speech recognition needs an internet connection (Chrome sends audio to Google). Type below instead.' : 'Speech recognition error: ' + e.error); };
  rec.onend = () => { if (V.rec === rec && V.state === 'listening') { try { rec.start(); } catch (e) {} } }; // Chrome stops after silence; keep going until the user sends
  try { rec.start(); } catch (e) { setVState('error', 'Could not start the microphone: ' + e.message); }
}
function stopListening(discard) {
  const rec = V.rec; V.rec = null; if (rec) { rec.onend = null; try { discard ? rec.abort() : rec.stop(); } catch (e) {} }
  if (V.stream) { V.stream.getTracks().forEach(t => t.stop()); V.stream = null; }
  if (V.ac) { V.ac.close().catch(() => {}); V.ac = null; } V.an = null;
}
function sendSpoken() {
  const q = (V.final + ' ' + V.interim).trim(); stopListening(false);
  if (!q) { setVState('idle', 'I didn’t catch that. Press P and try again, or type below.'); return; }
  askQuestion(q);
}
function clientContext() {
  const parts = [];
  if (S.iso) parts.push(`Selected country: ${S.d.n}.`); else parts.push('No country selected (world view).');
  parts.push('Open panels: ' + placed().map(id => panels[id]?.title).filter(Boolean).join(', ') + '.');
  if (typeof N !== 'undefined' && N.clusters?.length) parts.push('Top headlines on screen: ' + N.clusters.slice(0, 5).map(g => g.lead.title).join(' | '));
  if (typeof A !== 'undefined' && A.list?.length) parts.push(`${A.kind === 'air' ? 'Aircraft' : 'Ships'} on screen: ${A.list.length}, military ${A.list.filter(a => a.mil).length}${A.list.some(a => a.orbit) ? ', orbiting ' + A.list.filter(a => a.orbit).length : ''}.`);
  if (S.risk?.iso === S.iso && S.risk.score != null) parts.push(`Risk score on screen: ${S.risk.score}/100.`);
  const c = { screen: parts.join(' '), passport: S.settings.passport };
  if (typeof M !== 'undefined' && M.sym && M.quote?.summary) c.quote = `${M.quote.summary.title || M.sym} (${M.sym}) ${M.quote.summary.price ?? ''} ${M.quote.summary.move ?? ''}`.trim();
  if (typeof A !== 'undefined' && A.kind === 'sea' && A.list.length) c.ships = `${A.list.length} ships, ${A.list.filter(s => s.mil).length} military, ${A.dark.length} went dark`;
  if (S.f) c.bbox = countryBox(S.f, 3);
  return c;
}
async function askQuestion(q) {
  openVoice(); setVState('thinking', 'Looking into it…'); $('#vQ').textContent = q; $('#vAnswer').hidden = true;
  try {
    const history = store.get('askHistory', []).slice(0, 2).reverse().map(h => ({ q: h.q, a: h.a }));
    const r = await post('/api/ask', { question: q, iso: S.iso, client: clientContext(), history });
    V.last = r;
    if (r.plan) await arrangeBoard(r.plan);
    showAnswer(r);
    speakSegments(r.speech?.length ? r.speech : [{ text: r.answer, panel: null }]);
    store.set('askHistory', [{ q, a: r.answer, t: Date.now() }, ...store.get('askHistory', [])].slice(0, 30));
  } catch (e) {
    setVState('error', e.code === 'no_ai' ? 'The AI isn’t connected, so I can’t answer yet.' : 'Couldn’t answer: ' + e.message);
    $('#vAnswer').hidden = false; $('#vAnswer').innerHTML = e.code === 'no_ai' ? `${esc(e.message)}<p class="note">Start Ollama (or set AI_BASE_URL in .env) and press Reconnect AI in Settings.</p>` : errBox(e);
  }
}
// put the country on the globe and lay the board out around what was asked
async function arrangeBoard(plan) {
  if (plan.newsQuery) setNewsQuery(plan.newsQuery, plan.iso);
  if (plan.iso && plan.iso !== S.iso) emit('country', plan.iso); else if (plan.newsQuery && isOpen('news')) loadNews();
  layout = { key: 'custom', left: plan.layout.left, center: plan.layout.center, right: plan.layout.right };
  saveLayout(); applyLayout();
  for (const id of placed()) panels[id]?.onShow && panels[id].onShow();
  for (const [id, tab] of Object.entries(plan.tabs || {})) { const b = $(`#p-${id} [data-seg="tab-${id}"] [data-v="${tab}"]`); if (b && panels[id]?.tab !== tab) b.click(); }
  if (S.f) { flyTo(S.f.c, 1.2); lift(); sink(9000); }
  await new Promise(r => setTimeout(r, 350));
}
function showAnswer(r) {
  const box = $('#vAnswer'); box.hidden = false;
  const byN = Object.fromEntries(r.sources.map(s => [s.n, s]));
  const cite = t => esc(t || '').replace(/\[(\d+(?:,\s*\d+)*)\]/g, (m, ns) => ns.split(/,\s*/).map(n => byN[n] ? `<a class="cite" href="${esc(byN[n].url || '#')}" target="_blank" rel="noopener" title="${esc(byN[n].title)}">${n}</a>` : '').join(''));
  const P = r.parts || { answer: r.answer };
  const used = r.sources.filter(s => s.used);
  const where = r.countries?.length ? r.countries.map(i => DATA[i]?.n || i).join(', ') : 'the world';
  box.innerHTML = `${P.opening ? `<p class="vopen">${cite(P.opening)}</p>` : ''}
    <section><span class="eyebrow">What you asked${r.topic ? ` · “${esc(r.topic)}” in ${esc(where)}` : ''}</span><p>${cite(P.answer)}</p></section>
    ${P.perspectives?.length ? `<section><span class="eyebrow">What outlets are saying</span><ul class="persp">${P.perspectives.map(x => `<li><b>${esc(x.source)}</b> ${cite(x.says)}</li>`).join('')}</ul></section>` : ''}
    ${P.assessment ? `<section class="assess"><span class="eyebrow">My read · analysis, not fact</span><p>${cite(P.assessment)}</p></section>` : ''}
    ${P.also ? `<section><span class="eyebrow">Also on your board</span><p>${cite(P.also)}</p></section>` : ''}
    ${P.missing || r.unavailable?.length ? `<section class="miss"><span class="eyebrow">Not available</span><p>${cite(P.missing || '')}${r.unavailable?.length ? `<span class="note"> Couldn’t load: ${esc(r.unavailable.map(x => String(x).replace(/\s*\(.*\)$/, '')).join(', '))}.</span>` : ''}</p></section>` : ''}
    ${used.length ? `<details class="srcs"><summary class="eyebrow">Sources (${used.length})</summary>${used.map(s => `<a href="${esc(s.url || '#')}" target="_blank" rel="noopener"><b>${s.n}</b> ${esc(s.title)}</a>`).join('')}</details>` : ''}
    <p class="note">Looked at: ${esc((r.panels || []).join(', ') || 'general')} · ${esc(where)}. The board has been arranged around this question.</p>`;
}
function pickVoice() {
  const vs = speechSynthesis.getVoices(); const lang = (store.get('vlang', navigator.language || 'en-US')).slice(0, 2);
  const want = store.get('voiceName', '');
  return vs.find(v => v.name === want) || vs.find(v => v.lang.startsWith(lang) && /natural|neural|online/i.test(v.name)) || vs.find(v => v.lang.startsWith(lang) && /google/i.test(v.name)) || vs.find(v => v.lang.startsWith(lang)) || vs[0];
}
function speak(text) { speakSegments([{ text, panel: null }]); }
// speak section by section and highlight the panel each section is about
function speakSegments(segs) {
  if (!('speechSynthesis' in window) || store.get('voiceMute', false)) { setVState('idle', 'Answer'); return; }
  speechSynthesis.cancel();
  const voice = pickVoice(); const items = [];
  for (const sg of segs) {
    const clean = String(sg.text || '').replace(/\[\d+(?:,\s*\d+)*\]/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim(); if (!clean) continue;
    const chunks = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean]; // Chrome cuts long utterances off after ~15 s
    chunks.forEach((c, k) => items.push({ text: c.trim(), panel: k === 0 ? sg.panel : null }));
  }
  if (!items.length) { setVState('idle', 'Answer'); return; }
  let left = items.length; setVState('speaking');
  for (const it of items) {
    const u = new SpeechSynthesisUtterance(it.text); if (voice) u.voice = voice; u.rate = +store.get('voiceRate', 1.02); u.pitch = 1;
    u.onstart = () => { if (it.panel && isOpen(it.panel)) focusPanel(it.panel); };
    u.onboundary = () => { V.speakLvl = 1; };
    u.onend = u.onerror = () => { if (--left <= 0 && V.state === 'speaking') setVState('idle', 'Press P to ask a follow-up'); };
    speechSynthesis.speak(u);
  }
}
speechSynthesis?.addEventListener?.('voiceschanged', () => {});

// ---- the orb: additive colour blobs that swirl; size follows mic level (listening) or speech rhythm (speaking)
function micLevel() {
  if (!V.an) return 0; const a = new Uint8Array(V.an.fftSize); V.an.getByteTimeDomainData(a);
  let s = 0; for (const x of a) { const d = (x - 128) / 128; s += d * d; } return Math.min(1, Math.sqrt(s / a.length) * 4);
}
function drawOrb(now) {
  V.raf = requestAnimationFrame(drawOrb);
  const cv = $('#orbCanvas'), c = cv.getContext('2d'), W = cv.width, R = W / 2, t = (now - V.t0) / 1000;
  let target = 0;
  if (V.state === 'listening') target = micLevel();
  else if (V.state === 'speaking') { V.speakLvl *= .92; target = .25 + .35 * V.speakLvl + .1 * Math.sin(t * 9); }
  else if (V.state === 'thinking') target = .18 + .08 * Math.sin(t * 3);
  else target = .06;
  V.level += (target - V.level) * .18;
  c.clearRect(0, 0, W, W);
  const base = R * (.38 + V.level * .18), spin = V.state === 'thinking' ? 2.2 : V.state === 'speaking' ? 1.2 : .6;
  // dark disc so the colours read as lobes, not a white glare
  c.fillStyle = 'rgba(8,12,16,.9)'; c.beginPath(); c.arc(R, R, base * 1.08, 0, 7); c.fill();
  c.save(); c.beginPath(); c.arc(R, R, base * 1.06, 0, 7); c.clip(); c.globalCompositeOperation = 'screen';
  ORB_COLS.forEach((col, i) => {
    const ph = t * spin * (1 + i * .19) + i * (Math.PI * 2 / ORB_COLS.length); const off = base * (.42 + V.level * .25 + .08 * Math.sin(t * 1.3 + i));
    const x = R + Math.cos(ph) * off, y = R + Math.sin(ph * 1.07) * off; const r = base * (.85 + .15 * Math.sin(t * 1.7 + i) + V.level * .3);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col + 'b0'); g.addColorStop(.55, col + '40'); g.addColorStop(1, col + '00');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  });
  c.restore();
  // outer glow follows the voice
  const glow = c.createRadialGradient(R, R, base, R, R, base * (1.35 + V.level * .5));
  glow.addColorStop(0, `rgba(230,162,60,${.18 + V.level * .3})`); glow.addColorStop(1, 'rgba(230,162,60,0)');
  c.fillStyle = glow; c.beginPath(); c.arc(R, R, base * (1.35 + V.level * .5), 0, 7); c.arc(R, R, base, 0, 7, true); c.fill();
  // glassy core and rim
  c.globalCompositeOperation = 'source-over';
  const core = c.createRadialGradient(R - base * .3, R - base * .35, 0, R, R, base);
  core.addColorStop(0, 'rgba(255,255,255,.16)'); core.addColorStop(.4, 'rgba(255,255,255,.03)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = core; c.beginPath(); c.arc(R, R, base, 0, 7); c.fill();
  c.strokeStyle = `rgba(230,236,240,${.15 + V.level * .4})`; c.lineWidth = 1.2; c.beginPath(); c.arc(R, R, base * 1.02, 0, 7); c.stroke();
  // ripples while listening
  if (V.state === 'listening') for (let k = 0; k < 3; k++) { const p = ((t * .7 + k / 3) % 1); c.strokeStyle = `rgba(230,162,60,${(1 - p) * .35 * (.4 + V.level)})`; c.beginPath(); c.arc(R, R, base * (1.05 + p * .9), 0, 7); c.stroke(); }
}

// ---- controls
const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
document.addEventListener('keydown', e => {
  if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e)) {
    e.preventDefault(); if (e.repeat) return;
    if (V.state === 'listening') { sendSpoken(); return; }
    startListening(); V.held = false; clearTimeout(V.holdT); V.holdT = setTimeout(() => { V.held = true; }, 450);
  }
  if (e.key === 'Escape' && !$('#voice').hidden) { e.stopPropagation(); closeVoice(); }
}, true);
document.addEventListener('keyup', e => { if ((e.key === 'p' || e.key === 'P') && V.held && V.state === 'listening') { V.held = false; sendSpoken(); } clearTimeout(V.holdT); });
$('#micBtn').onclick = () => V.state === 'listening' ? sendSpoken() : startListening();
$('#vClose').onclick = closeVoice;
$('#vStop').onclick = () => { if (V.state === 'listening') { sendSpoken(); return; } speechSynthesis.cancel(); setVState('idle', 'Stopped. Press P to ask again'); };
$('#vForm').onsubmit = e => { e.preventDefault(); const q = $('#vInput').value.trim(); if (!q) return; stopListening(true); $('#vInput').value = ''; askQuestion(q); };
$('#voice').addEventListener('click', e => { if (e.target.id === 'voice') closeVoice(); });
