/**
 * AT-04 on testnet: a basket paying vendor-05, which is not on the Vault's
 * allowlist, signed with the Guard key and approved by the owner. Guard itself
 * blocks vendor-05 offers (R-04); this checks the Vault refuses it anyway.
 *   pnpm attack:unlisted-vendor
 */
import { approve, balance, CPUSD, errCode, execute, guardSign, link, payload, report, type Row } from './lib';

async function main(): Promise<number> {
  const rows: Row[] = [];
  const before = await balance();
  const s = guardSign(await payload([['vendor-05', 5n * CPUSD]]));
  const a = await approve(s);
  const o = await execute(s);
  const after = await balance();
  rows.push({
    id: 'AT-04',
    what: 'Guard-signed, owner-approved basket paying vendor-05 (not allowlisted)',
    pass: !o.ok && errCode(o) === 'ERR_VENDOR' && after.available === before.available,
    result: errCode(o),
    proof: `approve ${link(a.tx)}, execute ${link(o.tx)}`,
  });
  return report('AT-04: unlisted vendor (testnet)', rows);
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`attack:unlisted-vendor: ${e.message}`);
    process.exit(1);
  },
);
