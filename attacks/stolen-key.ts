/**
 * AT-08 on testnet: the Settlement Agent's function-call key is stolen.
 *   pnpm attack:stolen-key
 * The thief holds AGENT_FC_PRIVATE_KEY (receiver = Vault, method =
 * execute_basket only, no deposits). Every attempt must fail and no funds move.
 */
import {
  accountOf,
  AGENT,
  balance,
  CPUSD,
  env,
  errCode,
  execute,
  link,
  payload,
  report,
  send,
  TOKEN,
  VAULT,
  type Row,
} from './lib';
import type { KeyPairString } from 'near-api-js';

async function main(): Promise<number> {
  const rows: Row[] = [];
  const before = await balance();
  const thief = accountOf(AGENT, env('AGENT_FC_PRIVATE_KEY') as KeyPairString);

  // 1. Pay itself: a crafted basket to the agent's own account with a made-up signature.
  const p = await payload([[AGENT, 100n * CPUSD]]);
  const { encodePayload } = await import('@checkpoint/shared');
  const forged = {
    payload_b64: Buffer.from(encodePayload(p, { strict: false })).toString('base64'),
    signature_b64: Buffer.alloc(64, 7).toString('base64'),
    hash_hex: '',
  };
  const o1 = await execute(forged);
  rows.push({
    id: 'AT-08',
    what: 'execute_basket paying the agent itself, forged signature',
    pass: !o1.ok && errCode(o1) === 'ERR_BAD_SIGNATURE',
    result: errCode(o1),
    proof: link(o1.tx),
  });

  // 2. Admin call with the agent key.
  const o2 = await send(
    thief,
    VAULT,
    'set_limits',
    { max_basket_total: '1', daily_cap: '1', max_vendors: 1, max_ttl_ms: '1' },
    0n,
  );
  rows.push({
    id: 'AT-08',
    what: 'set_limits with the agent key',
    pass: !o2.ok,
    result: o2.tx ? errCode(o2) : `refused by the access key: ${o2.error.slice(0, 90)}`,
    proof: link(o2.tx),
  });

  // 3. Withdraw (needs 1 yocto, which a function-call key cannot attach).
  const o3 = await send(thief, VAULT, 'withdraw', { token_id: TOKEN, amount: '1' }, 1n);
  rows.push({
    id: 'AT-08',
    what: 'withdraw with the agent key',
    pass: !o3.ok,
    result: o3.tx ? errCode(o3) : `refused: ${o3.error.slice(0, 90)}`,
    proof: link(o3.tx),
  });

  // 4. Attach a deposit to execute_basket.
  const o4 = await execute(forged, { deposit: 1n });
  rows.push({
    id: 'AT-08',
    what: 'execute_basket with a 1 yocto deposit',
    pass: !o4.ok,
    result: o4.tx ? errCode(o4) : `refused: ${o4.error.slice(0, 90)}`,
    proof: link(o4.tx),
  });

  // 5. Any other contract (the token) with the agent key.
  const o5 = await send(thief, TOKEN, 'ft_transfer', { receiver_id: AGENT, amount: '1' }, 1n);
  rows.push({
    id: 'AT-08',
    what: 'cpUSD ft_transfer with the agent key',
    pass: !o5.ok,
    result: o5.tx ? errCode(o5) : `refused: ${o5.error.slice(0, 90)}`,
    proof: link(o5.tx),
  });

  const after = await balance();
  rows.push({
    id: 'AT-08',
    what: 'owner balance unchanged',
    pass: after.available === before.available && after.reserved === before.reserved,
    result: `available ${after.available}`,
    proof: 'get_balance',
  });
  return report('AT-08: stolen agent key (testnet)', rows);
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`attack:stolen-key: ${e.message}`);
    process.exit(1);
  },
);
