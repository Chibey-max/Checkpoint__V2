/**
 * pnpm gate:testnet   (tasks D-4.1 / D-4.2 / I-4.1, CLI form of the gate run)
 *
 * Drives the gate loop on testnet through the running Guard and agents (from
 * .env, live Vault): request → offers → verdicts → basket → Guard signature →
 * owner approval → Settlement Agent → payouts → verify:audit, for AT-01 and the
 * demo basket (AT-10), then AT-05 (edits after approval) and AT-06 (replay).
 * It prints a table with nearblocks links for docs/evidence.md.
 *
 * Needs: Guard and the agents running against the Vault (GUARD_VAULT=rpc,
 * AGENTS_CHAIN=rpc); the owner's full-access key in the legacy keychain
 * (~/.near-credentials/testnet/<owner>.json) or OWNER_PRIVATE_KEY; and for the
 * "buggy Guard re-signs the edit" variant of AT-05, GUARD_SECRET_KEY.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, actions, type KeyPairString } from 'near-api-js';
import { createSettlement, rejectedTxHash, vaultErrorCode } from '@checkpoint/agents';
import { GuardSigner } from '@checkpoint/guard';
import { basketHash, decodePayload, encodePayload, viewFunction } from '@checkpoint/shared';
import { findRepoRoot, loadRootEnv } from '@checkpoint/shared/node';

loadRootEnv();
const ROOT = findRepoRoot();
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (.env)`);
  return v;
};
const RPC = env('NEAR_RPC_URL');
const VAULT = env('VAULT_ID');
const TOKEN = env('TOKEN_ID');
const AGENTS = process.env.AGENTS_URL ?? `http://localhost:${process.env.AGENTS_PORT ?? 8788}`;
const OWNER = process.env.OWNER_ID ?? `owner-demo.${VAULT.split('.').slice(1).join('.')}`;
const NB = 'https://testnet.nearblocks.io/txns/';
const DEMO_LIST =
  '2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 1 TB object storage for 1 month';
const AT01_LIST =
  '2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 10k transactional emails for 1 month';
const CPUSD = 1_000_000n;
/** GATE_ONLY=AT-05,AT-06 runs just those rows (AT-06 needs AT-01). */
const ONLY = process.env.GATE_ONLY?.split(',').map((x) => x.trim());
const want = (id: string) => !ONLY || ONLY.includes(id);

interface Row {
  id: string;
  pass: boolean;
  result: string;
  proof: string[];
}
const rows: Row[] = [];
const link = (h?: string) => (h ? `[${h.slice(0, 4)}…${h.slice(-4)}](${NB}${h})` : '');
function must(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ownerKey(): KeyPairString {
  if (process.env.OWNER_PRIVATE_KEY) return process.env.OWNER_PRIVATE_KEY as KeyPairString;
  const p = join(homedir(), '.near-credentials', 'testnet', `${OWNER}.json`);
  must(existsSync(p), `no key for ${OWNER}: set OWNER_PRIVATE_KEY or add ${p}`);
  return (JSON.parse(readFileSync(p, 'utf8')) as { private_key: KeyPairString }).private_key;
}
const owner = new Account(OWNER, RPC, ownerKey());

async function ownerCall(method: string, args: Record<string, unknown>): Promise<string> {
  const r = (await owner.signAndSendTransaction({
    receiverId: VAULT,
    actions: [actions.functionCall(method, args, 30_000_000_000_000n, 1n)],
    waitUntil: 'EXECUTED_OPTIMISTIC',
    throwOnFailure: false,
  })) as { transaction_outcome: { id: string }; status: unknown };
  const st = r.status as Record<string, unknown>;
  must(
    !('Failure' in st),
    `${method} failed: ${JSON.stringify(st.Failure)} (tx ${r.transaction_outcome.id})`,
  );
  return r.transaction_outcome.id;
}

interface View {
  state: string;
  basket?: { basket_id: string; total: string; lines: Array<{ vendor_id: string }> } | null;
  needs_ack?: string[] | null;
  signed?: {
    payload_b64: string;
    signature_b64: string;
    hash_hex: string;
    expires_at_ms: string | number;
  } | null;
  refusal?: unknown;
  settlement?: {
    tx_hash?: string;
    final_status?: string;
    payouts?: Array<{ vendor_id: string; amount: string; status: string }>;
  } | null;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${AGENTS}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
async function waitState(id: string, states: string[], ms = 120_000): Promise<View> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await api<View>(`/v1/requests/${id}`);
    if (states.includes(v.state)) return v;
    if (Date.now() > end) throw new Error(`request ${id} stuck in ${v.state}`);
    await sleep(500);
  }
}
async function signed(text: string): Promise<{ id: string; v: View; ms: number }> {
  const t0 = Date.now();
  const { request_id: id } = await api<{ request_id: string }>('/v1/requests', {
    owner_id: OWNER,
    text,
  });
  let v = await waitState(id, ['awaiting_approval', 'needs_ack', 'refused', 'final']);
  if (v.state === 'needs_ack') {
    await api(`/v1/requests/${id}/acknowledge`, { offer_ids: v.needs_ack ?? [] });
    v = await waitState(id, ['awaiting_approval', 'refused']);
  }
  must(
    v.state === 'awaiting_approval' && v.signed,
    `no signed basket: ${v.state} ${JSON.stringify(v.refusal)}`,
  );
  return { id, v, ms: Date.now() - t0 };
}
const balance = async () =>
  (await viewFunction(RPC, VAULT, 'get_balance', { owner_id: OWNER, token_id: TOKEN })) as {
    available: string;
    reserved: string;
  };
