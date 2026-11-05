/**
 * `pnpm snapshot:check [dir]` (task D-1.2): validates a snapshot so Patrick
 * can check rows while capturing. Exits 1 on errors; warnings are listed.
 */
import { formatIssues, loadSnapshot, resolveFromRoot } from '@checkpoint/shared/node';

const dir = resolveFromRoot(process.argv[2] ?? process.env.EVIDENCE_DIR ?? './data/snapshot');
const snap = loadSnapshot(dir);
const errors = snap.issues.filter((i) => i.severity === 'error');
const warnings = snap.issues.filter((i) => i.severity === 'warning');

console.log(`snapshot ${dir}`);
console.log(`  catalogue items: ${snap.catalog.length}`);
for (const c of snap.catalog) {
  const rows = snap.offers.filter((o) => o.item_key === c.item_key);
  const fixtures = rows.filter((o) => o.capture_method === 'fixture').length;
  console.log(`  ${c.item_key.padEnd(24)} ${rows.length - fixtures} captured, ${fixtures} fixture`);
}
if (snap.issues.length) console.log(`\n${formatIssues(snap.issues)}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
