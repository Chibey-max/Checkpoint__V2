/**
 * AT-09 on testnet: Guard (bug or compromise) signs baskets that break the caps,
 * and the owner even approves them. The Vault re-checks and refuses.
 *   pnpm attack:over-cap
 * Uses GUARD_SECRET_KEY to sign directly, as decisions-pending #11 describes:
 * a "Guard bug" without a backdoor in the Guard service.
 */
import {
  accountOf,
  approve,
  balance,
  CPUSD,
  errCode,
  execute,
  guardSign,
  link,
  OWNER,
  payload,
  policy,
  report,
  send,
  TGAS,
  VAULT,
  type Row,
} from './lib';

async function main(): Promise<number> {
  const rows: Row[] = [];
  const pol = await policy();
  const cap = BigInt(pol.max_basket_total);

  // 1. Over the basket cap (cap + 1 cpUSD, split so each vendor line looks normal).
  const half = (cap + CPUSD) / 2n;
  const s1 = guardSign(
    await payload([
      ['vendor-01', half],
      ['vendor-02', cap + CPUSD - half],
    ]),
  );
  const a1 = await approve(s1);
  const before1 = await balance();
  const o1 = await execute(s1);
  const after1 = await balance();
  rows.push({
    id: 'AT-09',
    what: `Guard-signed, owner-approved basket of ${(cap + CPUSD) / CPUSD} cpUSD (cap ${cap / CPUSD})`,
    pass: !o1.ok && errCode(o1) === 'ERR_OVER_BASKET_CAP' && after1.available === before1.available,
    result: errCode(o1),
    proof: `approve ${link(a1.tx)}, execute ${link(o1.tx)}`,
  });

  // 2. Over the daily cap: the owner lowers their own daily cap just above today's spend.
  const os = (await (
    await import('@checkpoint/shared')
  ).viewFunction(process.env.NEAR_RPC_URL!, VAULT, 'get_owner_state', { owner_id: OWNER })) as {
    spent_today: string;
  };
  const spent = BigInt(os.spent_today);
  const ownerCap = spent + 5n * CPUSD;
  const owner = accountOf(OWNER);
  const lim = await send(
    owner,
    VAULT,
    'set_owner_limits',
    { max_basket: null, daily_cap: ownerCap.toString() },
    1n,
    30n * TGAS,
  );
  try {
    const s2 = guardSign(await payload([['vendor-01', 10n * CPUSD]]));
    const a2 = await approve(s2);
    const o2 = await execute(s2);
    rows.push({
      id: 'AT-09',
      what: `10 cpUSD basket with ${spent} spent today and an owner daily cap of ${ownerCap}`,
      pass: !o2.ok && errCode(o2) === 'ERR_OVER_DAILY_CAP',
      result: errCode(o2),
      proof: `limits ${link(lim.tx)}, approve ${link(a2.tx)}, execute ${link(o2.tx)}`,
    });
  } finally {
    const clr = await send(
      owner,
      VAULT,
      'set_owner_limits',
      { max_basket: null, daily_cap: null },
      1n,
      30n * TGAS,
    );
    rows.push({
      id: 'AT-09',
      what: 'owner limits cleared again',
      pass: clr.ok,
      result: clr.ok ? 'ok' : errCode(clr),
      proof: link(clr.tx),
    });
  }
  return report('AT-09: Guard signs over-cap baskets (testnet)', rows);
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`attack:over-cap: ${e.message}`);
    process.exit(1);
  },
);
