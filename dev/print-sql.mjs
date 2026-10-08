// Prints the SQL the app generates, so it can be run directly against Snowflake.
// Usage: node dev/print-sql.mjs <cube|owners|recDaily|recMonthly|shipments|reasons|bridge|where|line|top|topfacts|pld|pldcount> [arg]
// bridge, where, line and top take a JSON scope (line also takes comp, e.g. "S|Package type change"), e.g. '{"dir":"u","from":0,"to":643,"car":["USPS"],"types":[2]}' (days since 2025-01-01).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = html.split('<script type="module">')[1].split('</script>')[0];
const head = js.split('/* ---------------- state ---------------- */')[0];
const helpers = js.split('/* ---------------- helpers ---------------- */')[1].split('/* ---------------- Fridge SDK ---------------- */')[0];
const sql = js.split('/* ---------------- SQL ---------------- */')[1].split('/* ---------------- data load ---------------- */')[0];
const ctx = { Intl, Date, Math, String, JSON, document: {}, S: { data: null, range: { preset: 'all' } } };
vm.createContext(ctx);
vm.runInContext(head + helpers + sql + '\nthis.out = { sqlCube, sqlOwners, sqlRecDaily, sqlRecMonthly, sqlShipments, sqlReasons, sqlBridge, sqlWhere, sqlLine, sqlTopRank, sqlTopFacts, sqlPld, sqlPldCount, dimExpr, T, iso };', ctx);
const [what, arg] = process.argv.slice(2);
const o = ctx.out;
const scope = () => {
  const j = JSON.parse(arg || '{}'), from = j.from ?? 0, to = j.to ?? 643, car = (j.car || []).map((x) => `'${x}'`);
  let where = ` and issue_date between '${o.iso(from)}' and '${o.iso(to)}'`;
  if (car.length) where += ` and ${o.dimExpr('carriers')} in (${car.join(', ')})`;
  return [{ from, to, where, mids: null, carRaw: car.length ? car : null, orgs: null, dsts: null, types: j.types || null }, j.dir || 'u'];
};
const q = { line: () => { const [sc, dir] = scope(); return o.sqlLine(sc, dir, JSON.parse(arg).comp); }, top: () => { const [sc, dir] = scope(); return o.sqlTopRank(sc, dir, sc.to); }, topfacts: () => { const [sc, dir] = scope(); return o.sqlTopFacts(sc, dir, JSON.parse(arg).groups); }, pld: () => { const [sc, dir] = scope(); const j = JSON.parse(arg); return o.sqlPld(sc, dir, { items: !!j.items, part: j.part || 0, parts: j.parts || 1, min: j.min || 0 }); }, pldcount: () => { const [sc, dir] = scope(); return o.sqlPldCount(sc, dir, JSON.parse(arg).min || 0); }, bridge: () => o.sqlBridge(...scope()), where: () => o.sqlWhere(...scope()).sql, cube: () => o.sqlCube(+(arg || 0)), owners: o.sqlOwners, recDaily: o.sqlRecDaily, recMonthly: () => o.sqlRecMonthly(o.T.MR[0]), shipments: () => o.sqlShipments(arg, 0, 700), reasons: () => o.sqlReasons(arg || '') }[what];
const s = q();
if (/--|\/\*|;/.test(s)) { console.error('SQL contains a comment or semicolon'); process.exit(1); }
console.log(s);
