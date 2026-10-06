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

async function query(sql) {
  if (/--|\/\*|;/.test(sql)) throw new Error('Fridge rejects comments and semicolons');
  await wait(250 + rnd() * 700);
  if (sql.includes('dict_m')) return { rows: cubeChunk(+sql.match(/\),\s*(\d+)\)\s*=\s*(\d+)\)/)[2]), rowCount: 1, hasMore: false };
  if (sql.includes('to_json(array_agg(array_construct')) return { rows: owners() };
  if (sql.includes("monetization_type = 'OMS Label Spread'")) return { rows: recDaily() };
  if (sql.includes('"OMS Label Spread Revenue"')) { if (sql.includes('FINANCE')) throw new Error('Object does not exist or not authorized'); return { rows: recMonthly() }; }
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
