/**
 * AT-07 on testnet: an expired signature, an expired approval, and a DAO policy
 * change between signing and execution.
 *   pnpm attack:expired
 * The policy change is a set_limits call by the current dao_id with the same
 * values, which still bumps policy_version (before the Sputnik hand-over the
 * dao_id is the setup account, whose key is in the legacy keychain).
 */
import {
  accountOf,
  approve,
  CPUSD,
  errCode,
  execute,
  guardSign,
  link,
  payload,
  policy,
  report,
  send,
  TGAS,
  VAULT,
  type Row,
} from './lib';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** STEPS=1,2 runs only those steps (step 3 bumps policy_version each run). */
const STEPS = process.env.STEPS?.split(',') ?? ['1', '2', '3'];

async function main(): Promise<number> {
  const rows: Row[] = [];

  if (STEPS.includes('1')) {
    // 1. The signed basket expires (payload expires_at 20 s out; approval lasts longer).
    const s1 = guardSign(
      await payload([['vendor-01', CPUSD]], (p) => {
        p.expires_at_ms = p.created_at_ms + 20_000n;
      }),
    );
    const a1 = await approve(s1, 10 * 60_000);
    await sleep(25_000);
    const o1 = await execute(s1);
    rows.push({
      id: 'AT-07',
      what: 'signature expired 5 s before execution',
      pass: !o1.ok && errCode(o1) === 'ERR_EXPIRED',
      result: errCode(o1),
      proof: `approve ${link(a1.tx)}, execute ${link(o1.tx)}`,
    });
  }
  if (STEPS.includes('2')) {
    // 2. The approval expires (approval 20 s; payload valid 15 min).
    const s2 = guardSign(await payload([['vendor-01', CPUSD]]));
    const a2 = await approve(s2, 20_000);
    await sleep(25_000);
    const o2 = await execute(s2);
    rows.push({
      id: 'AT-07',
      what: 'owner approval expired 5 s before execution',
      pass: !o2.ok && (errCode(o2) === 'ERR_EXPIRED' || errCode(o2) === 'ERR_NO_APPROVAL'),
      result: errCode(o2),
      proof: `approve ${link(a2.tx)}, execute ${link(o2.tx)}`,
    });
  }
  if (STEPS.includes('3')) {
    // 3. Policy changes between signing and execution.
    const s3 = guardSign(await payload([['vendor-01', CPUSD]]));
    const a3 = await approve(s3);
    const pol = await policy();
    const dao = accountOf(pol.dao_id);
    const ch = await send(
      dao,
      VAULT,
      'set_limits',
      {
        max_basket_total: pol.max_basket_total,
        daily_cap: pol.daily_cap,
        max_vendors: pol.max_vendors,
        max_ttl_ms: String(pol.max_ttl_ms),
      },
      1n,
      50n * TGAS,
    );
    const o3 = await execute(s3);
    const v = (await policy()).policy_version;
    rows.push({
      id: 'AT-07',
      what: `DAO set_limits between sign and execute (policy v${pol.policy_version} → v${v})`,
      pass: ch.ok && !o3.ok && errCode(o3) === 'ERR_POLICY_VERSION',
      result: errCode(o3),
      proof: `approve ${link(a3.tx)}, set_limits ${link(ch.tx)}, execute ${link(o3.tx)}`,
    });
  }
  return report('AT-07: expiry and policy change (testnet)', rows);
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`attack:expired: ${e.message}`);
    process.exit(1);
  },
);
