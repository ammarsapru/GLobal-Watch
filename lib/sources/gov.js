'use strict';
// Government & politics from Wikidata (leaders, system, legislature, memberships, recent/upcoming elections).
const { MOCK, getJSON, cached, country } = require('../util');
const mx = MOCK ? require('../mockx') : null;

async function sparql(q, sample) {
  const u = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
  const j = await getJSON('Wikidata', u, { headers: { Accept: 'application/sparql-results+json' }, sample, timeout: 40000 });
  return (j.results?.bindings || []).map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}
const img = f => f ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(decodeURIComponent(f.split('/').pop())) + '?width=120' : null;
const qid = u => u ? u.split('/').pop() : null;

async function government(iso) {
  const c = country(iso); if (!c) throw new Error('Unknown country');
  return cached('gov2:' + iso, 24 * 3600e3, async () => {
    if (MOCK) return mx.government(c);
    const base = await sparql(`SELECT ?c ?hos ?hosLabel ?hosStart ?hosImg ?hosRoleLabel ?hog ?hogLabel ?hogStart ?hogImg ?partyLabel ?govLabel ?legLabel WHERE {
      ?c wdt:P297 "${c.a2}".
      OPTIONAL { ?c p:P35 ?hs. ?hs ps:P35 ?hos. FILTER NOT EXISTS { ?hs pq:P582 ?e1 } OPTIONAL { ?hs pq:P580 ?hosStart } OPTIONAL { ?hos wdt:P18 ?hosImg } }
      OPTIONAL { ?c wdt:P1906 ?hosRole }
      OPTIONAL { ?c p:P6 ?hg. ?hg ps:P6 ?hog. FILTER NOT EXISTS { ?hg pq:P582 ?e2 } OPTIONAL { ?hg pq:P580 ?hogStart } OPTIONAL { ?hog wdt:P18 ?hogImg } OPTIONAL { ?hog wdt:P102 ?party } }
      OPTIONAL { ?c wdt:P122 ?gov } OPTIONAL { ?c wdt:P194 ?leg }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } LIMIT 40`, 'wikidata-gov');
    const pick = k => [...new Set(base.map(r => r[k]).filter(Boolean))];
    const first = base[0] || {};
    const people = [];
    const add = (role, idKey) => { const seen = new Set(); for (const r of base) { const id = r[idKey]; if (!id || seen.has(id)) continue; seen.add(id); people.push({ role, name: r[idKey + 'Label'], since: r[idKey + 'Start'] ? r[idKey + 'Start'].slice(0, 10) : null, img: img(r[idKey + 'Img']), party: idKey === 'hog' ? (r.partyLabel || null) : null, wiki: 'https://www.wikidata.org/wiki/' + qid(id) }); } };
    add(first.hosRoleLabel ? 'Head of state' : 'Head of state', 'hos'); add('Head of government', 'hog');
    let members = [], elections = [];
    try { members = (await sparql(`SELECT DISTINCT ?oLabel WHERE { ?c wdt:P297 "${c.a2}"; wdt:P463 ?o. SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } LIMIT 80`, 'wikidata-members')).map(r => r.oLabel).filter(x => x && !/^Q\d+$/.test(x)); } catch (e) {}
    try {
      elections = (await sparql(`SELECT DISTINCT ?e ?eLabel ?date WHERE { ?c wdt:P297 "${c.a2}". ?e wdt:P17 ?c; wdt:P31 ?t; wdt:P585 ?date. ?t wdt:P279* wd:Q40231. FILTER(?date > "${new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10)}T00:00:00Z"^^xsd:dateTime) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } ORDER BY ?date LIMIT 15`, 'wikidata-elections'))
        .map(r => ({ name: r.eLabel, date: r.date?.slice(0, 10), upcoming: r.date > new Date().toISOString() }));
    } catch (e) {}
    const KEY = /^(United Nations|European Union|NATO|G7|Group of Seven|G20|Group of Twenty|BRICS|OPEC|Organization of the Petroleum|ASEAN|Association of Southeast Asian|African Union|Commonwealth of Nations|Organisation for Economic|Organization for Economic|World Trade Organization|Shanghai Cooperation|Arab League|Gulf Cooperation|Mercosur|Schengen|Eurozone|Collective Security Treaty|Quad|AUKUS|Five Eyes|Council of Europe|Nordic Council|Arctic Council|Commonwealth of Independent States|Organization of American States|International Monetary Fund|World Bank)/i;
    members.sort((a, b) => (KEY.test(b) - KEY.test(a)));
    return { system: pick('govLabel'), legislature: pick('legLabel'), people, members: members.slice(0, 40), elections, wikidata: first.c ? 'https://www.wikidata.org/wiki/' + qid(first.c) : null };
  });
}
module.exports = { government };
