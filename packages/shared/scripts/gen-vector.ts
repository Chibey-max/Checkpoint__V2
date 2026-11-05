/**
 * Generates packages/shared/vectors/basket-v1.json (FR-DX05, handoff H1).
 * Rust (Isaac) and TS tests both assert these bytes, hashes and signatures.
 * If the two sides ever disagree, the vector decides (PRD §11.2).
 *
 * The signing key here is a published TEST-ONLY key derived from a fixed
 * label. It is not the Guard key used on testnet (that one comes from
 * `pnpm guard keygen` and never enters the repo).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN,
  basketHash,
  encodePayload,
  keyPairFromSeed,
  payloadToJson,
  sha256,
  signBasketHash,
  toBase58,
  toBase64,
  toHex,
  utf8ToBytes,
  type BasketPayloadV1,
} from '../src/index';

export const TEST_SEED = sha256(utf8ToBytes('checkpoint/test-only/guard-key-v1'));

const h = (label: string) => sha256(utf8ToBytes(label));

export const VECTOR_CASES: { name: string; description: string; payload: BasketPayloadV1 }[] = [
  {
    name: 'demo-two-vendors',
    description: 'Typical testnet basket: two vendors, cpUSD base units (6 decimals).',
    payload: {
      schema_version: 1,
      network_id: 'testnet',
      vault_id: 'vault.cpdemo.testnet',
      policy_version: 3,
      rules_hash: h('vector/rules_hash'),
      guard_key_version: 1,
      basket_id: '3f2c1d4e-8a7b-4c6d-9e0f-1a2b3c4d5e6f',
      owner_id: 'owner-demo.cpdemo.testnet',
      agent_id: 'agent.cpdemo.testnet',
      token_id: 'cpusd.cpdemo.testnet',
      payouts: [
        { vendor_id: 'vendor-02.cpdemo.testnet', amount: 23_000_000n, line_count: 1 },
        { vendor_id: 'vendor-06.cpdemo.testnet', amount: 9_990_000n, line_count: 1 },
      ],
      total: 32_990_000n,
      evidence_hash: h('vector/evidence_hash'),
      nonce: 0x8f3a_5c21_7d4e_9b06n,
      created_at_ms: 1_793_966_400_000n,
      expires_at_ms: 1_793_967_300_000n,
    },
  },
  {
    name: 'edge-large-values',
    description: 'Width checks: u128 above 2^64, u64 at max, u32 above 2^16, four payouts.',
    payload: {
      schema_version: 1,
      network_id: 'sandbox',
      vault_id: 'vault.test.near',
      policy_version: 70_000,
      rules_hash: h('vector/edge/rules_hash'),
      guard_key_version: 4_000_000_000,
      basket_id: '00000000-0000-4000-8000-000000000000',
      owner_id: 'owner.test.near',
      agent_id: 'agent.test.near',
      token_id: 'cpusd.test.near',
      payouts: [
        { vendor_id: 'vendor-01.test.near', amount: (1n << 64n) + 5n, line_count: 65_535 },
        { vendor_id: 'vendor-02.test.near', amount: 1n, line_count: 1 },
        { vendor_id: 'vendor-03.test.near', amount: 0n, line_count: 2 },
        { vendor_id: 'vendor-04.test.near', amount: (1n << 127n) - 1n, line_count: 3 },
      ],
      total: (1n << 64n) + 6n + (1n << 127n) - 1n,
      evidence_hash: h('vector/edge/evidence_hash'),
      nonce: (1n << 64n) - 1n,
      created_at_ms: 0n,
      expires_at_ms: (1n << 64n) - 1n,
    },
  },
];

export function buildVectorFile() {
  const key = keyPairFromSeed(TEST_SEED);
  return {
    format: 'checkpoint-basket-vector-v1',
    note: 'TEST-ONLY key material. Never use this key on testnet. Regenerate with: pnpm vector:gen',
    domain_hex: toHex(DOMAIN),
    domain_utf8: 'CHECKPOINT_BASKET_V1\\0',
    test_key: {
      seed_hex: toHex(key.seed),
      pubkey_hex: toHex(key.publicKey),
      pubkey_b58: toBase58(key.publicKey),
    },
    cases: VECTOR_CASES.map((c) => {
      const bytes = encodePayload(c.payload);
      const hash = basketHash(bytes);
      const sig = signBasketHash(hash, key.seed);
      return {
        name: c.name,
        description: c.description,
        payload: payloadToJson(c.payload),
        payload_len: bytes.length,
        payload_hex: toHex(bytes),
        payload_b64: toBase64(bytes),
        hash_hex: toHex(hash),
        signature_hex: toHex(sig),
        signature_b64: toBase64(sig),
      };
    }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('../vectors/basket-v1.json', import.meta.url));
  writeFileSync(out, `${JSON.stringify(buildVectorFile(), null, 2)}\n`);
  console.log(`wrote ${out}`);
}
