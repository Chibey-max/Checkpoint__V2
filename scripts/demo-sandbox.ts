/**
 * pnpm demo:sandbox   (tasks D-6.1 / I-6.1, FR-DX01, handoff H13)
 *
 * The whole Checkpoint loop on a local NEAR sandbox, with no testnet account
 * and no LLM key:
 *
 *   sandbox → cpUSD + Vault deployed → owner deposits and authorises the agent
 *   → Guard and the agents started against the sandbox (isolated from .env)
 *   → demo list → offers → verdicts → basket → Guard signature
 *   → owner approval (helper; no wallet in the sandbox) → payouts → audit
 *
 * then the attacks (AT-05 edit after approval, AT-06 replay, AT-08 stolen agent
 * key, AT-10 unregistered vendor, AT-14 Guard offline) and INV-1, and prints a
 * PASS/FAIL table. Exit code 0 only if every row passes.
 *
 *   pnpm demo:sandbox            # builds the wasm first if it is missing
 *   DEMO_KEEP=1 pnpm demo:sandbox  # leave the sandbox and services running
 *   DEMO_LATENCY_RUNS=10 [DEMO_LLM=groq] pnpm demo:sandbox  # also measure NFR-07
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Account, KeyPair, type KeyPairString } from 'near-api-js';
import { createSettlement, vaultErrorCode } from '@checkpoint/agents';
import {
  basketHash,
  decodePayload,
  ed25519Sign,
  encodePayload,
  generateKeyPair,
  rulesHashHex,
  RulesConfigSchema,
  toBase58,
} from '@checkpoint/shared';
import { findRepoRoot } from '@checkpoint/shared/node';
import { startSandbox } from './lib/sandbox';

const ROOT_DIR = findRepoRoot();
const GUARD_PORT = Number(process.env.DEMO_GUARD_PORT ?? 18787);
const AGENTS_PORT = Number(process.env.DEMO_AGENTS_PORT ?? 18788);
const GUARD_URL = `http://127.0.0.1:${GUARD_PORT}`;
const AGENTS_URL = `http://127.0.0.1:${AGENTS_PORT}`;
const CPUSD = 1_000_000n;
const TGAS = 1_000_000_000_000n;
const ONE_YOCTO = 1n;
const NEAR = 10n ** 24n;

/** The demo list (PRD §7.3). Vendor-06 wins storage, so this basket ends PartiallyPaid (AT-10). */
const DEMO_LIST =
  '2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 1 TB object storage for 1 month';
/** A list vendor-06 does not win, for AT-01 (both payouts Completed). */
const AT01_LIST =
  '2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 10k transactional emails for 1 month';

