/** `pnpm mock`: the agents API on :8788 with no keys, chain or Guard process needed. */
import { quietSqliteWarning } from '../config';

quietSqliteWarning();

const { serve } = await import('@hono/node-server');
const { createLogger } = await import('@checkpoint/guard');
const { envInt } = await import('@checkpoint/shared/node');
const { buildMock } = await import('./build');

const port = envInt('AGENTS_PORT', process.env.AGENTS_PORT, 8788);
const log = createLogger({ base: { svc: 'agents-mock' } });
const { app } = buildMock({
  logger: log,
  autoApproveMs: envInt('MOCK_AUTO_APPROVE_MS', process.env.MOCK_AUTO_APPROVE_MS, 4_000),
  ...(process.env.MOCK_TTL_MS
    ? { ttlMs: envInt('MOCK_TTL_MS', process.env.MOCK_TTL_MS, 900_000) }
    : {}),
});
serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `\nCheckpoint agents MOCK on http://localhost:${info.port}  (synthetic fixtures, fake wallet and chain)`,
  );
  console.log(
    `  try: curl -s -XPOST localhost:${info.port}/v1/requests -H 'content-type: application/json' \\`,
  );
  console.log(
    `         -d '{"owner_id":"owner-demo.cpdemo.testnet","text":"2x VPS, 1 .com domain, 1 TB object storage"}'`,
  );
  console.log(`  then: curl -N localhost:${info.port}/v1/requests/<id>/events`);
  console.log(
    '  dev switches: POST /v1/dev/{guard-down,chain-down,auto-approve,approve/:hash}, GET /v1/dev/state\n',
  );
});
