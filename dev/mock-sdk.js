// Local stand-in for Fridge's /api/sdk. Answers the app's Snowflake queries with
// deterministic synthetic data in the same shapes the real warehouse returns,
// and keeps stores/files in memory. Served by dev/server.mjs at /api/sdk.

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const WORDS = ['Northwind', 'Juniper', 'Copper', 'Alder', 'Harbor', 'Sable', 'Meadow', 'Atlas', 'Linen', 'Pine', 'Cobalt', 'Willow', 'Ember', 'Granite', 'Saffron', 'Tidal', 'Birch', 'Orchard', 'Summit', 'Velvet'];
const KINDS = ['Apparel', 'Goods', 'Supply Co', 'Outfitters', 'Studio', 'Home', 'Golf', 'Bags', 'Beauty', 'Cycles'];
const PAS = ['Avery Lin', 'Jordan Park', 'Sam Ortiz', 'Riley Chen', ''];
const SES = ['Casey Moore', 'Drew Patel', 'Morgan Lee', 'Quinn Diaz', 'Self Serve', ''];
const AES = ['Taylor Brooks', 'Jamie Ross', 'Alex Kim'];
const CARRIERS = [['USPS', 0.36], ['DhlEcs', 0.24], ['FirstMile', 0.1], ['UPSSurePost', 0.08], ['UPS', 0.12], ['FedEx', 0.05], ['AmazonShipping', 0.03], ['CanadaPost', 0.01], ['Multiple', 0.01]];
const DESTS = [['US', 0.9], ['CA', 0.04], ['GB', 0.02], ['AU', 0.015], ['DE', 0.01], ['JP', 0.005], ['Multiple', 0.01]];
const wpick = (pairs) => { let x = rnd(); for (const [v, w] of pairs) { if ((x -= w) <= 0) return v; } return pairs[0][0]; };

const merchants = [];
for (let i = 0; i < 140; i++) {
  const id = (0x68a000000000 + i * 7919).toString(16).padStart(12, '0') + (i * 104729).toString(16).padStart(12, '0');
  merchants.push({ id, name: `${pick(WORDS)} ${pick(KINDS)}`, pa: pick(PAS), se: pick(SES), ae: pick(AES), w: Math.pow(rnd(), 3) * 10 + 0.05, origin: rnd() < 0.08 ? 'CA' : 'US', carriers: [wpick(CARRIERS), wpick(CARRIERS)] });
}
// type code -> [sign, typical $ per shipment, relative frequency]
const TYPEMIX = [[2, -1, 3.4, 0.14], [3, -1, 3.9, 0.03], [9, -1, 78, 0.002], [1, -1, 8, 0.004], [4, -1, 0.4, 0.001], [5, 1, 0.95, 0.55], [6, 1, 1.15, 0.27], [8, 1, 0.1, 0.001]];
const FACTS = [];
for (let day = 18; day <= 641; day++) {
  const growth = 0.25 + (day / 641) * 1.2;
  for (const m of merchants) {
    if (rnd() > Math.min(0.95, m.w * 0.12 * growth)) continue;
    for (const [t, sign, avg, freq] of TYPEMIX) {
      if (rnd() > freq * 4) continue;
      const n = 1 + Math.floor(rnd() * 6 * m.w);
      const v = sign * n * avg * (0.4 + rnd() * 1.2);
      FACTS.push({ dd: day, m: m.id, t, car: m.carriers[rnd() < 0.8 ? 0 : 1], org: m.origin, dst: wpick(DESTS), v: Math.round(v * 100), n });
    }
  }
}

