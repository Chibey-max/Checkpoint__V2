/**
 * Shared helpers for the testnet attack scripts (task I-5.2, handoff H12).
 * They read .env (NEAR_RPC_URL, VAULT_ID, TOKEN_ID, AGENT_*, GUARD_SECRET_KEY)
 * and sign as test accounts from the legacy keychain (~/.near-credentials/testnet).
 * Every on-chain attempt is sent with throwOnFailure: false, so rejected calls
 * still have a transaction hash for docs/evidence.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Account, actions, type KeyPairString } from 'near-api-js';
import { GuardSigner } from '@checkpoint/guard';
import {
  basketHash,
  encodePayload,
  fromHex,
  toHex,
  VaultPolicyViewSchema,
  viewFunction,
  type BasketPayloadV1,
} from '@checkpoint/shared';
import { loadRootEnv } from '@checkpoint/shared/node';

loadRootEnv();
export const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (.env)`);
  return v;
};
export const RPC = env('NEAR_RPC_URL');
export const VAULT = env('VAULT_ID');
export const TOKEN = env('TOKEN_ID');
export const ROOT = VAULT.split('.').slice(1).join('.');
export const OWNER = process.env.OWNER_ID ?? `owner-demo.${ROOT}`;
export const AGENT = env('AGENT_ACCOUNT_ID');
export const CPUSD = 1_000_000n;
export const TGAS = 1_000_000_000_000n;
const NB = 'https://testnet.nearblocks.io/txns/';
export const link = (h?: string) =>
  h ? `[${h.slice(0, 4)}…${h.slice(-4)}](${NB}${h})` : '(no tx: refused before broadcast)';

export function keychain(accountId: string): KeyPairString {
  const p = join(homedir(), '.near-credentials', 'testnet', `${accountId}.json`);
  if (!existsSync(p)) throw new Error(`no key for ${accountId} in ${p}`);
  return (JSON.parse(readFileSync(p, 'utf8')) as { private_key: KeyPairString }).private_key;
}
export const accountOf = (id: string, key?: KeyPairString) =>
  new Account(id, RPC, key ?? keychain(id));

export interface Outcome {
  ok: boolean;
  tx?: string;
  error: string;
}
/** Send one function call; never throws for a contract or access-key rejection. */
export async function send(
  signer: Account,
  receiver: string,
  method: string,
  args: Record<string, unknown>,
  deposit = 0n,
  gas = 100n * TGAS,
): Promise<Outcome> {
  // Retries a send that never reached the network (flaky links); a rejected
  // transaction is final. Re-sending an approval or a failing call is harmless.
  for (let attempt = 0; ; attempt++) {
    const o = await sendOnce(signer, receiver, method, args, deposit, gas);
    if (o.tx || !/fetch failed|timed? ?out|ECONN|socket|network/i.test(o.error) || attempt >= 3)
      return o;
    await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)));
  }
}

async function sendOnce(
  signer: Account,
  receiver: string,
  method: string,
  args: Record<string, unknown>,
  deposit: bigint,
  gas: bigint,
): Promise<Outcome> {
  try {
    const r = (await signer.signAndSendTransaction({
      receiverId: receiver,
      actions: [actions.functionCall(method, args, gas, deposit)],
      waitUntil: 'EXECUTED_OPTIMISTIC',
      throwOnFailure: false,
    })) as { transaction_outcome: { id: string }; status: Record<string, unknown> };
    const failure = 'Failure' in r.status ? JSON.stringify(r.status.Failure) : '';
    return { ok: !failure, tx: r.transaction_outcome.id, error: failure };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
export const errCode = (o: Outcome) => /ERR_[A-Z_]+/.exec(o.error)?.[0] ?? o.error.slice(0, 120);

export async function policy() {
  return VaultPolicyViewSchema.parse(await viewFunction(RPC, VAULT, 'get_policy', {}));
}
export async function balance() {
  return (await viewFunction(RPC, VAULT, 'get_balance', { owner_id: OWNER, token_id: TOKEN })) as {
    available: string;
    reserved: string;
    withdrawing: string;
  };
}

/** A payload for OWNER/AGENT on the live policy; `edit` changes it before encoding. */
export async function payload(
  payouts: Array<[string, bigint]>,
  edit: (p: BasketPayloadV1) => void = () => {},
): Promise<BasketPayloadV1> {
  const pol = await policy();
  const now = BigInt(Date.now());
  const ps = payouts
    .map(([v, amount]) => ({
      vendor_id: v.includes('.') ? v : `${v}.${ROOT}`,
      amount,
      line_count: 1,
    }))
    .sort((a, b) => (a.vendor_id < b.vendor_id ? -1 : 1));
  const p: BasketPayloadV1 = {
    schema_version: 1,
    network_id: pol.network_id,
    vault_id: VAULT,
    policy_version: pol.policy_version,
    rules_hash: fromHex(pol.rules_hash),
    guard_key_version: pol.guard_key_version,
    basket_id: randomUUID(),
    owner_id: OWNER,
    agent_id: AGENT,
    token_id: TOKEN,
    payouts: ps,
    total: ps.reduce((a, x) => a + x.amount, 0n),
    evidence_hash: new Uint8Array(32),
    nonce: BigInt('0x' + randomBytes(8).toString('hex')),
    created_at_ms: now,
    expires_at_ms: now + 15n * 60_000n,
  };
  edit(p);
  return p;
}

export interface Signed {
  payload_b64: string;
  signature_b64: string;
  hash_hex: string;
}
/** Sign with the real Guard key (GUARD_SECRET_KEY): what a buggy Guard would do. */
export function guardSign(p: BasketPayloadV1): Signed {
  const signer = GuardSigner.fromEnv(process.env.GUARD_SECRET_KEY);
  const bytes = encodePayload(p, { strict: false });
  const h = basketHash(bytes);
  return {
    payload_b64: Buffer.from(bytes).toString('base64'),
    signature_b64: Buffer.from(signer.sign(h)).toString('base64'),
    hash_hex: toHex(h),
  };
}

export async function approve(s: Signed, ttlMs = 20 * 60_000): Promise<Outcome> {
  return send(
    accountOf(OWNER),
    VAULT,
    'approve_basket',
    {
      hash_hex: s.hash_hex,
      expires_at_ms: String(Date.now() + ttlMs),
    },
    1n,
    30n * TGAS,
  );
}

/** execute_basket with the Settlement Agent's function-call key. */
export async function execute(s: Signed, opts: { deposit?: bigint } = {}): Promise<Outcome> {
  const agent = accountOf(AGENT, env('AGENT_FC_PRIVATE_KEY') as KeyPairString);
  return send(
    agent,
    VAULT,
    'execute_basket',
    { payload_b64: s.payload_b64, signature_b64: s.signature_b64 },
    opts.deposit ?? 0n,
    300n * TGAS,
  );
}

export interface Row {
  id: string;
  what: string;
  pass: boolean;
  result: string;
  proof: string;
}
export function report(title: string, rows: Row[]): number {
  console.log(`\n${title}\n\n| AT | Attempt | Result | Proof |\n|---|---|---|---|`);
  for (const r of rows)
    console.log(
      `| ${r.id} | ${r.what} | ${r.pass ? 'PASS' : '**FAIL**'}: ${r.result} | ${r.proof} |`,
    );
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASS'}`);
  return failed ? 1 : 0;
}