interface Row {
  id: string;
  what: string;
  pass: boolean;
  detail: string;
}
const rows: Row[] = [];
function record(id: string, what: string, pass: boolean, detail: string): void {
  rows.push({ id, what, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${what}  ${detail}`);
}
async function step(id: string, what: string, fn: () => Promise<string>): Promise<void> {
  try {
    record(id, what, true, await fn());
  } catch (e) {
    record(id, what, false, (e as Error).message);
  }
}
function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- build + sandbox

function wasm(rel: string): Uint8Array {
  const p = join(ROOT_DIR, 'target/near', rel);
  if (!existsSync(p)) {
    console.log('Contract wasm missing: running pnpm contracts:build (plain cargo is enough)…');
    const r = spawnSync('bash', [join(ROOT_DIR, 'scripts/contracts-build.sh')], {
      stdio: 'inherit',
      cwd: ROOT_DIR,
    });
    if (r.status !== 0)
      throw new Error(
        'contracts:build failed. Install Rust and run: rustup target add wasm32-unknown-unknown',
      );
  }
  return new Uint8Array(readFileSync(p));
}

class Chain {
  constructor(
    readonly rpcUrl: string,
    readonly rootId: string,
    private readonly keys: Map<string, KeyPairString>,
  ) {}
  id(prefix: string): string {
    return `${prefix}.${this.rootId}`;
  }
  account(id: string, key?: KeyPairString): Account {
    const k = key ?? this.keys.get(id);
    must(k, `no key for ${id}`);
    return new Account(id, this.rpcUrl, k);
  }
  async create(prefix: string, near: bigint): Promise<string> {
    const id = this.id(prefix);
    const kp = KeyPair.fromRandom('ed25519');
    await this.account(this.rootId).createSubAccount({
      accountOrPrefix: id,
      publicKey: kp.getPublicKey(),
      nearToTransfer: near,
    });
    this.keys.set(id, kp.toString());
    return id;
  }
  key(id: string): KeyPairString {
    const k = this.keys.get(id);
    must(k, `no key for ${id}`);
    return k;
  }
  async call(
    signer: string,
    contract: string,
    method: string,
    args: Record<string, unknown>,
    deposit = 0n,
    gas = 100n * TGAS,
  ): Promise<unknown> {
    return this.account(signer).callFunction({
      contractId: contract,
      methodName: method,
      args,
      deposit,
      gas,
    });
  }
  async view<T>(contract: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.account(this.rootId).provider.callFunction({
      contractId: contract,
      method,
      args,
    })) as T;
  }
}

// ---------------------------------------------------------------- services

const children: ChildProcess[] = [];
function startService(
  name: string,
  entry: string,
  env: Record<string, string>,
  logDir: string,
): ChildProcess {
  const log = join(logDir, `${name}.log`);
  writeFileSync(log, '');
  const child = spawn(process.execPath, ['--import', 'tsx', join(ROOT_DIR, entry)], {
    cwd: ROOT_DIR,
    env: { ...pickBaseEnv(), CHECKPOINT_NO_DOTENV: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const append = (b: Buffer) => writeFileSync(log, b, { flag: 'a' });
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  children.push(child);
  return child;
}
/** Only what Node and pnpm need from the parent environment: nothing from .env leaks in. */
function pickBaseEnv(): Record<string, string> {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'NODE_OPTIONS', 'SystemRoot'];
  return Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]!]));
}
function stopService(child: ChildProcess): void {
  if (child.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}
async function waitHttp(url: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`${url} did not come up within ${ms} ms`);
}

// ---------------------------------------------------------------- agents API

interface RequestView {
  state: string;
  basket?: {
    basket_id: string;
    total: string;
    lines: Array<{ vendor_id: string; offer_id: string }>;
  } | null;
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
    payouts?: Array<{ vendor_id: string; status: string }>;
  } | null;
  errors?: Array<{ code?: string; message?: string }>;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${AGENTS_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}
async function waitState(id: string, states: string[], ms = 60_000): Promise<RequestView> {
  const end = Date.now() + ms;
  let v: RequestView;
  do {
    v = await api<RequestView>(`/v1/requests/${id}`);
    if (states.includes(v.state)) return v;
    await sleep(300);
  } while (Date.now() < end);
  throw new Error(`request ${id} stuck in ${v.state} (wanted ${states.join('|')})`);
}
/** Create a request and drive it to a signed basket, acknowledging REVIEW lines like the owner would. */
async function signedBasket(
  owner: string,
  text: string,
): Promise<{ id: string; view: RequestView; ms: number }> {
  const t0 = Date.now();
  const { request_id: id } = await api<{ request_id: string }>('/v1/requests', {
    owner_id: owner,
    text,
  });
  let v = await waitState(id, ['awaiting_approval', 'needs_ack', 'refused', 'final']);
  if (v.state === 'needs_ack') {
    await api(`/v1/requests/${id}/acknowledge`, { offer_ids: v.needs_ack ?? [] });
    v = await waitState(id, ['awaiting_approval', 'refused']);
  }
  must(
    v.state === 'awaiting_approval' && v.signed,
    `no signed basket (state ${v.state}, refusal ${JSON.stringify(v.refusal)})`,
  );
  return { id, view: v, ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- main

async function main(): Promise<number> {
  const work = mkdtempSync(join(tmpdir(), 'checkpoint-demo-'));
  console.log(`Checkpoint sandbox demo  (logs: ${work})\n`);

  const vaultWasm = wasm('vault/checkpoint_vault.wasm');
  const tokenWasm = wasm('cpusd/checkpoint_cpusd.wasm');

  const sandbox = await startSandbox();
  const rpcUrl = sandbox.rpcUrl;
  const chain = new Chain(
    rpcUrl,
    sandbox.rootId,
    new Map([[sandbox.rootId, sandbox.rootKey as KeyPairString]]),
  );

  let guard: ChildProcess | undefined;
  try {
    // ---- accounts and contracts
    const token = await chain.create('cpusd', 10n * NEAR);
    const vault = await chain.create('vault', 20n * NEAR);
    const owner = await chain.create('owner-demo', 10n * NEAR);
    const agent = await chain.create('agent', 5n * NEAR);
    const dao = await chain.create('dao', 5n * NEAR); // plain account standing in for the DAO
    const guardian = await chain.create('guardian', 2n * NEAR);
    const vendors: string[] = [];
    for (let i = 1; i <= 6; i++) vendors.push(await chain.create(`vendor-0${i}`, NEAR));

    await chain.account(token).deployContract(tokenWasm);
    await chain.call(token, token, 'new', { owner_id: token });
    // vendor-06 is deliberately not registered on cpUSD (AT-10).
    for (const a of [vault, owner, ...vendors.slice(0, 5)]) {
      await chain.call(
        chain.rootId,
        token,
        'storage_deposit',
        { account_id: a, registration_only: true },
        1_250_000_000_000_000_000_000n,
      );
    }
    await chain.call(token, token, 'mint', { account_id: owner, amount: String(1_000n * CPUSD) });

    const rules = RulesConfigSchema.parse(
      JSON.parse(readFileSync(join(ROOT_DIR, 'config/rules.config.json'), 'utf8')),
    );
    const guardKey = generateKeyPair();
    await chain.account(vault).deployContract(vaultWasm);
    await chain.call(vault, vault, 'new', {
      config: {
        network_id: 'sandbox',
        tokens: [token],
        // vendor-05 is deliberately not allowlisted (AT-04).
        vendors: [vendors[0], vendors[1], vendors[2], vendors[3], vendors[5]],
        max_basket_total: String(500n * CPUSD),
        daily_cap: String(1_000n * CPUSD),
        max_vendors: 4,
        max_ttl_ms: '1800000',
        rules_hash: rulesHashHex(rules),
        guard_pubkey: toBase58(guardKey.publicKey),
        guard_key_version: 1,
        guardian,
        dao_id: dao,
      },
    });
    await chain.call(
      owner,
      token,
      'ft_transfer_call',
      { receiver_id: vault, amount: String(500n * CPUSD), msg: '' },
      ONE_YOCTO,
    );
    await chain.call(owner, vault, 'set_agent', { agent_id: agent, enabled: true }, ONE_YOCTO);

    // The Settlement Agent's function-call key: Vault, execute_basket only, 1 NEAR allowance.
    const fcKey = KeyPair.fromRandom('ed25519');
    await chain.account(agent).addFunctionCallAccessKey({
      publicKey: fcKey.getPublicKey(),
      contractId: vault,
      methodNames: ['execute_basket'],
      allowance: NEAR,
    });
    record(
      'SETUP',
      'sandbox, cpUSD, Vault, owner deposit 500 cpUSD, agent FC key',
      true,
      `${rpcUrl}  vault ${vault}`,
    );

    // ---- the snapshot, with stand-in vendor IDs moved to this sandbox's root account
    const snapDir = join(work, 'snapshot');
    cpSync(join(ROOT_DIR, 'data/snapshot'), snapDir, { recursive: true });
    const assessNow = rewriteSnapshot(snapDir, '.cpdemo.testnet', `.${chain.rootId}`);

    // ---- Guard and the agents, isolated from .env
    const common = {
      NEAR_NETWORK: 'sandbox',
      NEAR_RPC_URL: rpcUrl,
      VAULT_ID: vault,
      TOKEN_ID: token,
      EVIDENCE_DIR: snapDir,
      // DEMO_LLM=groq (with GROQ_API_KEY in the environment) turns the LLM on, e.g. for NFR-07.
      ...(process.env.DEMO_LLM === 'groq' && process.env.GROQ_API_KEY
        ? { LLM_PROVIDER: 'groq', GROQ_API_KEY: process.env.GROQ_API_KEY }
        : { LLM_PROVIDER: 'none' }),
    };
    const guardEnv = {
      ...common,
      GUARD_PORT: String(GUARD_PORT),
      GUARD_VAULT: 'rpc',
      GUARD_SECRET_KEY: toBase58(guardKey.seed),
      GUARD_KEY_VERSION: '1',
      GUARD_ASSESS_NOW: assessNow,
    };
    guard = startService('guard', 'packages/guard/src/main.ts', guardEnv, work);
    startService(
      'agents',
      'packages/agents/src/main.ts',
      {
        ...common,
        AGENTS_PORT: String(AGENTS_PORT),
        AGENTS_CHAIN: 'rpc',
        AGENTS_DB_PATH: ':memory:',
        GUARD_URL,
        AGENT_ACCOUNT_ID: agent,
        AGENT_FC_PRIVATE_KEY: fcKey.toString(),
      },
      work,
    );
    await waitHttp(`${GUARD_URL}/v1/health`);
    await waitHttp(`${AGENTS_URL}/v1/health`);
    const health = (await (await fetch(`${GUARD_URL}/v1/health`)).json()) as {
      rules_hash_match: boolean;
    };
    record(
      'GUARD',
      'Guard starts against the sandbox Vault, rules hash matches',
      health.rules_hash_match,
      JSON.stringify(health),
    );

    const approve = async (v: RequestView) => {
      const s = v.signed!;
      await chain.call(
        owner,
        vault,
        'approve_basket',
        { hash_hex: s.hash_hex, expires_at_ms: String(s.expires_at_ms) },
        ONE_YOCTO,
        30n * TGAS,
      );
    };
    const balance = async () =>
      chain.view<{ available: string; reserved: string }>(vault, 'get_balance', {
        owner_id: owner,
        token_id: token,
      });

    // ---- demo request: list → … → payouts (AT-10 inside: vendor-06 unregistered)
    let demo: { id: string; view: RequestView; ms: number } | undefined;
    await step('DEMO', 'demo list → offers → verdicts → basket → Guard signature', async () => {
      demo = await signedBasket(owner, DEMO_LIST);
      const b = demo.view.basket!;
      return `${b.lines.length} lines, total ${b.total}, signed in ${demo.ms} ms (NFR-07 ≤ 3 s without LLM)`;
    });
    await step('APPROVE', 'owner approves (1 yocto), agent executes with its FC key', async () => {
      must(demo, 'no demo basket');
      await approve(demo.view);
      const v = await waitState(demo.id, ['final', 'refused', 'expired']);
      must(v.state === 'final', `ended ${v.state}`);
      demo.view = v;
      return `final ${v.settlement?.final_status}, tx ${v.settlement?.tx_hash}`;
    });
    await step(
      'AT-10',
      'unregistered vendor: PartiallyPaid, its amount restored once',
      async () => {
        must(demo?.view.settlement, 'no settlement');
        const s = demo.view.settlement;
        const failed =
          s.payouts?.filter((p) => p.status === 'Failed').map((p) => p.vendor_id) ?? [];
        must(
          s.final_status === 'PartiallyPaid' && failed.length === 1 && failed[0] === vendors[5],
          `got ${s.final_status}, failed ${failed}`,
        );
        const b = await balance();
        must(b.reserved === '0', `reserved ${b.reserved}`);
        return `vendor-06 Failed, others Completed; owner available ${b.available}, reserved 0`;
      },
    );
    await step('AUDIT', 'pnpm verify:audit on the demo basket', async () => {
      must(demo?.view.basket, 'no basket');
      const r = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          join(ROOT_DIR, 'scripts/verify-audit.ts'),
          demo.view.basket.basket_id,
          '--agents',
          AGENTS_URL,
          '--rpc',
          rpcUrl,
          '--vault',
          vault,
        ],
        { cwd: ROOT_DIR, env: { ...pickBaseEnv(), CHECKPOINT_NO_DOTENV: '1' }, encoding: 'utf8' },
      );
      writeFileSync(join(work, 'verify-audit.log'), r.stdout + r.stderr);
      const checks = (r.stdout.match(/^PASS /gm) ?? []).length;
      must(
        r.status === 0,
        `exit ${r.status}: ${r.stdout
          .split('\n')
          .filter((l) => l.startsWith('FAIL'))
          .join('; ')}`,
      );
      return `PASS (${checks} checks)`;
    });

    // ---- D-6.2 (P2): NEAR Intents dry quote for the demo basket. Advisory and
    // external (mainnet 1Click), so being offline is reported but not a failure.
    await step('INTENTS', 'NEAR Intents dry quote for the basket (display-only)', async () => {
      const res = await fetch(`${AGENTS_URL}/v1/requests/${demo!.id}/intents-quote`);
      const j = (await res.json()) as {
        code?: string;
        message?: string;
        quote?: { pay_amount_formatted: string; receive_amount_formatted: string; dry: boolean };
      };
      if (res.status === 503) return `skipped: 1Click unreachable (${j.message})`;
      must(res.ok && j.quote?.dry === true, `HTTP ${res.status} ${j.code ?? ''}`);
      return `pay ≈ ${Number(j.quote.pay_amount_formatted).toFixed(4)} wNEAR → ${j.quote.receive_amount_formatted} USDC (dry, mainnet)`;
    });

    // ---- AT-01: a basket vendor-06 does not win → every payout Completed
    await step('AT-01', 'happy path: every payout Completed', async () => {
      const r = await signedBasket(owner, AT01_LIST);
      const before = await chain.view<string>(token, 'ft_balance_of', {
        account_id: r.view.basket!.lines[0]!.vendor_id,
      });
      await approve(r.view);
      const v = await waitState(r.id, ['final', 'refused', 'expired']);
      must(
        v.settlement?.final_status === 'Completed',
        `ended ${v.state} ${v.settlement?.final_status}`,
      );
      const after = await chain.view<string>(token, 'ft_balance_of', {
        account_id: r.view.basket!.lines[0]!.vendor_id,
      });
      must(BigInt(after) > BigInt(before), 'vendor balance did not rise');
      const vendorsPaid = new Set(v.settlement.payouts?.map((p) => p.vendor_id)).size;
      return `Completed: ${r.view.basket!.lines.length} lines, ${vendorsPaid} vendor(s) paid`;
    });

    const settlement = createSettlement({
      rpcUrl,
      vaultId: vault,
      agentAccountId: agent,
      agentFcPrivateKey: fcKey.toString(),
    });
    const rejects = async (payloadB64: string, signatureB64: string): Promise<string> => {
      try {
        await settlement.execute(payloadB64, signatureB64);
      } catch (e) {
        return vaultErrorCode(e) ?? (e as Error).message;
      }
      throw new Error('the Vault accepted it');
    };

    // ---- AT-05: the basket is edited after the owner approved it
    await step('AT-05', 'edit after approval (amount raised)', async () => {
      const r = await signedBasket(owner, AT01_LIST);
      await approve(r.view);
      await api(`/v1/requests/${r.id}/cancel`, {}).catch(() => undefined);
      const p = decodePayload(Buffer.from(r.view.signed!.payload_b64, 'base64'));
      p.payouts[0]!.amount += CPUSD;
      p.total += CPUSD;
      const code = await rejects(
        Buffer.from(encodePayload(p)).toString('base64'),
        r.view.signed!.signature_b64,
      );
      must(code === 'ERR_BAD_SIGNATURE' || code === 'ERR_NO_APPROVAL', code);
      return code;
    });

    // ---- AT-06: replay of the paid demo basket
    await step('AT-06', 'replay of a paid basket', async () => {
      const s = demo!.view.signed!;
      const code = await rejects(s.payload_b64, s.signature_b64);
      must(code === 'ERR_ALREADY_USED', code);
      return code;
    });

    // ---- AT-08: the agent key is stolen
    await step('AT-08', 'stolen agent key: self-paying basket and other methods', async () => {
      const p = decodePayload(Buffer.from(demo!.view.signed!.payload_b64, 'base64'));
      p.basket_id = '00000000-0000-4000-8000-000000000008';
      p.payouts = [{ vendor_id: agent, amount: 100n * CPUSD, line_count: 1 }];
      p.total = 100n * CPUSD;
      const bytes = encodePayload(p);
      const forged = generateKeyPair(); // the attacker has no Guard key
      const sig = ed25519Sign(basketHash(bytes), forged.seed);
      const code = await rejects(
        Buffer.from(bytes).toString('base64'),
        Buffer.from(sig).toString('base64'),
      );
      must(code === 'ERR_BAD_SIGNATURE', `execute_basket: ${code}`);
      const thief = chain.account(agent, fcKey.toString());
      let other = 'accepted';
      try {
        await thief.callFunction({
          contractId: vault,
          methodName: 'withdraw',
          args: { token_id: token, amount: '1' },
          deposit: ONE_YOCTO,
          gas: 50n * TGAS,
        });
      } catch (e) {
        other = (e as Error).message.slice(0, 60);
      }
      must(other !== 'accepted', 'the FC key could call withdraw');
      return `execute_basket ${code}; withdraw refused by the access key`;
    });

    // ---- NFR-07: request → signed basket latency over N runs (DEMO_LATENCY_RUNS=10)
    const runs = Number(process.env.DEMO_LATENCY_RUNS ?? 0);
    if (runs > 0) {
      const llm = process.env.DEMO_LLM === 'groq' && Boolean(process.env.GROQ_API_KEY);
      await step(
        'NFR-07',
        `request → signed basket, ${runs} runs, LLM ${llm ? 'on' : 'off'}`,
        async () => {
          const ms: number[] = [];
          for (let i = 0; i < runs; i++) {
            const r = await signedBasket(owner, DEMO_LIST);
            ms.push(r.ms);
            await api(`/v1/requests/${r.id}/cancel`, {}).catch(() => undefined);
          }
          ms.sort((a, b) => a - b);
          const limit = llm ? 20_000 : 3_000;
          const median = ms[Math.floor(ms.length / 2)]!;
          must(ms[ms.length - 1]! <= limit, `max ${ms[ms.length - 1]} ms > ${limit} ms`);
          return `min ${ms[0]} / median ${median} / max ${ms[ms.length - 1]} ms (limit ${limit} ms)`;
        },
      );
    }

    // ---- AT-14: Guard offline → no signature; withdrawals still work
    await step('AT-14', 'Guard offline: no new signature, withdraw still works', async () => {
      stopService(guard!);
      await sleep(500);
      const { request_id: id } = await api<{ request_id: string }>('/v1/requests', {
        owner_id: owner,
        text: AT01_LIST,
      });
      const end = Date.now() + 20_000;
      let v: RequestView;
      do {
        v = await api<RequestView>(`/v1/requests/${id}`);
        if (v.state === 'refused' || (v.errors?.length ?? 0) > 0) break;
        await sleep(300);
      } while (Date.now() < end);
      must(!v.signed, 'a basket was signed with Guard down');
      must(
        v.state === 'refused' || (v.errors?.length ?? 0) > 0,
        `no error reported (state ${v.state})`,
      );
      const before = BigInt((await balance()).available);
      await chain.call(
        owner,
        vault,
        'withdraw',
        { token_id: token, amount: String(CPUSD) },
        ONE_YOCTO,
        100n * TGAS,
      );
      const after = BigInt((await balance()).available);
      must(before - after === CPUSD, `available ${before} → ${after}`);
      const err = v.errors?.[0];
      return `request ${v.state}${err ? ` (${err.code ?? err.message})` : ''}; withdrew 1 cpUSD`;
    });

    // ---- INV-1 at the end
    await step('INV-1', 'Vault token balance ≥ liabilities = Σ owner balances', async () => {
      const liab = BigInt(await chain.view<string>(vault, 'get_liabilities', { token_id: token }));
      const b = await chain.view<{ available: string; reserved: string; withdrawing: string }>(
        vault,
        'get_balance',
        { owner_id: owner, token_id: token },
      );
      const sum = BigInt(b.available) + BigInt(b.reserved) + BigInt(b.withdrawing);
      const held = BigInt(await chain.view<string>(token, 'ft_balance_of', { account_id: vault }));
      must(liab === sum && held >= liab, `liabilities ${liab}, Σ ${sum}, held ${held}`);
      return `held ${held} ≥ liabilities ${liab} = Σ ${sum}`;
    });
  } catch (e) {
    record('ERROR', 'demo aborted', false, (e as Error).stack ?? String(e));
  } finally {
    if (!process.env.DEMO_KEEP) {
      for (const c of children) stopService(c);
      await sandbox.stop().catch(() => undefined);
    }
  }

  const failed = rows.filter((r) => !r.pass);
  console.log('\n| Check | What | Result | Detail |\n|---|---|---|---|');
  for (const r of rows)
    console.log(
      `| ${r.id} | ${r.what} | ${r.pass ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '/').split('\n')[0]} |`,
    );
  console.log(`\n${failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`}  (logs: ${work})`);
  return failed.length === 0 ? 0 : 1;
}

/**
 * Copy of the snapshot with the stand-in vendor account suffix replaced, so the
 * same offers point at this sandbox's vendor accounts. Returns an assessment
 * time one day after the newest capture, so STALE (R-02) never depends on today.
 */
function rewriteSnapshot(dir: string, from: string, to: string): string {
  let newest = 0;
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.json')) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/"captured_at"\s*:\s*"([^"]+)"/g))
          newest = Math.max(newest, Date.parse(m[1]!));
        writeFileSync(p, text.split(from).join(to));
      }
    }
  };
  walk(dir);
  return new Date((newest || Date.now()) + 86_400_000).toISOString();
}

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`demo:sandbox: ${e.stack ?? e.message}`);
    process.exit(1);
  },
);