function cubeChunk(k) {
  const rows = FACTS.filter((f) => f.dd % 4 === k);
  const uniq = (key) => [...new Set(rows.map((r) => r[key]))].sort();
  const dm = uniq('m'), dc = uniq('car'), dor = uniq('org'), dd = uniq('dst');
  const idx = (arr) => new Map(arr.map((x, i) => [x, i + 1]));
  const im = idx(dm), ic = idx(dc), io = idx(dor), id = idx(dd);
  const packed = rows.map((r) => [r.dd, im.get(r.m), r.t, ic.get(r.car), io.get(r.org), id.get(r.dst), r.v, r.n].join(',')).join('|');
  return [{ DICT_M: JSON.stringify(dm, null, 2), DICT_C: JSON.stringify(dc, null, 2), DICT_O: JSON.stringify(dor, null, 2), DICT_D: JSON.stringify(dd, null, 2), PACKED: packed, NROWS: String(rows.length) }];
}
function owners() {
  const arr = merchants.map((m) => [m.id, m.name, m.pa || null, m.se || null, m.ae, -(rnd() * 400 * m.w).toFixed(2), rnd() < 0.1 ? -(rnd() * 900).toFixed(2) : 0, Math.floor(rnd() * 40 * m.w), rnd() < 0.1 ? 2 : 0]);
  return [{ OWNERS: JSON.stringify(arr), ASOF: '2026-10-05 04:41:55' }];
}
function recDaily() {
  const out = [];
  for (let d = 13; d <= 642; d++) {
    const base = 300 + d * 52 + Math.sin(d / 3) * 400 + (rnd() - 0.5) * 600;
    const mr = Math.max(0, base * (0.93 + rnd() * 0.08));
    const cur = Math.max(0, base * (0.98 + rnd() * 0.1));
    out.push([d, mr.toFixed(2), cur.toFixed(2), (cur * 1.04).toFixed(2), Math.round(base * 6)].join(','));
  }
  return [{ PACKED: out.join('|') }];
}
function recMonthly() {
  const rows = [];
  for (let y = 2025; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 10) break;
    rows.push({ M: `${y}-${String(m).padStart(2, '0')}`, MR: String((20000 + ((y - 2025) * 12 + m) * 42000) * (0.95 + rnd() * 0.06)) });
  }
  return rows;
}
function shipments() {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const neg = rnd() < 0.55, ec = 8 + rnd() * 60, ecc = ec * 0.85;
    const t = neg ? pick(['carrier', 'merchant', 'none']) : pick(['carrier', 'merchant']);
    const gap = (neg ? -1 : 1) * (2 + rnd() * 90);
    const billed = t === 'merchant' ? ec + gap : ec;
    rows.push({ FG: 'fg' + i, ISSUED: '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), V: gap.toFixed(2), LABEL_COUNT: '1', TRK: '1ZK1127K03' + String(22075983 + i * 137), TRKS: String(rnd() < 0.2 ? 3 : 1), CAR: pick(['UPS', 'USPS', 'DhlEcs']), BOUGHT: '2026-08-' + String(1 + (i % 28)).padStart(2, '0'), EC: ec.toFixed(2), BILLED: (t === 'none' ? 0 : billed).toFixed(2), ECC: ecc.toFixed(2), CHG: gap.toFixed(2), CHARGES_N: t === 'none' ? '0' : '1', X_UNQ: '0', JOINED: '1' });
  }
  return rows.sort((a, b) => Math.abs(b.V) - Math.abs(a.V));
}
function reasons() {
  return [['Weight or size correction', -91234, 3120], ['Base rate above quote', -64010, 22011], ['Additional handling', -38110, 1280], ['Remote delivery area', -17420, 5310], ['Address correction', -6120, 410], ['Duties and customs', -4210, 90], ['Returned to sender', -2101, 44]].map(([r, v, n]) => ({ REASON: r, V: String(v), N: String(n) }));
}

// Step 3 line items: carrier rate, surcharges and merchant billing that add up to the selection's net.
function bridge(sql) {
  const under = sql.includes('diagnostic_variance_usd < 0'), k = (sql.length % 7) / 10 + 0.7;
  const comps = under
    ? [['S|Weight or size correction', -91234, 3120], ['C|base_invoice_above_purchase_quote', -64010, 22011], ['M|merchant_surcharge_recovery-', -41870, 9120], ['M|label_void_reversal-', -38412, 5410], ['S|Package type change', -33120, 8120], ['S|Additional handling', -18110, 1280], ['M|merchant_base_charge_adjustment-', -15715, 6883], ['S|Remote delivery area', -7420, 5310], ['C|usps_unused_label_credit', 27195, 3371], ['M|merchant_surcharge_recovery+', 15227, 4321], ['C|prior_invoice_upward_revision', -11311, 3959], ['S|Address correction', -6120, 410], ['C|post_void_carrier_cost', -2341, 300], ['S|Duties and customs', -1210, 90], ['M|merchant_duplicate_charge-', -197, 2], ['X|unexplained', 1994, 812]]
    : [['C|base_invoice_below_purchase_quote', 237351, 382229], ['M|merchant_surcharge_recovery+', 198954, 120874], ['C|carrier_credit_or_refund', 145950, 26477], ['C|usps_favorable_repricing', 71197, 33160], ['M|merchant_duplicate_charge+', 51038, 5671], ['M|merchant_base_charge_adjustment+', 43011, 31467], ['C|usps_unused_label_credit', 29808, 3949], ['M|usps_pc_postage_fee_revenue+', 24453, 132298], ['S|Weight or size correction', -18120, 2311], ['C|currency', 18813, 4980], ['M|label_void_reversal-', -12100, 1210], ['X|unexplained', -1662, 402]];
  const rows = comps.map(([c, v, n]) => ({ COMP: c, N: String(Math.round(n * k)), V: (v * k).toFixed(2) }));
  rows.push({ COMP: 'T|total', N: String(Math.round((under ? 41000 : 190000) * k)), V: rows.reduce((s, r) => s + +r.V, 0).toFixed(2) });
  return rows;
}
// Step 4 concentration: issue dollars and a label sample by bucket, per dimension, plus the grand total.
function where(sql) {
  const sign = sql.includes('diagnostic_variance_usd < 0') ? -1 : 1, IV = sign * (120000 + (sql.length % 13) * 9000), PN = 180000, IN = 31000;
  const dims = {
    weight: [['1', 0.09, 0.4], ['2', 0.15, 0.6], ['3', 0.22, 0.8], ['4', 0.24, 1.0], ['5', 0.18, 1.3], ['6', 0.07, 2.1], ['7', 0.03, 3.4], ['8', 0.01, 6.5], ['Unknown', 0.01, 1]],
    size: [['1', 0.37, 0.7], ['2', 0.45, 0.9], ['3', 0.11, 1.4], ['4', 0.05, 2.6], ['5', 0.01, 5.2], ['Unknown', 0.01, 1]],
    zone: [['1', 0.02, 0.3], ['2', 0.08, 0.5], ['3', 0.07, 0.6], ['4', 0.15, 0.8], ['5', 0.21, 0.9], ['6', 0.14, 1.0], ['7', 0.12, 1.2], ['8', 0.2, 1.5], ['9', 0.003, 2], ['Unknown', 0.017, 3]],
    label: [['Redo', 0.87, 1.1], ['Merchant', 0.125, 0.3], ['Unknown', 0.005, 1]],
    service: [['GroundAdvantage', 0.53, 0.8], ['Ground', 0.15, 1.6], ['DHLParcelExpedited', 0.12, 0.3], ['SurePostOver1Lb', 0.08, 0.9], ['2ndDayAir', 0.01, 6], ['FEDEX_INTERNATIONAL_CONNECT_PLUS', 0.002, 25], ['Priority', 0.02, 1.2], ['SMART_POST', 0.006, 4]],
    state: [['CA', 0.11, 0.9], ['TX', 0.1, 1.1], ['FL', 0.06, 1.0], ['NY', 0.05, 1.0], ['Outside US', 0.005, 30], ['CO', 0.022, 2.4], ['HI', 0.005, 3.1], ['AK', 0.002, 4.2], ['PA', 0.033, 0.9], ['OH', 0.03, 0.8], ['IL', 0.034, 0.7], ['WA', 0.025, 1.0]],
    zip: [['Other', 0.014, 9], ['816', 0.001, 40], ['283', 0.002, 15], ['939', 0.001, 20], ['840', 0.012, 1.1], ['770', 0.007, 1.2], ['750', 0.009, 0.9], ['100', 0.005, 1.4], ['967', 0.004, 3.2]],
    origin: [['Los Angeles, CA', 0.032, 2.8], ['Commerce, CA', 0.018, 4.3], ['Beaverton, OR', 0.034, 1.2], ['Denver, CO', 0.021, 1.7], ['Lehi, UT', 0.01, 3.5], ['Salt Lake City, UT', 0.012, 0.9], ['Dallas, TX', 0.018, 0.6], ['Tempe, AZ', 0.012, 1.4]],
    merchant: merchants.slice(0, 30).map((m, i) => [m.id, Math.max(0.001, m.w / 300), i < 3 ? 4 - i : 0.5 + (i % 5) / 3]),
  };
  const rows = [{ DIM: 'all', K: '', IV: IV.toFixed(2), INN: String(IN), PN: String(PN) }];
  for (const [dim, list] of Object.entries(dims)) {
    const wsum = list.reduce((s, [, sp, lift]) => s + sp * lift, 0), full = ['weight', 'size', 'zone', 'label'].includes(dim);
    for (const [k, sp, lift] of list) {
      const si = (sp * lift) / (full ? wsum : Math.max(wsum, 1));
      rows.push({ DIM: dim, K: k, IV: (IV * si).toFixed(2), INN: String(Math.round(IN * si)), PN: String(Math.round(PN * sp)) });
    }
  }
  return rows;
}

// Top 10: ranked merchant x carrier x line groups, then their shipment facts and top SKU.
const TOPMIX = {
  u: [['USPS', 'S|Package type change', 'Package Type'], ['FedEx', 'C|prior_invoice_upward_revision', 'Customs Duty | Original VAT'], ['USPS', 'M|merchant_surcharge_recovery-', ''], ['UPS', 'C|base_invoice_above_purchase_quote', 'SMALL PACKAGE FREIGHT'], ['USPS', 'S|Weight or size correction', 'POSTAGEDELTA AGGREGATED'], ['USPS', 'M|merchant_base_charge_adjustment-', ''], ['UPS', 'S|Duties and customs', 'Brokerage | Ca Customs Hst'], ['DhlEcs', 'M|label_void_reversal-', ''], ['UPS', 'C|currency', 'Freight Charge | Fuel Surcharge | HST'], ['UPSSurePost', 'S|Oversize package', 'Non-Standard Cube | Shipping Charge Correction UPS Ground Saver - 1 LB or Greater']],
  o: [['DhlEcs', 'C|base_invoice_below_purchase_quote', 'Base Charge | Fuel Surcharge'], ['FirstMile', 'M|merchant_surcharge_recovery+', ''], ['USPS', 'C|carrier_credit_or_refund', 'Postage Fee'], ['FedEx', 'M|merchant_surcharge_recovery+', ''], ['USPS', 'M|usps_pc_postage_fee_revenue+', ''], ['FedEx', 'C|base_invoice_below_purchase_quote', 'Discount | Transportation Charge'], ['UPS', 'M|merchant_duplicate_charge+', ''], ['USPS', 'C|usps_unused_label_credit', ''], ['DhlEcs', 'C|base_invoice_below_purchase_quote', 'Base Charge'], ['USPS', 'C|usps_favorable_repricing', '']],
};
function topRank(sql) {
  const dir = sql.includes('diagnostic_variance_usd < 0') ? 'u' : 'o', sign = dir === 'u' ? -1 : 1;
  return TOPMIX[dir].map(([car, comp, ds], i) => {
    const v = sign * (22000 / (1 + i * 0.35)), n = Math.round(300 + rnd() * 2000), act = i % 3 !== 1;
    return { M: merchants[(i * 7 + (dir === 'u' ? 1 : 4)) % merchants.length].id, CAR: car, COMP: comp, N: String(n), V: v.toFixed(2), LR: (v * 1.3).toFixed(2), DS: ds || null, FIRST: '2025-0' + (2 + (i % 7)) + '-1' + i, LAST: act ? '2026-10-0' + (1 + (i % 5)) : '2025-09-28', V30: act ? (v * 0.08).toFixed(2) : '0', N30: act ? String(Math.round(n * 0.08)) : '0', TOT: (sign * 543004).toFixed(2) };
  });
}
function topFacts(sql) {
  const gks = [...sql.matchAll(/'([0-9a-f]{24}\|[^']+)'/g)].map((m) => m[1]);
  const titles = [['F-06-16', 'Blue and Ecru Striped Soam Dress - One Size'], ['DVG004-NB', 'Takeyoshi Altitude Master NB Clear'], ['N-HO-XL', 'Navy Golf Hoodie - Navy / XL'], ['IZ-MAS-3M', 'Zero Waste Mascara - BLK'], ['PP-PROBLUE-7P', 'Pond Pro Blue Pond & Lake Dye']];
  return gks.map((gk, i) => {
    const n = 200 + i * 37, heavy = i % 2 === 0;
    const facts = { n, heavier: heavy ? Math.round(n * 0.7) : 3, withw: Math.round(n * 0.9), bigger: i % 3 === 0 ? Math.round(n * 0.4) : 2, withd: Math.round(n * 0.6), itemsheavier: Math.round(n * 0.2), withi: Math.round(n * 0.7), withsku: Math.round(n * 0.85), qw: 9.6 + i, bw: heavy ? 24.8 + i : 10 + i, iw: 8 + i, qb: '12x9x1', bb: i % 3 === 0 ? '13x10x2' : '12x9x1' };
    const [sku, title] = titles[i % titles.length];
    return { GK: gk, FACTS: JSON.stringify(facts), TOPSKU: sku, TOPTITLE: title, TOPN: String(Math.round(n * 0.4)), RB: (i % 2 ? -120.5 : 35.2).toFixed(2) };
  });
}
function line(sql) {
  const under = sql.includes('diagnostic_variance_usd < 0'), sign = under ? -1 : 1;
  const stats = { n: 15650, heavier: 4639, withw: 5295, bigger: 2133, withd: 5976, itemsheavier: 815, withi: 4694, withsku: 15387, qw: 15.1, bw: 24.8, iw: 12.2, qb: '12x9x1', bb: '13x10x2', lv: sign * 49917.36, rb: -242.59, net: sign * 41020.11 };
  const charges = [['POSTAGEDELTA AGGREGATED', 9120, -30120], ['Weight', 4120, -11200], ['Dimensions', 2210, -6350], ['Inaccurate Dimensions', 200, -2247]].map(([d, n, v]) => ({ d, n, v: sign * Math.abs(v) }));
  const skus = merchants.slice(0, 18).map((m, i) => ({ m: m.id, sku: i % 4 === 3 ? 'Unknown' : `SKU-${100 + i}${i % 5 === 0 ? ' + GIFT-BOX' : ''}`, t: `${pick(WORDS)} ${pick(['Tee', 'Backpack', 'Hoodie', 'Serum', 'Board Book'])}`, n: 2060 - i * 100, lv: sign * (4539 - i * 220), rb: i % 3 ? 0 : -42.1, qw: 9.6 + i, bw: 14.9 + i * 2, iw: 8 + i, qb: '12x9x1', bb: i % 2 ? '13x10x2' : '12x9x1' }));
  const ships = Array.from({ length: 40 }, (_, i) => ({ m: merchants[i % 20].id, fg: 'fg' + i, trk: '9400111206' + String(21388000 + i * 97), sku: `SKU-${100 + (i % 18)}`, t: 'Product ' + i, lv: sign * (38 - i * 0.7), rb: i % 4 ? 0 : 4.1, qw: 8 + (i % 9), bw: 16 + (i % 13), iw: 7 + (i % 6), qb: '12x9x1', bb: i % 3 ? '13x10x2' : '12x9x1' }));
  const facts = { ...stats, n: 5000 };
  return [{ STATS: JSON.stringify({ n: stats.n, lv: stats.lv, rb: stats.rb, net: stats.net }), FACTS: JSON.stringify(facts), CHARGES: JSON.stringify(charges), SKUS: JSON.stringify(skus), SHIPS: JSON.stringify(ships) }];
}

async function query(sql, opts = {}) {
  if (/--|\/\*|;/.test(sql)) throw new Error('Fridge rejects comments and semicolons');
  if (opts.timeoutMs > 60000) throw new Error('{"error":[{"origin":"number","code":"too_big","maximum":60000,"inclusive":true,"path":["timeoutMs"],"message":"Invalid input"}]}');
  if (opts.limit > 500) throw new Error('limit too big');
  await wait(250 + rnd() * 700);
  if (sql.includes('dict_m')) return { rows: cubeChunk(+sql.match(/\),\s*(\d+)\)\s*=\s*(\d+)\)/)[2]), rowCount: 1, hasMore: false };
  if (sql.includes('to_json(array_agg(array_construct')) return { rows: owners() };
  if (sql.includes("monetization_type = 'OMS Label Spread'")) return { rows: recDaily() };
  if (sql.includes('"OMS Label Spread Revenue"')) { if (sql.includes('FINANCE')) throw new Error('Object does not exist or not authorized'); return { rows: recMonthly() }; }
  if (sql.includes(') charges,')) return { rows: line(sql) };
  if (sql.includes('topsku')) return { rows: topFacts(sql) };
  if (sql.includes(' n30,')) return { rows: topRank(sql) };
  if (sql.includes("'T|total'")) return { rows: bridge(sql) };
  if (sql.includes('grouping sets')) return { rows: where(sql) };
  if (sql.includes('min(tracking_code) trk')) return { rows: shipments() };
  if (sql.includes('invoice_charge_descriptions')) return { rows: reasons() };
  throw new Error('mock: unknown query ' + sql.slice(0, 80));
}

