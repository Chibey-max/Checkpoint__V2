import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RULES_CONFIG,
  basketHashHex,
  decodePayload,
  fromBase64,
  keyPairFromSeed,
  rulesHashHex,
  verifyBasketSignature,
  fromHex,
  toBase58,
  type SignBasketRequest,
} from '@checkpoint/shared';
import { loadSnapshotOrThrow } from '@checkpoint/shared/node';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGuardApp, createLogger, GuardService, GuardSigner, MockVaultViews } from '../src';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SNAP = loadSnapshotOrThrow(`${ROOT}data/fixtures/dev-snapshot`);
const NOW = Date.parse('2026-11-06T00:00:00Z');
const RULES_HASH = rulesHashHex(DEFAULT_RULES_CONFIG);
const SEED = new Uint8Array(32).fill(9);
const OWNER = 'owner-demo.cpdemo.testnet';
const AGENT = 'agent.cpdemo.testnet';
const TOKEN = 'cpusd.cpdemo.testnet';
const REQ_ID = '11111111-1111-4111-8111-111111111111';
const BASKET_ID = '22222222-2222-4222-8222-222222222222';
const EVIDENCE = 'ab'.repeat(32);

function setup(
  opts: {
    dev?: boolean;
    logLines?: string[];
    rateLimit?: { limit: number; windowMs: number };
  } = {},
) {
  const signer = new GuardSigner(keyPairFromSeed(SEED));
  const vault = new MockVaultViews({
    now: () => NOW,
    policy: {
      rules_hash: RULES_HASH,
      guard_pubkey: signer.publicKeyB58,
      guard_key_version: 1,
      max_ttl_ms: 1_800_000,
    },
  });
  const logger = createLogger({
    secrets: signer.secretForms,
    write: (l) => opts.logLines?.push(l),
  });
  const service = new GuardService({
    rules: DEFAULT_RULES_CONFIG,
    rulesHash: RULES_HASH,
    catalog: SNAP.catalog,
    offers: SNAP.offers,
    vault,
    signer,
    networkId: 'testnet',
    vaultId: 'vault.cpdemo.testnet',
    guardKeyVersion: 1,
    dev: opts.dev ?? false,
    now: () => NOW,
    randomNonce: () => 42n,
    logger,
  });
  const app = createGuardApp(service, { logger, rateLimit: opts.rateLimit ?? false });
  return { app, vault, signer, service };
}

const post = (app: ReturnType<typeof setup>['app'], path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

const demoLines = [
  { item_key: 'vps-2c4g-month', offer_id: 'vps-b', qty: 2 },
  { item_key: 'domain-com-year', offer_id: 'dom-f', qty: 1 },
  { item_key: 'storage-1tb-month', offer_id: 'sto-d', qty: 1 },
];

function signReq(over: Partial<SignBasketRequest> = {}): SignBasketRequest {
  return {
    request_id: REQ_ID,
    basket_id: BASKET_ID,
    owner_id: OWNER,
    agent_id: AGENT,
    token_id: TOKEN,
    lines: demoLines,
    acknowledged_offer_ids: [],
    evidence_hash: EVIDENCE,
    ...over,
  };
}

describe('GET /v1/health and /v1/policy', () => {
  it('health is ok when the Vault agrees with Guard', async () => {
    const res = await setup().app.request('/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      rpc_ok: true,
      vault_policy_version: 1,
      rules_hash_match: true,
    });
  });

  it('policy publishes the public key and rules hash, never the secret', async () => {
    const { app, signer } = setup();
    const body = await (await app.request('/v1/policy')).json();
    expect(body.guard_pubkey_b58).toBe(signer.publicKeyB58);
    expect(body.rules_hash).toBe(RULES_HASH);
    expect(JSON.stringify(body)).not.toContain(toBase58(SEED));
  });
});

