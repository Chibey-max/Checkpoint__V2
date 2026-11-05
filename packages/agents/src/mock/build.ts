/**
 * Mock agents service (task D-0.3, handoff H2): the real pipeline and API,
 * with Guard in-process over the dev fixture snapshot, an in-memory Vault and
 * a fake wallet/settlement. No keys, no network, no chain.
 */
import {
  DEFAULT_RULES_CONFIG,
  keyPairFromSeed,
  rulesHashHex,
  sha256,
  utf8ToBytes,
} from '@checkpoint/shared';
import { loadSnapshotOrThrow, resolveFromRoot } from '@checkpoint/shared/node';
import {
  createGuardApp,
  GuardService,
  GuardSigner,
  MockVaultViews,
  silentLogger,
  type Logger,
} from '@checkpoint/guard';
import { z } from 'zod';
import { MockChain } from '../chain/mock';
import { HttpGuardClient, inProcessFetch } from '../guard-client';
import type { StructuredLlm } from '../llm';
import { Orchestrator } from '../orchestrator';
import { createAgentsApp } from '../server';
import { Store } from '../store';

export interface MockOptions {
  snapshotDir?: string;
  autoApproveMs?: number;
  settleMs?: number;
  researchDelayMs?: number;
  approvalPollMs?: number;
  settlementPollMs?: number;
  ttlMs?: number;
  dbPath?: string;
  llm?: StructuredLlm | null;
  logger?: Logger;
  now?: () => number;
  assessNowMs?: number;
}

export function buildMock(opts: MockOptions = {}) {
  const log = opts.logger ?? silentLogger;
  const snap = loadSnapshotOrThrow(
    opts.snapshotDir ?? resolveFromRoot('./data/fixtures/dev-snapshot'),
  );
  const rules = DEFAULT_RULES_CONFIG;
  const rulesHash = rulesHashHex(rules);
  // Fixed, published dev key: the mock never touches a chain.
  const signer = new GuardSigner(keyPairFromSeed(sha256(utf8ToBytes('checkpoint/mock-guard-key'))));
  const vault = new MockVaultViews({
    ...(opts.now ? { now: opts.now } : {}),
    policy: { rules_hash: rulesHash, guard_pubkey: signer.publicKeyB58, guard_key_version: 1 },
  });
  const guardService = new GuardService({
    rules,
    rulesHash,
    catalog: snap.catalog,
    offers: snap.offers,
    vault,
    signer,
    networkId: 'testnet',
    vaultId: 'vault.cpdemo.testnet',
    guardKeyVersion: 1,
    dev: true,
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.assessNowMs !== undefined ? { assessNow: () => opts.assessNowMs! } : {}),
    ...(opts.ttlMs ? { ttlMs: opts.ttlMs } : {}),
    logger: log,
  });
  const guardApp = createGuardApp(guardService, { logger: log, rateLimit: false });
  const chain = new MockChain({
    autoApproveMs: opts.autoApproveMs ?? 4_000,
    settleMs: opts.settleMs ?? 1_500,
    ...(opts.now ? { now: opts.now } : {}),
  });
  const orch = new Orchestrator({
    store: new Store(opts.dbPath ?? ':memory:'),
    guard: new HttpGuardClient('http://guard.mock', inProcessFetch(guardApp)),
    chain,
    settlement: chain,
    catalog: snap.catalog,
    offers: snap.offers,
    rules,
    rulesHash,
    agentId: 'agent.cpdemo.testnet',
    tokenId: 'cpusd.cpdemo.testnet',
    llm: opts.llm ?? null,
    researchDelayMs: opts.researchDelayMs ?? 120,
    ...(opts.approvalPollMs ? { approvalPollMs: opts.approvalPollMs } : {}),
    ...(opts.settlementPollMs ? { settlementPollMs: opts.settlementPollMs } : {}),
    ...(opts.now ? { now: opts.now } : {}),
    logger: log,
  });

  const app = createAgentsApp(orch, {
    logger: log,
    corsOrigin: '*',
    extend: (a) => {
      // Dev-only switches so the UI can see every event type.
      a.get('/v1/dev/state', (c) =>
        c.json({
          guard_down: vault.down,
          chain_down: chain.down,
          auto_approve_ms: chain.opts.autoApproveMs,
          failing_vendors: chain.opts.failingVendors,
        }),
      );
      a.post('/v1/dev/approve/:hash', async (c) => {
        const b = z
          .object({ owner_id: z.string(), expires_at_ms: z.int() })
          .parse(await c.req.json());
        chain.approve(c.req.param('hash'), b.owner_id, b.expires_at_ms);
        return c.json({ ok: true });
      });
      a.post('/v1/dev/guard-down', async (c) => {
        vault.down = z.object({ down: z.boolean() }).parse(await c.req.json()).down;
        return c.json({ ok: true, guard_down: vault.down });
      });
      a.post('/v1/dev/chain-down', async (c) => {
        chain.down = z.object({ down: z.boolean() }).parse(await c.req.json()).down;
        return c.json({ ok: true, chain_down: chain.down });
      });
      a.post('/v1/dev/auto-approve', async (c) => {
        chain.opts.autoApproveMs = z.object({ ms: z.int().min(0) }).parse(await c.req.json()).ms;
        return c.json({ ok: true, auto_approve_ms: chain.opts.autoApproveMs });
      });
    },
  });
  return { app, orch, chain, vault, guardService, signer };
}
