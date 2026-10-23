'use strict';
// AI: OpenAI-compatible chat. Priority: AI_BASE_URL (e.g. DeepSeek) → Luminal Text API → biggest suitable local Ollama model.
const { log, MOCK, xfetch } = require('./util');
const mx = MOCK ? require('./mockx') : null;
const LUM_KEY = process.env.LUMINAL_API_KEY || '';
const ai = { base: null, model: null, provider: null, key: '', checkedAt: 0, error: 'Not checked yet', models: [] };

// rank local models: prefer instruction-tuned general models around 7–14B (fast enough, much better than 1–3B)
function sizeOf(id) { const m = String(id).match(/(\d+(?:\.\d+)?)b\b/i); return m ? +m[1] : null; }
function pickLocal(ids) {
  const want = process.env.OLLAMA_MODEL; if (want) return ids.find(i => i === want || i.startsWith(want)) || want;
  const chat = ids.filter(i => !/embed|whisper|vision|llava|clip|bge|nomic|minilm/i.test(i));
  const scored = chat.map(id => { const s = sizeOf(id) ?? 7; let score = s <= 14 ? s : 14 - (s - 14) / 4; if (/qwen|llama3|mistral|gemma|phi4|deepseek/i.test(id)) score += 2; if (/coder/i.test(id)) score -= 3; return { id, score }; });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id || ids[0];
}
async function probe(force) {
  if (MOCK && !LUM_KEY && !process.env.AI_BASE_URL) { Object.assign(ai, { base: 'mock', model: 'mock', provider: 'Mock AI', error: null }); return ai; }
  if (!force && ai.base) return ai;
  if (!force && Date.now() - ai.checkedAt < 5 * 60e3) return ai;
  ai.checkedAt = Date.now();
  const cands = [];
  if (process.env.AI_BASE_URL) cands.push([process.env.AI_PROVIDER || 'Custom AI', process.env.AI_BASE_URL.replace(/\/$/, ''), process.env.AI_API_KEY || '', process.env.AI_MODEL]);
  if (process.env.LUMINAL_TEXT_BASE_URL) cands.push(['Luminal', process.env.LUMINAL_TEXT_BASE_URL.replace(/\/$/, ''), LUM_KEY, process.env.LUMINAL_TEXT_MODEL]);
  if (LUM_KEY) for (const b of ['https://text.luminal.cloud/v1', 'https://api.luminal.cloud/v1', 'https://inference.luminal.cloud/v1']) cands.push(['Luminal', b, LUM_KEY, process.env.LUMINAL_TEXT_MODEL]);
  if (process.env.OLLAMA_FALLBACK !== '0') cands.push(['Ollama (local)', (process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/v1', '', null]);
  const tried = [];
  for (const [provider, base, key, wantModel] of cands) {
    try {
      const r = await fetch(base + '/models', { headers: key ? { Authorization: 'Bearer ' + key } : {}, signal: AbortSignal.timeout(6000) });
      tried.push(base + ' → ' + r.status);
      if (!r.ok) continue;
      const j = await r.json();
      const ids = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
      const model = wantModel || (provider.startsWith('Ollama') ? pickLocal(ids) : ids[0]);
      if (!model) { tried.push(base + ' → no models'); continue; }
      Object.assign(ai, { base, model, provider, key, error: null, models: ids });
      log('AI connected:', provider, model, ids.length > 1 ? `(available: ${ids.join(', ')})` : '');
      return ai;
    } catch (e) { tried.push(base + ' → ' + (e.cause?.code || e.name)); }
  }
  Object.assign(ai, { base: null, model: null, provider: null, error: 'No AI endpoint answered. Tried: ' + tried.join('; ') });
  log('AI not connected.', ai.error);
  return ai;
}
async function chat(system, user, { max = 700, temp = 0.3, json = false } = {}) {
  await probe();
  if (!ai.base) throw Object.assign(new Error(ai.error), { code: 'no_ai' });
  if (ai.base === 'mock') return mx.ai(system, user);
  const r = await xfetch(ai.provider, ai.base + '/chat/completions', {
    method: 'POST', timeout: 120000,
    headers: { 'Content-Type': 'application/json', ...(ai.key ? { Authorization: 'Bearer ' + ai.key } : {}) },
    body: JSON.stringify({ model: ai.model, max_tokens: max, temperature: temp, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'AI request failed (' + r.status + ')');
  return (j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
const PLAIN = 'Write plain text only: no markdown symbols such as #, * or **. Use short labelled lines in CAPS where sections are asked for.';
const PROMPTS = {
  digest: p => [`You are a news desk editor writing a briefing on ${p.country}. ${PLAIN}`,
    `Below are NEW headlines the reader has not seen yet, grouped into stories (each line: [outlets] title — outlet, age).\n${p.stories.map((s, i) => `${i + 1}. [${s.n}] ${s.title} — ${s.source}, ${s.age}`).join('\n')}\n\n` +
    (p.previous ? `The reader's previous briefing was:\n"""${p.previous.slice(0, 1500)}"""\n\n` : '') +
    `Write: TOP LINE (one sentence on the single most important development). Then KEY STORIES: up to 5 lines, each one sentence explaining a story and why it matters. ` +
    (p.previous ? `Then WHAT CHANGED: 1-3 lines on what is new or different versus the previous briefing. ` : '') +
    `Then WATCH: one line on what to watch next. Only use facts present in the headlines; say "reportedly" when a headline is a claim. Under 230 words.`],
  market: p => [`You explain markets clearly for a curious investor. ${PLAIN}`,
    `Instrument: ${p.name} (${p.symbol}). Price ${p.price} ${p.currency || ''}, change ${p.change}. Range shown: ${p.window}, from ${p.first} to ${p.last}.\nKey stats: ${(p.stats || []).map(s => s.label + ' ' + s.value).join('; ')}\nRecent headlines:\n${(p.news || []).map(n => '- ' + n).join('\n')}\n\nWrite: WHAT IT IS (1 sentence). WHAT MOVED IT (2-3 sentences tying the price action to the headlines, hedged where unclear). RISKS (2 short lines). Under 170 words. Do not give investment advice.`],
  plan: p => [`You are a sharp local travel planner. ${PLAIN}`,
    `Plan one day in ${p.city}, ${p.country} for ${p.guests} traveller(s), focus: ${p.focus}. Use ONLY these real places (name · rating · type · address):\n${p.places.map(x => `- ${x.title} · ${x.rating || '?'} · ${x.type || ''} · ${x.address || ''}`).join('\n')}\n\nWrite MORNING, AFTERNOON, EVENING, each with 1-2 of the places above and a one-line tip, ordered so travel between them is sensible. End with GETTING AROUND: one line. Under 200 words.`],
  posture: p => [`You are an open-source defence analyst. Use only widely published facts and the live counts given. ${PLAIN}`,
    `Country: ${p.country}. Live ADS-B snapshot right now: ${p.total} aircraft with ${p.country}-registered transponders airborne, ${p.mil} flagged military, ${p.abroad} currently outside ${p.country}'s borders. Military types visible: ${p.types || 'none visible'}.${p.spend ? ` World Bank: military spending ${p.spend}.` : ''}\n\nWrite: SNAPSHOT (2 sentences interpreting the live numbers, noting that many military aircraft fly with transponders off). FORCE STRUCTURE (2-3 sentences on the publicly reported size of its air force and navy, main bases and home ports). ALLIANCES AND FOREIGN BASING (1-2 sentences). Under 200 words. Say figures are approximate and may be out of date.`],
  translate: p => [`You translate news headlines into natural English. Reply with exactly one line per input line, same order, numbered like the input. No commentary.`, p.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')],
  brief: p => [`You are the morning-brief writer for an intelligence dashboard. ${PLAIN}`, `Write a morning brief covering these countries. For each, 2-3 sentences: what matters today and why. Start with an OVERNIGHT line naming the single biggest development. Use only the material below and keep under 320 words.\n\n${p.material}`]
};
module.exports = { ai, probe, chat, PROMPTS, PLAIN };
