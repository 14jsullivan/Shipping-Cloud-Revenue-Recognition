// Prints the SQL the app generates, so it can be run directly against Snowflake.
// Usage: node dev/print-sql.mjs <cube|owners|recDaily|recMonthly|shipments|reasons> [arg]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = html.split('<script type="module">')[1].split('</script>')[0];
const head = js.split('/* ---------------- state ---------------- */')[0];
const helpers = js.split('/* ---------------- helpers ---------------- */')[1].split('/* ---------------- Fridge SDK ---------------- */')[0];
const sql = js.split('/* ---------------- SQL ---------------- */')[1].split('/* ---------------- data load ---------------- */')[0];
const ctx = { Intl, Date, Math, String, JSON, document: {}, S: { data: null, range: { preset: 'all' } } };
vm.createContext(ctx);
vm.runInContext(head + helpers + sql + '\nthis.out = { sqlCube, sqlOwners, sqlRecDaily, sqlRecMonthly, sqlShipments, sqlReasons, T, iso };', ctx);
const [what, arg] = process.argv.slice(2);
const o = ctx.out;
const q = { cube: () => o.sqlCube(+(arg || 0)), owners: o.sqlOwners, recDaily: o.sqlRecDaily, recMonthly: () => o.sqlRecMonthly(o.T.MR[0]), shipments: () => o.sqlShipments(arg, 0, 700), reasons: () => o.sqlReasons(arg || '') }[what];
const s = q();
if (/--|\/\*|;/.test(s)) { console.error('SQL contains a comment or semicolon'); process.exit(1); }
console.log(s);
