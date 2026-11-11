/** Guard HTTP service entry point (default port 8787). */
import { serve } from '@hono/node-server';
import { loadRootEnv } from '@checkpoint/shared/node';
import { buildGuardService } from './build';
import { loadGuardConfig } from './config';
import { createLogger } from './logger';
import { createGuardApp } from './server';

loadRootEnv();

const STARTUP_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000];

async function startupCheckWithRetry(
  service: ReturnType<typeof buildGuardService>['service'],
  log: ReturnType<typeof createLogger>,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await service.startupCheck();
    } catch (e) {
      const wait = STARTUP_RETRY_DELAYS_MS[attempt];
      if (wait === undefined) throw e;
      log.warn('cannot read the Vault at startup, retrying', {
        error: (e as Error).message,
        retry_in_ms: wait,
      });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  const cfg = loadGuardConfig();
  const log = createLogger({ secrets: cfg.signer.secretForms, base: { svc: 'guard' } });
  const { service } = buildGuardService(cfg, log);

  if (cfg.ephemeralKey)
    log.warn('no GUARD_SECRET_KEY: using a throwaway key for local dev only', {
      pubkey: cfg.signer.publicKeyB58,
    });

  // FR-R06 / FR-R07: refuse to start if the Vault disagrees or cannot be read.
  // A failed read (rate limit, timeout) is retried with backoff for about a
  // minute first: a sleeping free instance often wakes into a busy RPC.
  try {
    const problems = await startupCheckWithRetry(service, log);
    if (problems.length) {
      for (const p of problems)
        log.error('startup check failed', { code: p.code, detail: p.message });
      if (!cfg.dev) process.exit(1);
      log.warn('continuing because GUARD_DEV=1');
    }
  } catch (e) {
    log.error('cannot read the Vault at startup', { error: (e as Error).message });
    if (!cfg.dev) process.exit(1);
  }

  const app = createGuardApp(service, { logger: log, corsOrigin: cfg.corsOrigin });
  serve({ fetch: app.fetch, port: cfg.port }, (info) => {
    log.info('guard listening', {
      port: info.port,
      network: cfg.network,
      vault: cfg.vaultMode === 'mock' ? 'mock' : cfg.vaultId,
      rules_hash: cfg.rulesHash,
      pubkey: cfg.signer.publicKeyB58,
      offers: cfg.snapshot.offers.length,
    });
  });
}

main().catch((e: Error) => {
  console.error(`guard: ${e.message}`);
  process.exit(1);
});
