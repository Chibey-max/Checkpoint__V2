/**
 * pnpm verify:audit <basket_id> [options]   (task D-4.2, FR-AG09)
 *
 * Fetches the evidence bundle, recomputes evidence_hash and the basket hash,
 * verifies Guard's signature and compares everything with get_basket on chain.
 * Prints PASS / FAIL / SKIP per check and exits 1 on any FAIL.
 *
 *   --agents <url>   agents service (default $AGENTS_URL or http://localhost:8788)
 *   --file <path>    read the bundle from a file instead
 *   --rpc <url>      NEAR RPC (default $NEAR_RPC_URL); enables the signature and chain checks
 *   --vault <id>     Vault account (default $VAULT_ID)
 *   --pubkey <b58>   Guard public key, if not read from the Vault
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  VaultBasketViewSchema,
  VaultPolicyViewSchema,
  verifyEvidenceBundle,
  viewFunction,
  type VaultBasketView,
} from '@checkpoint/shared';
import { loadRootEnv } from '@checkpoint/shared/node';

loadRootEnv();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    agents: { type: 'string' },
    file: { type: 'string' },
    rpc: { type: 'string' },
    vault: { type: 'string' },
    pubkey: { type: 'string' },
  },
});

async function main(): Promise<number> {
  const basketId = positionals[0];
  let bundle: unknown;
  if (values.file) bundle = JSON.parse(readFileSync(values.file, 'utf8'));
  else {
    if (!basketId) {
      console.error(
        'usage: pnpm verify:audit <basket_id> [--agents url | --file bundle.json] [--rpc url --vault id] [--pubkey b58]',
      );
      return 2;
    }
    const agents = values.agents ?? process.env.AGENTS_URL ?? 'http://localhost:8788';
    const res = await fetch(`${agents.replace(/\/$/, '')}/v1/audit/${basketId}`);
    if (!res.ok) {
      console.error(`GET /v1/audit/${basketId} → HTTP ${res.status}`);
      return 1;
    }
    bundle = await res.json();
  }

  const rpc = values.rpc ?? process.env.NEAR_RPC_URL;
  const vault = values.vault ?? process.env.VAULT_ID;
  let pubkey = values.pubkey ?? null;
  let chainBasket: VaultBasketView | null | undefined;
  const hash = (bundle as { signed?: { hash_hex?: string } })?.signed?.hash_hex;
  if (rpc && vault) {
    if (!pubkey)
      pubkey = VaultPolicyViewSchema.parse(
        await viewFunction(rpc, vault, 'get_policy'),
      ).guard_pubkey;
    if (hash) {
      const raw = await viewFunction(rpc, vault, 'get_basket', { hash_hex: hash });
      chainBasket = raw === null ? null : VaultBasketViewSchema.parse(raw);
    }
  }

  const { ok, checks } = verifyEvidenceBundle(bundle, {
    guardPubkeyB58: pubkey,
    ...(chainBasket !== undefined ? { chainBasket } : {}),
  });
  const w = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) console.log(`${c.status.padEnd(4)}  ${c.name.padEnd(w)}  ${c.detail}`);
  console.log(`\n${ok ? 'PASS' : 'FAIL'}: basket ${basketId ?? '(file)'}`);
  return ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    console.error(`verify:audit: ${e.message}`);
    process.exit(1);
  },
);