const mem = { docs: new Map(), files: new Map() };
function makeStore(key) {
  const col = (name) => {
    const k = key + '/' + name;
    if (!mem.docs.has(k)) mem.docs.set(k, new Map());
    const m = mem.docs.get(k);
    const items = () => [...m].map(([key, value]) => ({ key, value, revision: 1 }));
    return {
      list: async () => items().slice(0, 100),
      page: async ({ limit = 100, offset = 0 } = {}) => ({ items: items().slice(offset, offset + limit), pagination: { limit, offset } }),
      get: async (dk) => (m.has(dk) ? { key: dk, value: m.get(dk) } : null),
      set: async (dk, v) => { await wait(120); m.set(dk, v); return { key: dk, value: v }; },
      create: async (v, dk) => { m.set(dk || String(m.size + 1), v); return { key: dk, value: v }; },
    };
  };
  const files = {
    upload: async (path, body) => { mem.files.set(key + '/' + path, String(body)); return { path }; },
    text: async (path) => { if (path === 'app/index.html') return (await fetch('/index.html')).text(); const f = mem.files.get(key + '/' + path); if (f == null) throw new Error('404'); return f; },
    json: async (path) => JSON.parse(await files.text(path)),
  };
  return { db: { collection: col }, files };
}
// Seed a couple of earlier daily readings and tracked merchants so Progress has something to show.
(() => {
  const s = makeStore('shipping-rev-rec').db.collection('snapshots');
  [['2026-09-28', -585000, 702000], ['2026-10-01', -571000, 699000], ['2026-10-03', -560000, 695000]].forEach(([date, u, o]) => s.create({ date, u, o, un: 150000, on: 690000 }, date));
  mem.files.set('shipping-rev-rec/summary/ai.json', JSON.stringify({ v: 1, writtenAt: '2026-10-06', by: 'Claude', scope: 'all-time issues across every merchant',
    briefing: { u: ['The single biggest cause is a billing error in spring 2025 that credited merchants for carrier fees instead of charging them.', 'Three problems are still costing us money every month and should be fixed first.'], o: ['Three merchants were charged more for carrier fees than the carriers finally billed us, and are likely owed credits.'] },
    notes: { [`u|${merchants[1].id}|USPS|S|Package type change`]: { headline: 'USPS packaging fees on these orders were never collected', what: 'USPS charges an extra packaging fee when a package does not match the package type chosen on the label. It charged this fee on {shipments} shipments, and none of the {amount} was collected.', why: 'Before mid May 2025 we had no way to pass these fees on to merchants. This is still happening, with {last30} in the last 30 days.', fix: ['Correct the package type saved for this mailer.', 'Bill the {amount} backlog or write it off.'] }, [`o|${merchants[4].id}|DhlEcs|C|base_invoice_below_purchase_quote`]: { headline: 'DHL eCommerce charges us less than our label price on these orders', what: 'DHL eCommerce billed us slightly less than the label price on {shipments} shipments, {amount} in total.', why: 'The merchant pays our label price, which is set a little above DHL\'s actual rate. This is extra margin, not a mistake.', fix: ['Decide whether this extra margin is intended.', 'If not, lower the price to match DHL\'s actual rate.'] } } }));
  const a = makeStore('shipping-rev-rec').db.collection('actions');
  a.create({ status: 'working', owner: 'Avery Lin', note: 'Re-billing UPS corrections for Sept', name: merchants[3].name, updatedAt: '2026-10-04T15:00:00Z', updatedBy: 'Jackie' }, merchants[3].id);
  a.create({ status: 'fixed', owner: 'Jordan Park', note: 'Duplicate charges refunded', name: merchants[7].name, updatedAt: '2026-10-02T15:00:00Z', updatedBy: 'Jackie' }, merchants[7].id);
})();

export function createFridge() {
  return {
    site: { slug: 'shipping-rev-rec' },
    identity: { me: async () => ({ id: 'u1', email: 'jackie@redo.com', name: 'Jackie' }) },
    snowflake: { query },
    stores: { open: (k) => makeStore(k), default: makeStore('default'), list: async () => ({ stores: [] }) },
    files: { ...makeStore('default').files, shared: (k) => makeStore(k).files },
  };
}
