'use strict';
/* News panel: GDELT (free) or Google News. Unseen-first ranking, story clustering, threads over days, domestic/foreign,
   state-media flags, tone & volume trend, entity chips, translation, AI digest, places-in-the-news layer. */
const news = makePanel('news', 'Local News', null, { short: 'News' });
const N = { topic: 'top', lang: store.get('nlang', 'en'), src: store.get('nsrc', 'gdelt'), clusters: [], data: null, auto: store.get('nauto', 0), timer: null, who: 'all', hideState: store.get('nhidestate', false), entity: null, translated: {} };
let seen = store.get('seen', {});
(function prune() { const cut = Date.now() - 21 * 864e5; for (const k in seen) if (seen[k] < cut) delete seen[k]; store.set('seen', seen); })();
const STOP = new Set('a an the of to in on for and or but with at by from as is are was were be been it its this that after over into new says say said amid about than more up out vs not will can has have had his her their our your who what when how why after before could would should may might just also than then there here first last week year years day days'.split(' '));
const normTitle = t => String(t).toLowerCase().replace(/\s[-–—|]\s[^-–—|]{2,40}$/, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const fp = t => { const s = normTitle(t).slice(0, 90); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const toks = t => new Set(normTitle(t).split(' ').filter(w => w.length > 2 && !STOP.has(w)));
const jacc = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
const ageH = d => { const t = Date.parse(d); return isNaN(t) ? 24 : Math.max(0, (Date.now() - t) / 36e5); };
function cluster(items, history) {
  const groups = []; const byG = new Map();
  for (const it of items) {
    it.fp = fp(it.title); it.tk = toks(it.title);
    let g = it.cluster && byG.get(it.cluster);
    if (!g) g = groups.find(G => G.items.some(o => jacc(o.tk, it.tk) >= 0.42));
    if (!g) { g = { items: [] }; groups.push(g); }
    if (it.cluster) byG.set(it.cluster, g);
    if (!g.items.some(o => o.fp === it.fp && o.source === it.source)) g.items.push(it);
  }
  const hist = (history || []).map(([t, at]) => ({ tk: toks(t), at }));
  for (const g of groups) {
    g.items.sort((a, b) => ageH(a.date) - ageH(b.date));
    g.lead = g.items[0]; g.sources = new Set(g.items.map(i => i.source)).size;
    g.age = Math.min(...g.items.map(i => ageH(i.date)));
    g.isNew = g.items.some(i => !seen[i.fp]);
    g.score = (1 + Math.log(g.sources)) * Math.exp(-g.age / 8) * (g.isNew ? 1.6 : 1);
    g.domestic = g.items.some(i => i.domestic); g.foreign = g.items.some(i => i.domestic === false); g.state = g.items.every(i => i.state);
    // thread: earliest similar headline we've stored over the past 10 days
    let first = Math.min(...g.items.map(i => Date.parse(i.date) || Date.now()));
    for (const h of hist) if (h.at < first && jacc(h.tk, g.lead.tk) >= 0.42) first = h.at;
    g.days = Math.floor((Date.now() - first) / 864e5) + 1;
  }
  return groups.sort((a, b) => b.score - a.score);
}
// people/organisations/places: capitalised phrases recurring across headlines
function entities(clusters, exclude) {
  const counts = new Map(); const ex = new Set(exclude.map(x => x.toLowerCase()));
  for (const g of clusters) for (const it of g.items.slice(0, 3)) {
    const m = it.title.match(/\b([A-Z][\p{L}'’.-]+(?:\s+(?:[A-Z][\p{L}'’.-]+|of|de|al|bin|van|von)){0,3})/gu) || [];
    for (let e of m) { e = e.replace(/['’]s$/, '').trim(); const low = e.toLowerCase(); if (e.length < 3 || ex.has(low) || STOP.has(low) || /^(The|A|An|In|On|At|How|Why|What|Who|When|Breaking|Live|Watch|Opinion|Analysis|Update|Exclusive|Video|Photos?|News|Report|Says)$/.test(e)) continue; counts.set(e, (counts.get(e) || 0) + 1); }
  }
  return [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 14);
}
const FORMULA = `RANK   = (1 + ln(outlets)) × e^(−age_h / 8) × (unseen ? 1.6 : 1)
STORY  = headlines grouped by title overlap (Jaccard ≥ 0.42 on key words), plus Google's own clusters
THREAD = the first time a similar headline was stored by the collector (up to 10 days back) → "Day N"
SEEN   = a fingerprint of each normalised title, stored in this browser when you open a story,
         press "Mark all seen", or include it in an AI digest. Forgotten after 21 days.
DIGEST = only stories with an unseen headline go to the AI, with your previous digest so it can say what changed.`;
function newsSkeleton() {
  news.body.innerHTML = `
    <div class="bar">${seg('ntopic', [['top', 'Top'], ['politics', 'Politics'], ['economy', 'Economy'], ['security', 'Security'], ['business', 'Business'], ['tech', 'Tech'], ['culture', 'Culture']], N.topic, 'chips')}</div>
    <div class="bar">${seg('nlang', [['en', 'ENGLISH'], ['local', 'LOCAL MEDIA']], N.lang)}${seg('nwho', [['all', 'ALL'], ['dom', 'DOMESTIC'], ['for', 'FOREIGN']], N.who)}
      <label class="check"><input type="checkbox" id="nHideState" ${N.hideState ? 'checked' : ''}>Hide state media</label></div>
    <div class="bar"><label class="check" title="Google News uses SerpAPI searches">Source<select id="nSrc" class="inp" style="width:auto;padding:2px 4px"><option value="gdelt">GDELT (free)</option><option value="google">Google News</option></select></label>
      <label class="check" title="GDELT is free; Google News uses one SerpAPI search per refresh">Auto<select id="nAuto" class="inp" style="width:auto;padding:2px 4px">${[[0, 'off'], [15, '15 min'], [30, '30 min'], [60, '1 h']].map(([v, l]) => `<option value="${v}" ${v == N.auto ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="grow"></span><button class="linkbtn" id="nFormulaBtn" type="button">How ranking works</button></div>
    <pre class="formula" id="nFormula" hidden>${esc(FORMULA)}</pre>
    <div class="minis" id="nTone"></div>
    <div class="entities" id="nEnt"></div>
    <div class="bar"><span class="note grow" id="nStat"></span><button class="btn ghost" id="nTr" type="button" hidden>Translate</button><button class="btn ghost" id="nSeen" type="button">Mark all seen</button><button class="btn" id="nDigest" type="button">AI digest</button></div>
    <div class="brief" id="nDigestBox" hidden></div>
    <div class="list" id="nList"></div>`;
  $('#nSrc').value = N.src;
  onSeg(news.body, 'ntopic', v => { N.topic = v; loadNews(); });
  onSeg(news.body, 'nlang', v => { N.lang = v; store.set('nlang', v); loadNews(); });
  onSeg(news.body, 'nwho', v => { N.who = v; renderNews(); });
  $('#nHideState').onchange = e => { N.hideState = e.target.checked; store.set('nhidestate', N.hideState); renderNews(); };
  $('#nSrc').onchange = e => { N.src = e.target.value; store.set('nsrc', N.src); loadNews(); };
  $('#nAuto').onchange = e => { N.auto = +e.target.value; store.set('nauto', N.auto); armNewsTimer(); };
  $('#nFormulaBtn').onclick = () => { $('#nFormula').hidden = !$('#nFormula').hidden; };
  $('#nSeen').onclick = () => { markSeen(N.clusters.flatMap(g => g.items)); renderNews(); toast('All headlines marked as seen.'); };
  $('#nDigest').onclick = digest; $('#nTr').onclick = translate;
  $('#nEnt').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; N.entity = N.entity === b.dataset.e ? null : b.dataset.e; renderNews(); });
}
function armNewsTimer() { clearInterval(N.timer); if (N.auto) N.timer = setInterval(() => loadNews(true, true), N.auto * 60e3); }
news.onRefresh = () => loadNews(true);
news.onCountry = () => { if (!$('#nList')) newsSkeleton(); $('#nDigestBox').hidden = true; N.entity = null; N.translated = {}; loadNews(); };
news.onShow = () => { if (!$('#nList')) newsSkeleton(); if (N.loadedFor !== (S.iso || 'WLD')) loadNews(); };
function markSeen(items) { const t = Date.now(); for (const i of items) if (!seen[i.fp]) seen[i.fp] = t; store.set('seen', seen); }
async function loadNews(force, quiet) {
  if (!$('#nList')) newsSkeleton();
  const box = $('#nList'); const iso = S.iso;
  const label = iso ? (S.d.n + (N.topic !== 'top' ? ' · ' + N.topic : '')) : 'world headlines';
  if (box.querySelector('.story')) { box.classList.add('busy'); if (!quiet) $('#nStat').textContent = 'Loading ' + label + '…'; } else box.innerHTML = skeleton(6);
  const qs = new URLSearchParams({ topic: N.topic, lang: N.lang, ...(iso ? { iso } : {}), ...(force ? { force: 1 } : {}) });
  if (N.src === 'google' && iso) { qs.set('src', 'google'); qs.set('gl', S.d.a2); qs.set('hl', N.lang === 'local' ? (S.d.lang || 'EN').split(',')[0].trim().toLowerCase() : 'en'); if (!(N.lang === 'local' && N.topic === 'top')) qs.set('q', S.d.n + (N.topic === 'top' ? '' : ' ' + N.topic)); }
  try {
    const r = await api('/api/news?' + qs); if (iso !== S.iso) return;
    const before = new Set(N.clusters.map(g => g.lead.fp));
    N.data = r; N.loadedFor = iso || 'WLD'; N.clusters = cluster(r.items, r.history); renderNews(); news.meta((r.provider || '') + ' · ' + cacheNote(r._cache)); news.body.scrollTop = quiet ? news.body.scrollTop : 0;
    if (quiet) for (const g of N.clusters) if (!before.has(g.lead.fp)) flash($(`#nList [data-fp="${g.lead.fp}"]`));
    if (iso) loadTone(iso);
    if (iso && GL.layers.places) loadPlaces(iso);
    emit('news', N.clusters);
  } catch (e) { box.innerHTML = errBox(e); $('#nStat').textContent = ''; } finally { box.classList.remove('busy'); }
}
async function loadTone(iso) {
  const box = $('#nTone'); if (!box) return; box.innerHTML = '';
  try {
    const r = await api(`/api/news/tone?iso=${iso}&topic=${N.topic}`); if (iso !== S.iso) return;
    const tone = r.tone.map(x => x.v), vol = r.volume.map(x => x.v); const lt = tone.at(-1), avg = tone.reduce((a, b) => a + b, 0) / (tone.length || 1);
    const vNow = vol.slice(-8).reduce((a, b) => a + b, 0), vPrev = vol.slice(-16, -8).reduce((a, b) => a + b, 0);
    box.innerHTML = `<div class="mini" title="Average tone of coverage (GDELT, −10 very negative … +10 very positive)"><small>Tone · 7 days</small><strong class="${lt < avg - .5 ? 'down' : lt > avg + .5 ? 'up' : ''}">${lt != null ? lt.toFixed(1) : '—'}</strong>${spark(tone, 'var(--violet)')}</div>
      <div class="mini" title="Number of articles per 15-minute interval"><small>Coverage volume</small><strong class="${vNow > vPrev * 1.5 ? 'down' : ''}">${vPrev ? ((vNow / vPrev - 1) * 100 > 0 ? '+' : '') + Math.round((vNow / vPrev - 1) * 100) + '%' : '—'}</strong>${spark(vol, 'var(--info)')}</div>`;
  } catch (e) { box.innerHTML = ''; }
}
async function loadPlaces(iso) { try { const r = await api('/api/news/places?iso=' + iso); if (iso === S.iso) GL.data.places = r.points; } catch (e) { GL.data.places = []; } }
on('layers', L => { if (L.places && S.iso) loadPlaces(S.iso); if (!L.places) GL.data.places = []; });
function visibleClusters() {
  return N.clusters.filter(g => (N.who === 'all' || (N.who === 'dom' ? g.domestic : g.foreign)) && (!N.hideState || !g.state) && (!N.entity || g.items.some(i => i.title.includes(N.entity))));
}
function renderNews() {
  if (!$('#nList')) return;
  for (const g of N.clusters) g.isNew = g.items.some(i => !seen[i.fp]);
  const list = visibleClusters(); const nNew = list.filter(g => g.isNew).length;
  $('#nStat').innerHTML = N.clusters.length ? `<b style="color:var(--fg)">${list.length}</b> stories · <b style="color:var(--accent)">${nNew}</b> new to you · ${N.data.items.length} headlines` : '';
  $('#nDigest').textContent = nNew ? (nNew > 14 ? 'AI digest of top 14 new' : `AI digest of ${nNew} new`) : 'AI digest'; $('#nDigest').disabled = !nNew;
  $('#nTr').hidden = !N.data?.items?.some(i => i.lang && !/^english$/i.test(i.lang));
  const ents = entities(N.clusters, [S.d?.n || '', S.d?.cap || '']);
  $('#nEnt').innerHTML = ents.length ? `<span class="eyebrow" style="align-self:center">In the headlines</span>` + ents.map(([e, n]) => `<button type="button" data-e="${esc(e)}" aria-pressed="${N.entity === e}">${esc(e)}<b>${n}</b></button>`).join('') : '';
  const T = i => N.translated[i.fp] || i.title;
  $('#nList').innerHTML = list.length ? list.slice(0, 80).map(g => { const gi = N.clusters.indexOf(g); return `<article class="story ${g.isNew ? 'isnew' : ''}" data-g="${gi}" data-fp="${g.lead.fp}">
      <div class="h"><a href="${esc(g.lead.link)}" target="_blank" rel="noopener" data-open="${gi}">${esc(T(g.lead))}</a>${g.isNew ? '<span class="tag new">NEW</span>' : ''}</div>
      <div class="s"><span>${esc(g.lead.source)}</span><span>${esc(ago(g.lead.date) || '')}</span>${g.days > 1 ? `<span class="thread" title="This story has been running for ${g.days} days">DAY ${g.days}</span>` : ''}${g.state ? '<span class="tag warn" title="State-owned or state-directed outlet">STATE MEDIA</span>' : g.items.some(i => i.state) ? '<span class="tag n">incl. state media</span>' : ''}${g.domestic && !g.foreign ? '<span class="tag n">DOMESTIC</span>' : ''}${g.sources > 1 ? `<button class="linkbtn" data-more="${gi}" type="button">${g.sources} outlets ▾</button>` : ''}</div>
      <div class="more" hidden>${g.items.slice(1).map(i => `<a href="${esc(i.link)}" target="_blank" rel="noopener" data-open="${gi}">${esc(i.source)} — ${esc(T(i))} <span class="dim">${esc(ago(i.date))}</span>${i.state ? ' <span class="tag warn">STATE</span>' : ''}</a>`).join('')}</div></article>`; }).join('')
    : `<div class="empty">${N.clusters.length ? 'No stories match these filters.' : 'No headlines returned. Try another topic, or switch between English and local media.'}</div>`;
}
$('#p-news').addEventListener('click', e => {
  const m = e.target.closest('[data-more]'); if (m) { const more = $('.more', m.closest('.story')); more.hidden = !more.hidden; return; }
  const o = e.target.closest('[data-open]'); if (o) { const g = N.clusters[+o.dataset.open]; markSeen(g.items); setTimeout(renderNews, 300); }
});
async function digest() {
  const fresh = visibleClusters().filter(g => g.isNew).slice(0, 14); const key = 'digest-' + (S.iso || 'WLD') + '-' + N.topic; const prev = store.get(key, null);
  const payload = { task: 'digest', country: S.d?.n || 'the world', previous: prev?.text || '', stories: fresh.map(g => ({ n: g.sources, title: N.translated[g.lead.fp] || g.lead.title, source: [...new Set(g.items.map(i => i.source))].slice(0, 3).join(', '), age: ago(g.lead.date) || 'recent' })) };
  await runAI($('#nDigest'), $('#nDigestBox'), payload, (r, err) => {
    if (r) { store.set(key, { text: r.text, t: Date.now() }); markSeen(fresh.flatMap(g => g.items)); renderNews(); $('#nDigestBox').hidden = false; }
    else if (err?.code === 'no_ai') $('#nDigestBox').innerHTML += `\n\nWithout AI, here are the new stories by rank:\n` + fresh.map((g, i) => `${i + 1}. ${esc(g.lead.title)} (${g.sources} outlet${g.sources > 1 ? 's' : ''})`).join('\n');
  });
}
async function translate() {
  const items = visibleClusters().slice(0, 25).flatMap(g => g.items.slice(0, 2)).filter(i => i.lang && !/^english$/i.test(i.lang) && !N.translated[i.fp]).slice(0, 30);
  if (!items.length) { toast('Nothing left to translate.'); return; }
  const btn = $('#nTr'); btn.disabled = true; btn.textContent = 'Translating…';
  try { const r = await post('/api/ai', { task: 'translate', lines: items.map(i => i.title) }); const lines = r.text.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean); items.forEach((it, k) => { if (lines[k]) N.translated[it.fp] = lines[k]; }); renderNews(); }
  catch (e) { toast(e.code === 'no_ai' ? 'Translation needs the AI to be connected.' : e.message, 5000); }
  btn.disabled = false; btn.textContent = 'Translate';
}