const ftBalance = async (a: string) =>
  BigInt((await viewFunction(RPC, TOKEN, 'ft_balance_of', { account_id: a })) as string);

function audit(basketId: string): string {
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(ROOT, 'scripts/verify-audit.ts'), basketId, '--agents', AGENTS],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  must(
    r.status === 0,
    `verify:audit FAIL: ${r.stdout
      .split('\n')
      .filter((l) => l.startsWith('FAIL'))
      .join('; ')}`,
  );
  return `verify:audit PASS (${(r.stdout.match(/^PASS /gm) ?? []).length} checks)`;
}

async function paidBasket(id: string, text: string): Promise<void> {
  try {
    const before = await balance();
    const s = await signed(text);
    const vendors = [...new Set(s.v.basket!.lines.map((l) => l.vendor_id))];
    const vb = await Promise.all(vendors.map(ftBalance));
    const t1 = Date.now();
    const approveTx = await ownerCall('approve_basket', {
      hash_hex: s.v.signed!.hash_hex,
      expires_at_ms: String(s.v.signed!.expires_at_ms),
    });
    const v = await waitState(s.id, ['final', 'refused', 'expired']);
    const settleMs = Date.now() - t1;
    must(v.settlement, `ended ${v.state}`);
    const st = v.settlement;
    const after = await balance();
    const va = await Promise.all(vendors.map(ftBalance));
    const paid = (st.payouts ?? [])
      .filter((p) => p.status === 'Completed')
      .reduce((a, p) => a + BigInt(p.amount), 0n);
    const delta = BigInt(before.available) - BigInt(after.available);
    must(after.reserved === '0', `reserved ${after.reserved}`);
    must(delta === paid, `owner available fell by ${delta}, but ${paid} was paid`);
    const rise = va.reduce((a, x, i) => a + (x - vb[i]!), 0n);
    must(rise === paid, `vendors received ${rise}, expected ${paid}`);
    if (id === 'AT-01') must(st.final_status === 'Completed', `final ${st.final_status}`);
    if (id === 'AT-10') {
      const failed = (st.payouts ?? []).filter((p) => p.status === 'Failed');
      must(
        st.final_status === 'PartiallyPaid' &&
          failed.length === 1 &&
          failed[0]!.vendor_id.startsWith('vendor-06.'),
        `final ${st.final_status}`,
      );
    }
    const auditMsg = audit(v.basket!.basket_id);
    rows.push({
      id,
      pass: true,
      result: `${st.final_status}: ${s.v.basket!.lines.length} lines, ${vendors.length} vendors, total ${s.v.basket!.total}; vendors +${paid}, owner −${delta}, reserved 0; signed in ${s.ms} ms, approval → final ${settleMs} ms; ${auditMsg}`,
      proof: [
        `approve ${link(approveTx)}`,
        `execute ${link(st.tx_hash)}`,
        `basket \`${v.basket!.basket_id}\``,
      ],
    });
    if (id === 'AT-01') at01 = s.v.signed!;
  } catch (e) {
    rows.push({ id, pass: false, result: (e as Error).message, proof: [] });
  }
}
let at01: NonNullable<View['signed']> | undefined;

