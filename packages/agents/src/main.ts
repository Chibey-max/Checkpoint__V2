/** Agents service entry point (default port 8788). */
import { loadRootEnv } from '@checkpoint/shared/node';
import { quietSqliteWarning } from './config';

quietSqliteWarning();
loadRootEnv();

const { serve } = await import('@hono/node-server');
const { createLogger } = await import('@checkpoint/guard');
const { loadAgentsConfig } = await import('./config');
const { createLlm } = await import('./llm');
const { MockChain } = await import('./chain/mock');
const { RpcVaultChain } = await import('./chain/rpc');
const { createSettlement } = await import('./settlement');
const { HttpGuardClient } = await import('./guard-client');
const { Orchestrator } = await import('./orchestrator');
const { createAgentsApp } = await import('./server');
const { Store } = await import('./store');
const { createIntentsClient } = await import('./intents');

try {
  const cfg = loadAgentsConfig();
  const log = createLogger({
    secrets: [cfg.agentFcPrivateKey ?? '', process.env.GROQ_API_KEY ?? ''],
    base: { svc: 'agents' },
  });
  const mock =
    cfg.chainMode === 'mock' ? new MockChain({ autoApproveMs: 4_000, settleMs: 1_500 }) : null;
  const orch = new Orchestrator({
    store: new Store(cfg.dbPath),
    guard: new HttpGuardClient(cfg.guardUrl),
    chain: mock ?? new RpcVaultChain(cfg.rpcUrl, cfg.vaultId),
    settlement:
      mock ??
      createSettlement({
        rpcUrl: cfg.rpcUrl,
        vaultId: cfg.vaultId,
        agentAccountId: cfg.agentId,
        agentFcPrivateKey: cfg.agentFcPrivateKey,
      }),
    catalog: cfg.snapshot.catalog,
    offers: cfg.snapshot.offers,
    rules: cfg.rules,
    rulesHash: cfg.rulesHash,
    agentId: cfg.agentId,
    tokenId: cfg.tokenId,
    llm: createLlm(cfg.llm),
    logger: log,
  });
  if (process.env.LLM_PROVIDER === 'groq' && cfg.llm.provider === 'none') {
    log.warn(
      'LLM_PROVIDER=groq but GROQ_API_KEY is empty: using the deterministic parser and template explanations',
    );
  }
  orch.resume();
  // D-6.2: dry NEAR Intents quotes (mainnet, display-only). AGENTS_INTENTS=off disables them.
  const intents =
    process.env.AGENTS_INTENTS === 'off'
      ? undefined
      : createIntentsClient({
          ...(process.env.ONECLICK_URL ? { baseUrl: process.env.ONECLICK_URL } : {}),
          ...(process.env.ONECLICK_API_KEY ? { apiKey: process.env.ONECLICK_API_KEY } : {}),
        });
  const app = createAgentsApp(orch, {
    logger: log,
    corsOrigin: cfg.corsOrigin,
    ...(intents ? { intents } : {}),
  });
  serve({ fetch: app.fetch, port: cfg.port }, (info) =>
    log.info('agents listening', {
      port: info.port,
      guard: cfg.guardUrl,
      chain: cfg.chainMode,
      llm: cfg.llm.provider,
      offers: cfg.snapshot.offers.length,
    }),
  );
} catch (e) {
  console.error(`agents: ${(e as Error).message}`);
  process.exit(1);
}
