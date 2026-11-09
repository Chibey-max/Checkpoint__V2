/**
 * Sputnik v2 council helpers (FR-G07, tasks I-0.5 / I-5.1).
 *
 *   pnpm dao:propose -- set_limits '{"max_basket_total":"200000000","daily_cap":"300000000","max_vendors":4,"max_ttl_ms":"1800000"}' [--as <council>] [--desc "..."]
 *   pnpm dao:vote -- <proposal_id> [--as <council>] [--reject]
 *   pnpm dao:show [-- <proposal_id>]
 *
 * A proposal is a FunctionCall on the Vault with 1 yocto and 50 TGas (PRD §11.6),
 * bonded with get_policy().proposal_bond. Signers come from the legacy keychain
 * (~/.near-credentials/testnet/<account>.json) or DAO_SIGNER_KEY.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Account, actions, type KeyPairString } from 'near-api-js';
import { viewFunction } from '@checkpoint/shared';
import { loadRootEnv } from '@checkpoint/shared/node';

loadRootEnv();
const RPC = process.env.NEAR_RPC_URL || 'https://rpc.testnet.fastnear.com';
const VAULT = process.env.VAULT_ID || 'vault.cpdemo.testnet';
const DAO = process.env.DAO_ID || 'checkpoint-council.sputnik-v2.testnet';
const TGAS = 1_000_000_000_000n;
const NB = 'https://testnet.nearblocks.io/txns/';

function signer(id: string): Account {
  if (process.env.DAO_SIGNER_KEY)
    return new Account(id, RPC, process.env.DAO_SIGNER_KEY as KeyPairString);
  const p = join(homedir(), '.near-credentials', 'testnet', `${id}.json`);
  if (!existsSync(p)) throw new Error(`no key for ${id}: set DAO_SIGNER_KEY or add ${p}`);
  return new Account(
    id,
    RPC,
    (JSON.parse(readFileSync(p, 'utf8')) as { private_key: KeyPairString }).private_key,
  );
}

async function call(
  as: string,
  method: string,
  args: Record<string, unknown>,
  deposit: bigint,
  gas: bigint,
) {
  const r = (await signer(as).signAndSendTransaction({
    receiverId: DAO,
    actions: [actions.functionCall(method, args, gas, deposit)],
    // FINAL, so a vote that executes the proposal reports the proposal's final status.
    waitUntil: 'FINAL',
    throwOnFailure: false,
  })) as {
    transaction_outcome: { id: string };
    status: Record<string, unknown>;
    receipts_outcome?: Array<{ outcome: { status: Record<string, unknown> } }>;
  };
  const failed = 'Failure' in r.status ? JSON.stringify(r.status.Failure) : '';
  const inner = (r.receipts_outcome ?? []).map((o) => o.outcome.status).find((s) => 'Failure' in s);
  return {
    tx: r.transaction_outcome.id,
    failed,
    inner: inner ? JSON.stringify(inner.Failure) : '',
    value: r.status.SuccessValue as string | undefined,
  };
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      as: { type: 'string' },
      desc: { type: 'string' },
      reject: { type: 'boolean', default: false },
    },
  });
  const as = values.as ?? process.env.DAO_SIGNER ?? '';
  if (cmd === 'propose') {
    const [method, json] = positionals;
    if (!method || !json || !as)
      throw new Error(
        'usage: pnpm dao:propose -- <vault_method> <json_args> --as <council_account>',
      );
    JSON.parse(json); // must be valid JSON
    const pol = (await viewFunction(RPC, DAO, 'get_policy', {})) as { proposal_bond: string };
    const proposal = {
      description: values.desc ?? `Checkpoint: ${method} ${json}`,
      kind: {
        FunctionCall: {
          receiver_id: VAULT,
          actions: [
            {
              method_name: method,
              args: Buffer.from(json).toString('base64'),
              deposit: '1',
              gas: String(50n * TGAS),
            },
          ],
        },
      },
    };
    const r = await call(as, 'add_proposal', { proposal }, BigInt(pol.proposal_bond), 100n * TGAS);
    if (r.failed) throw new Error(`add_proposal failed: ${r.failed} (${NB}${r.tx})`);
    const id = r.value
      ? JSON.parse(Buffer.from(r.value, 'base64').toString())
      : await viewFunction(RPC, DAO, 'get_last_proposal_id', {});
    console.log(`proposal ${id}: ${method} on ${VAULT}  tx ${NB}${r.tx}`);
    return 0;
  }
  if (cmd === 'vote') {
    const id = Number(positionals[0]);
    if (!Number.isInteger(id) || !as)
      throw new Error('usage: pnpm dao:vote -- <proposal_id> --as <council_account>');
    const p = (await viewFunction(RPC, DAO, 'get_proposal', { id })) as { kind: unknown };
    // Newer Sputnik versions require the proposal kind with the vote; older ones ignore it.
    const r = await call(
      as,
      'act_proposal',
      { id, action: values.reject ? 'VoteReject' : 'VoteApprove', proposal: p.kind },
      0n,
      200n * TGAS,
    );
    // A vote that passes the proposal also runs the Vault call; if the Vault refuses
    // it (e.g. ERR_BOUNDS), the vote still counted. Report that instead of failing.
    const vaultErr = /ERR_(?!PROPOSAL)[A-Z_]+/.exec(r.failed)?.[0];
    if (r.failed && !vaultErr) throw new Error(`act_proposal failed: ${r.failed} (${NB}${r.tx})`);
    if (vaultErr) {
      console.log(
        `voted on ${id} as ${as}: proposal executed, the Vault refused it with ${vaultErr}  tx ${NB}${r.tx}`,
      );
      return 0;
    }
    const after = (await viewFunction(RPC, DAO, 'get_proposal', { id })) as { status: string };
    console.log(
      `voted ${values.reject ? 'reject' : 'approve'} on ${id} as ${as}: status ${after.status}${r.inner ? `, Vault call failed: ${r.inner}` : ''}  tx ${NB}${r.tx}`,
    );
    return 0;
  }
  if (cmd === 'show') {
    const pol = await viewFunction(RPC, DAO, 'get_policy', {});
    if (positionals[0])
      console.log(
        JSON.stringify(
          await viewFunction(RPC, DAO, 'get_proposal', { id: Number(positionals[0]) }),
          null,
          2,
        ),
      );
    else console.log(JSON.stringify(pol, null, 2));
    return 0;
  }
  throw new Error('commands: propose | vote | show');
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`dao: ${e.message}`);
    process.exit(1);
  },
);