async function main(): Promise<number> {
  const health = (await (
    await fetch(`${process.env.GUARD_URL ?? 'http://localhost:8787'}/v1/health`)
  ).json()) as {
    rules_hash_match: boolean;
    vault_policy_version: number;
  };
  must(health.rules_hash_match, 'Guard rules hash does not match the Vault');
  console.log(`Gate run on ${VAULT} (policy v${health.vault_policy_version}) for ${OWNER}\n`);

  if (want('AT-01') || want('AT-06')) await paidBasket('AT-01', AT01_LIST);
  if (want('AT-10')) await paidBasket('AT-10', DEMO_LIST);

  const settlement = createSettlement({
    rpcUrl: RPC,
    vaultId: VAULT,
    agentAccountId: env('AGENT_ACCOUNT_ID'),
    agentFcPrivateKey: env('AGENT_FC_PRIVATE_KEY'),
  });
  const reject = async (p: string, s: string): Promise<{ code: string; tx?: string }> => {
    try {
      await settlement.execute(p, s);
    } catch (e) {
      return {
        code: vaultErrorCode(e) ?? (e as Error).message,
        ...(rejectedTxHash(e) ? { tx: rejectedTxHash(e) } : {}),
      };
    }
    throw new Error('the Vault accepted it');
  };

  // AT-05: the owner approves a basket; the agents are told to stop watching it,
  // then three edits are sent instead of the approved payload.
  if (want('AT-05'))
    try {
      const s = await signed(AT01_LIST);
      await api(`/v1/requests/${s.id}/cancel`, {});
      const approveTx = await ownerCall('approve_basket', {
        hash_hex: s.v.signed!.hash_hex,
        expires_at_ms: String(s.v.signed!.expires_at_ms),
      });
      const before = await balance();
      const p = decodePayload(Buffer.from(s.v.signed!.payload_b64, 'base64'));
      const guard = process.env.GUARD_SECRET_KEY
        ? GuardSigner.fromEnv(process.env.GUARD_SECRET_KEY)
        : null;
      const resign = (q: typeof p) => {
        const bytes = encodePayload(q);
        return [
          Buffer.from(bytes).toString('base64'),
          Buffer.from(guard!.sign(basketHash(bytes))).toString('base64'),
        ] as const;
      };
      const used = new Set(p.payouts.map((x) => x.vendor_id));
      const suffix = p.payouts[0]!.vendor_id.replace(/^vendor-0\d/, '');
      const unused = ['vendor-01', 'vendor-02', 'vendor-03', 'vendor-04']
        .map((v) => v + suffix)
        .filter((v) => !used.has(v));
      must(unused.length >= 2, 'need two allowlisted vendors outside the basket');
      const out: string[] = [];
      const proofs: string[] = [`approve ${link(approveTx)}`];
      // (a) +1 cpUSD on the first payout, original signature
      const a = structuredClone(p);
      a.payouts[0]!.amount += CPUSD;
      a.total += CPUSD;
      const ra = await reject(
        Buffer.from(encodePayload(a)).toString('base64'),
        s.v.signed!.signature_b64,
      );
      must(
        ra.code === 'ERR_BAD_SIGNATURE' || ra.code === 'ERR_NO_APPROVAL',
        `+1 cpUSD: ${ra.code}`,
      );
      out.push(`+1 cpUSD → ${ra.code}`);
      proofs.push(`+1 ${link(ra.tx)}`);
      if (guard) {
        // (b) vendor swapped and (c) payout added, each re-signed as a buggy Guard would
        const b = structuredClone(p);
        b.payouts[0]!.vendor_id = unused[0]!;
        b.payouts.sort((x, y) => (x.vendor_id < y.vendor_id ? -1 : 1));
        const rb = await reject(...resign(b));
        must(rb.code === 'ERR_NO_APPROVAL' || rb.code === 'ERR_DUP_VENDOR', `swap: ${rb.code}`);
        out.push(`vendor swapped (re-signed) → ${rb.code}`);
        proofs.push(`swap ${link(rb.tx)}`);
        const c = structuredClone(p);
        c.payouts.push({
          vendor_id: unused[1]!,
          amount: CPUSD,
          line_count: 1,
        });
        c.payouts.sort((x, y) => (x.vendor_id < y.vendor_id ? -1 : 1));
        c.total += CPUSD;
        const rc = await reject(...resign(c));
        must(
          rc.code === 'ERR_NO_APPROVAL' || rc.code === 'ERR_DUP_VENDOR',
          `add payout: ${rc.code}`,
        );
        out.push(`payout added (re-signed) → ${rc.code}`);
        proofs.push(`add ${link(rc.tx)}`);
      }
      const after = await balance();
      must(
        after.available === before.available && after.reserved === before.reserved,
        'balances changed',
      );
      const revokeTx = await ownerCall('revoke_approval', { hash_hex: s.v.signed!.hash_hex });
      proofs.push(`revoke ${link(revokeTx)}`);
      rows.push({
        id: 'AT-05',
        pass: true,
        result: `${out.join('; ')}; no state change`,
        proof: proofs,
      });
    } catch (e) {
      rows.push({ id: 'AT-05', pass: false, result: (e as Error).message, proof: [] });
    }

  // AT-06: replay the paid AT-01 basket.
  if (want('AT-06'))
    try {
      must(at01, 'AT-01 did not produce a paid basket');
      const r = await reject(at01.payload_b64, at01.signature_b64);
      must(r.code === 'ERR_ALREADY_USED', r.code);
      rows.push({ id: 'AT-06', pass: true, result: `replay → ${r.code}`, proof: [link(r.tx)] });
    } catch (e) {
      rows.push({ id: 'AT-06', pass: false, result: (e as Error).message, proof: [] });
    }

  console.log('| AT | Result | Proof |\n|---|---|---|');
  for (const r of rows)
    console.log(
      `| ${r.id} | ${r.pass ? 'PASS' : '**FAIL**'}: ${r.result} | ${r.proof.join(', ')} |`,
    );
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${failed ? `${failed} FAILED` : 'GATE: ALL PASS'}`);
  return failed ? 1 : 0;
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`gate:testnet: ${e.message}`);
    process.exit(1);
  },
);