describe('POST /v1/assess', () => {
  it('rejects any caller-supplied price field with 400 (FR-R02)', async () => {
    const res = await post(setup().app, '/v1/assess', {
      offer_ids: ['vps-a'],
      price_total_micro_usd: 1,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PRICE_FIELD_REJECTED');
  });

  it('rejects unknown offer IDs with 400', async () => {
    const res = await post(setup().app, '/v1/assess', { offer_ids: ['nope'] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('UNKNOWN_OFFER');
  });

  it('returns verdicts, medians and assessed_at', async () => {
    const res = await post(setup().app, '/v1/assess', { offer_ids: ['vps-d', 'vps-b'] });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(
      body.verdicts.map((v: { offer_id: string; level: string }) => [v.offer_id, v.level]),
    ).toEqual([
      ['vps-d', 'BLOCK'],
      ['vps-b', 'ALLOW'],
    ]);
    expect(body.medians['vps-2c4g-month']).toBe('12000000');
  });

  it('CLI and HTTP return identical findings for the same input (FR-R03)', async () => {
    const http = await (
      await post(setup().app, '/v1/assess', { offer_ids: SNAP.offers.map((o) => o.offer_id) })
    ).json();
    const out = execFileSync(
      'node',
      [
        '--import',
        'tsx',
        'packages/guard/src/cli.ts',
        'assess',
        '--snapshot',
        'data/fixtures/dev-snapshot',
        '--now',
        '2026-11-06T00:00:00Z',
        '--json',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const cli = JSON.parse(out);
    expect(cli.verdicts).toEqual(http.verdicts);
    expect(cli.medians).toEqual(http.medians);
  });
});

describe('POST /v1/sign-basket', () => {
  it('signs the exact basket: amounts rebuilt from offers, payouts sorted, signature verifies', async () => {
    const { app, signer } = setup();
    const res = await post(app, '/v1/sign-basket', signReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const bytes = fromBase64(body.payload_b64);
    const p = decodePayload(bytes);
    expect(basketHashHex(bytes)).toBe(body.hash_hex);
    expect(
      verifyBasketSignature(
        fromBase64(body.signature_b64),
        fromHex(body.hash_hex),
        signer.publicKey,
      ),
    ).toBe(true);
    // 2 × 11.50 + 9.99 + 5.99 = 38.98 cpUSD
    expect(p.total).toBe(38_980_000n);
    expect(p.payouts.map((x) => [x.vendor_id, x.amount])).toEqual([
      ['vendor-02.cpdemo.testnet', 23_000_000n],
      ['vendor-04.cpdemo.testnet', 5_990_000n],
      ['vendor-06.cpdemo.testnet', 9_990_000n],
    ]);
    expect(p.basket_id).toBe(BASKET_ID);
    expect(p.policy_version).toBe(1);
    expect(p.evidence_hash).toEqual(fromHex(EVIDENCE));
    expect(p.expires_at_ms - p.created_at_ms).toBe(900_000n); // 15 min ≤ 30 min max TTL
    expect(body.total).toBe('38980000');
  });

  it('rejects amounts or prices in the request (never trusts caller amounts)', async () => {
    const lines = [{ ...demoLines[0], amount: '1' }];
    const res = await post(setup().app, '/v1/sign-basket', { ...signReq(), lines });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PRICE_FIELD_REJECTED');
  });

  it('BLOCK line → 422 with findings, no signature (AT-03)', async () => {
    const res = await post(
      setup().app,
      '/v1/sign-basket',
      signReq({ lines: [{ item_key: 'vps-2c4g-month', offer_id: 'vps-d', qty: 1 }] }),
    );
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe('GUARD_REFUSED');
    expect(body.findings.map((f: { rule_id: string }) => f.rule_id)).toContain('R-05');
    expect(body.signature_b64).toBeUndefined();
  });

  it('unlisted vendor → 422 R-04 (AT-04)', async () => {
    const res = await post(
      setup().app,
      '/v1/sign-basket',
      signReq({ lines: [{ item_key: 'vps-2c4g-month', offer_id: 'vps-e', qty: 1 }] }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).findings.map((f: { rule_id: string }) => f.rule_id)).toContain(
      'R-04',
    );
  });

  it('unacknowledged REVIEW → 422 R-24; acknowledged → 200 with the review findings', async () => {
    const lines = [{ item_key: 'storage-1tb-month', offer_id: 'sto-b', qty: 1 }];
    const { app } = setup();
    const refused = await post(app, '/v1/sign-basket', signReq({ lines }));
    expect(refused.status).toBe(422);
    expect((await refused.json()).findings.map((f: { rule_id: string }) => f.rule_id)).toEqual([
      'R-24',
    ]);
    const ok = await post(
      app,
      '/v1/sign-basket',
      signReq({ lines, acknowledged_offer_ids: ['sto-b'] }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).findings.map((f: { rule_id: string }) => f.rule_id)).toEqual(['R-07']);
  });

  it('over the owner’s effective basket cap or daily cap → 422 R-20 / R-21', async () => {
    const { app, vault } = setup();
    vault.setOwner(OWNER, { max_basket: '30000000' });
    expect(
      (await (await post(app, '/v1/sign-basket', signReq())).json()).findings.map(
        (f: { rule_id: string }) => f.rule_id,
      ),
    ).toEqual(['R-20']);
    vault.setOwner(OWNER, { spent_today: '980000000', day: Math.floor(NOW / 86_400_000) });
    expect(
      (await (await post(app, '/v1/sign-basket', signReq())).json()).findings.map(
        (f: { rule_id: string }) => f.rule_id,
      ),
    ).toEqual(['R-21']);
  });

  it('yesterday’s spend does not count today (day rollover)', async () => {
    const { app, vault } = setup();
    vault.setOwner(OWNER, { spent_today: '999000000', day: Math.floor(NOW / 86_400_000) - 1 });
    expect((await post(app, '/v1/sign-basket', signReq())).status).toBe(200);
  });

  it('insufficient balance → 422 R-23', async () => {
    const { app, vault } = setup();
    vault.setBalance(OWNER, TOKEN, 1n);
    expect(
      (await (await post(app, '/v1/sign-basket', signReq())).json()).findings.map(
        (f: { rule_id: string }) => f.rule_id,
      ),
    ).toEqual(['R-23']);
  });

  it('unauthorised agent, paused Vault → 422 without a signature', async () => {
    const { app, vault } = setup();
    vault.setOwner(OWNER, { agents: [] });
    expect((await post(app, '/v1/sign-basket', signReq())).status).toBe(422);
    vault.setOwner(OWNER, { agents: [AGENT] });
    vault.policy.paused = true;
    const res = await post(app, '/v1/sign-basket', signReq());
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/paused/);
  });

  it('AT-14: Vault/RPC unreachable → 503 GUARD_DEPENDENCY_DOWN, no signature (fail closed)', async () => {
    const { app, vault } = setup();
    vault.down = true;
    const res = await post(app, '/v1/sign-basket', signReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('GUARD_DEPENDENCY_DOWN');
    expect(body.signature_b64).toBeUndefined();
    expect((await app.request('/v1/health')).status).toBe(503);
    expect((await post(app, '/v1/assess', { offer_ids: ['vps-a'] })).status).toBe(503);
  });

  it('rules hash or Guard key out of step with the Vault → 503, unless --dev for the rules hash', async () => {
    const strict = setup();
    strict.vault.policy.rules_hash = 'cd'.repeat(32);
    const res = await post(strict.app, '/v1/sign-basket', signReq());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('RULES_HASH_MISMATCH');
    const dev = setup({ dev: true });
    dev.vault.policy.rules_hash = 'cd'.repeat(32);
    expect((await post(dev.app, '/v1/sign-basket', signReq())).status).toBe(200);
    dev.vault.policy.guard_key_version = 2;
    expect((await (await post(dev.app, '/v1/sign-basket', signReq())).json()).code).toBe(
      'GUARD_KEY_MISMATCH',
    );
  });

  it('rejects a line whose offer is for a different item, and duplicate lines', async () => {
    const { app } = setup();
    expect(
      (
        await post(
          app,
          '/v1/sign-basket',
          signReq({ lines: [{ item_key: 'domain-com-year', offer_id: 'vps-b', qty: 1 }] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await post(app, '/v1/sign-basket', signReq({ lines: [demoLines[0]!, demoLines[0]!] })))
        .status,
    ).toBe(400);
  });
});

describe('hardening (D-5.3)', () => {
  it('rate limits at 30 requests per minute per client (FR-R09)', async () => {
    const { app } = setup({ rateLimit: { limit: 30, windowMs: 60_000 } });
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await app.request('/v1/policy')).status);
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes[30]).toBe(429);
  });

  it('the Guard secret never appears in logs, even if something logs it by mistake (FR-R05)', async () => {
    const lines: string[] = [];
    const { app, signer } = setup({ logLines: lines });
    await post(app, '/v1/sign-basket', signReq());
    const log = createLogger({ secrets: signer.secretForms, write: (l) => lines.push(l) });
    log.info('oops', {
      signer,
      leaked: `seed=${toBase58(SEED)}`,
      guard_secret_key: 'x'.repeat(40),
    });
    const all = lines.join('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(all).not.toContain(toBase58(SEED));
    expect(all).toContain('[REDACTED]');
    expect(all).toContain('basket signed');
  });
});

describe('determinism', () => {
  let a: string;
  beforeEach(async () => {
    a = (await (await post(setup().app, '/v1/sign-basket', signReq())).json()).hash_hex;
  });
  it('same request, nonce and clock → same hash', async () => {
    expect((await (await post(setup().app, '/v1/sign-basket', signReq())).json()).hash_hex).toBe(a);
  });
});
