'use strict';
// Economy: World Bank indicators (incl. military spending), IMF forecasts, UN Comtrade trade, exchange rates.
const { MOCK, getJSON, cached, country, REF } = require('../util');
const mx = MOCK ? require('../mockx') : null;

const WB = {
  'NY.GDP.MKTP.KD.ZG': 'GDP growth %', 'FP.CPI.TOTL.ZG': 'Inflation %', 'SL.UEM.TOTL.ZS': 'Unemployment %', 'GC.DOD.TOTL.GD.ZS': 'Govt debt % GDP',
  'BN.CAB.XOKA.GD.ZS': 'Current account % GDP', 'BX.KLT.DINV.WD.GD.ZS': 'FDI inflow % GDP', 'NE.EXP.GNFS.ZS': 'Exports % GDP', 'NY.GDP.PCAP.CD': 'GDP per person $',
  'MS.MIL.XPND.GD.ZS': 'Military spending % GDP', 'MS.MIL.XPND.CD': 'Military spending $', 'MS.MIL.TOTL.P1': 'Armed forces personnel', 'SP.POP.TOTL': 'Population'
};
async function worldBank(iso) {
  return cached('wb:' + iso, 24 * 3600e3, async () => {
    if (MOCK) return mx.worldBank(iso, WB);
    const j = await getJSON('World Bank', `https://api.worldbank.org/v2/country/${iso}/indicator/${Object.keys(WB).join(';')}?source=2&format=json&per_page=2000&date=2005:2025`, { sample: 'worldbank', timeout: 60000 });
    const rows = Array.isArray(j) ? j[1] || [] : [];
    const out = {};
    for (const r of rows) { const id = r.indicator?.id; if (!id || r.value == null) continue; (out[id] ||= []).push([+r.date, +r.value]); }
    for (const k in out) out[k].sort((a, b) => a[0] - b[0]);
    return { series: out, labels: WB };
  });
}
const IMF = { NGDP_RPCH: 'Real GDP growth %', PCPIPCH: 'Inflation %', LUR: 'Unemployment %', GGXWDG_NGDP: 'Govt debt % GDP' };
// The IMF DataMapper answers with every country whatever the path says, so fetch each indicator once for
// the whole world (cached a day) and slice. This also lets the globe colour countries by IMF data.
async function imfWorld(ind) {
  return cached('imfw:' + ind, 24 * 3600e3, async () => {
    const j = await getJSON('IMF', `https://www.imf.org/external/datamapper/api/v1/${ind}`, { sample: 'imf', timeout: 45000 });
    const all = j.values?.[ind] || {}; const out = {};
    for (const [iso, v] of Object.entries(all)) { if (!/^[A-Z]{3}$/.test(iso)) continue; const arr = Object.entries(v || {}).map(([y, x]) => [+y, +x]).filter(([y, x]) => y >= 2015 && isFinite(x)).sort((a, b) => a[0] - b[0]); if (arr.length) out[iso] = arr; }
    if (!Object.keys(out).length) throw new Error('IMF returned no data for ' + ind);
    return out;
  });
}
async function imf(iso) {
  if (MOCK) return cached('imf:' + iso, 24 * 3600e3, async () => mx.imf(iso, IMF));
  const out = {}; const errs = [];
  for (const ind of Object.keys(IMF)) { try { out[ind] = (await imfWorld(ind))[iso] || []; } catch (e) { errs.push(e.message); out[ind] = []; } }
  const any = Object.values(out).some(a => a.length);
  return { series: out, labels: IMF, thisYear: new Date().getFullYear(), ...(any ? {} : { error: errs[0] || 'The IMF has no forecasts for this country.' }) };
}
// Comtrade uses a few non-ISO numeric codes
const M49_FIX = { 840: 842, 250: 251, 356: 699, 756: 757, 578: 579 };
const FIX_BACK = Object.fromEntries(Object.entries(M49_FIX).map(([a, b]) => [b, +a]));
const m49ToIso = {}; for (const [a3, r] of Object.entries(REF)) if (r.m49) m49ToIso[r.m49] = a3;
const HS2 = { '27': 'Mineral fuels & oil', '84': 'Machinery', '85': 'Electrical equipment', '87': 'Vehicles', '30': 'Pharmaceuticals', '71': 'Precious stones & metals', '90': 'Optical & medical instruments', '39': 'Plastics', '29': 'Organic chemicals', '72': 'Iron & steel', '26': 'Ores', '10': 'Cereals', '12': 'Oil seeds', '15': 'Fats & oils', '02': 'Meat', '03': 'Fish', '08': 'Fruit & nuts', '09': 'Coffee & tea', '18': 'Cocoa', '22': 'Beverages', '24': 'Tobacco', '28': 'Inorganic chemicals', '38': 'Chemical products', '40': 'Rubber', '44': 'Wood', '47': 'Pulp', '48': 'Paper', '52': 'Cotton', '61': 'Knitted apparel', '62': 'Apparel', '64': 'Footwear', '73': 'Iron & steel articles', '74': 'Copper', '76': 'Aluminium', '88': 'Aircraft & spacecraft', '89': 'Ships', '93': 'Arms & ammunition', '94': 'Furniture', '95': 'Toys & sports', '99': 'Other' };
async function trade(iso) {
  let r = await tradeRaw(iso);
  // a half-finished result (imports rate-limited) is retried after 10 minutes instead of being kept a week
  if (r.imports?.error && Date.now() - (r._cache?.at || 0) > 10 * 60e3) r = await tradeRaw(iso, true);
  return r;
}
async function tradeRaw(iso, force) {
  const c = country(iso); if (!c || !c.m49) throw new Error('No trade code for this country.');
  const rc = M49_FIX[c.m49] || c.m49;
  return cached('trade:' + iso, 7 * 864e5, async () => {
    if (MOCK) return mx.trade(c);
    const yr = new Date().getFullYear();
    const get = (flow, cmd, partner, period) => getJSON('UN Comtrade', `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${rc}&period=${period}&flowCode=${flow}&cmdCode=${cmd}${partner != null ? '&partnerCode=' + partner : ''}&includeDesc=true`, { sample: 'comtrade-' + flow + cmd });
    let period = null, ex = null;
    for (const p of [yr - 1, yr - 2, yr - 3]) { const j = await get('X', 'TOTAL', null, p).catch(() => null); if (j?.data?.length) { period = p; ex = j; break; } }
    if (!period) throw new Error('UN Comtrade has no recent annual data for ' + c.name + '.');
    const im = await get('M', 'TOTAL', null, period).catch(e => ({ data: [], error: e.message }));
    const prodX = await get('X', 'AG2', 0, period).catch(e => ({ data: [], error: e.message }));
    if (im.error && prodX.error) throw new Error('UN Comtrade is rate-limiting; try again in a minute.');
    const partners = j => (j.data || []).filter(r => r.partnerCode && r.partnerCode !== 0 && (r.partner2Code == null || r.partner2Code === 0) && (r.motCode == null || r.motCode === 0) && (r.customsCode == null || r.customsCode === 'C00'))
      .map(r => { const m = FIX_BACK[r.partnerCode] || r.partnerCode; return { iso: m49ToIso[m] || null, name: r.partnerDesc || m49ToIso[m] || String(r.partnerCode), value: r.primaryValue ?? r.fobvalue ?? r.cifvalue ?? 0 }; })
      .filter(p => p.value > 0).sort((a, b) => b.value - a.value);
    const total = j => (j.data || []).find(r => r.partnerCode === 0)?.primaryValue ?? null;
    const exP = partners(ex), imP = partners(im);
    const products = (prodX.data || []).filter(r => r.cmdCode && r.cmdCode !== 'TOTAL' && (r.partner2Code == null || r.partner2Code === 0) && (r.motCode == null || r.motCode === 0)).map(r => ({ code: r.cmdCode, name: HS2[r.cmdCode] || (r.cmdDesc || '').split(';')[0].slice(0, 40) || 'HS ' + r.cmdCode, value: r.primaryValue })).sort((a, b) => b.value - a.value).slice(0, 10);
    return { year: period, exports: { total: total(ex) ?? exP.reduce((a, b) => a + b.value, 0), partners: exP.slice(0, 12) }, imports: im.error ? { total: null, partners: [], error: im.error } : { total: total(im) ?? imP.reduce((a, b) => a + b.value, 0), partners: imP.slice(0, 12) }, products };
  }, { force });
}
async function fx(code) {
  if (!/^[A-Z]{3}$/.test(code || '')) throw new Error('No currency for this country.');
  const spot = await cached('fx:spot', 6 * 3600e3, async () => {
    if (MOCK) return mx.fxSpot();
    const j = await getJSON('ExchangeRate-API', 'https://open.er-api.com/v6/latest/USD', { sample: 'fx-spot' });
    if (j.result && j.result !== 'success') throw new Error('Exchange rates unavailable.');
    return { rates: j.rates, updated: j.time_last_update_utc };
  });
  const perUSD = spot.rates?.[code];
  let history = [];
  if (code !== 'USD') {
    const h = await cached('fx:hist:' + code, 12 * 3600e3, async () => {
      if (MOCK) return mx.fxHistory(code, perUSD);
      const start = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      const j = await getJSON('Frankfurter', `https://api.frankfurter.app/${start}..?from=USD&to=${code}`, { sample: 'fx-hist' });
      return { points: Object.entries(j.rates || {}).map(([d, r]) => [d, r[code]]).filter(p => p[1] != null) };
    }).catch(() => ({ points: [] }));
    history = h.points || [];
  }
  const ch = days => { if (history.length < 2) return null; const last = history.at(-1)[1]; const ref = history.find(p => Date.parse(p[0]) >= Date.now() - days * 864e5)?.[1]; return ref ? (last / ref - 1) * 100 : null; };
  let vol = null;
  if (history.length > 30) { const r = []; for (let i = 1; i < history.length; i++) r.push(Math.log(history[i][1] / history[i - 1][1])); const m = r.reduce((a, b) => a + b, 0) / r.length; vol = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length) * Math.sqrt(252) * 100; }
  return { code, perUSD, perEUR: spot.rates?.EUR && perUSD ? perUSD / spot.rates.EUR : null, perGBP: spot.rates?.GBP && perUSD ? perUSD / spot.rates.GBP : null, updated: spot.updated, history, change30: ch(30), change365: ch(365), volatility: vol };
}
module.exports = { worldBank, imf, imfWorld, trade, fx, WB, IMF };
