# `basket-v1.json`: the shared payload test vector (handoff H1)

Both the Rust (Vault) and TypeScript (Guard, agents, web) test suites assert this file. If the two sides ever disagree, **the vector decides** and the side that disagrees has the bug (PRD §11.2).

- `domain_hex`: `CHECKPOINT_BASKET_V1\0`, 21 bytes, prepended before hashing and never serialised.
- `test_key`: a **published, test-only** ed25519 key (seed = `sha256("checkpoint/test-only/guard-key-v1")`). It is never used on testnet.
- `cases[]`: `payload` (JSON form: u64/u128 as decimal strings, `[u8;32]` as hex), plus `payload_hex`, `payload_b64`, `hash_hex`, `signature_hex` and `signature_b64`.
  - `demo-two-vendors`: a typical testnet basket.
  - `edge-large-values`: u128 above 2^64, u64 at max, u32 above 2^16, four payouts.

Regenerate with `pnpm vector:gen`. CI fails if the committed file is out of date.

## Already checked against Rust

On 5 Nov the vector was cross-checked with an independent Rust program using `borsh` 1.x `#[derive(BorshSerialize, BorshDeserialize)]` (the same borsh near-sdk 5.x uses), `sha2` and `ed25519-dalek` 2. Both cases matched byte for byte, the hashes matched, `try_from_slice` round-tripped, and the signatures passed `verify` and `verify_strict`. The struct the Vault should use (field order is binding):

```rust
#[derive(BorshSerialize, BorshDeserialize)]
pub struct PayoutV1 { pub vendor_id: String, pub amount: u128, pub line_count: u16 }

#[derive(BorshSerialize, BorshDeserialize)]
pub struct BasketPayloadV1 {
    pub schema_version: u8, pub network_id: String, pub vault_id: String, pub policy_version: u32,
    pub rules_hash: [u8; 32], pub guard_key_version: u32, pub basket_id: String, pub owner_id: String,
    pub agent_id: String, pub token_id: String, pub payouts: Vec<PayoutV1>, pub total: u128,
    pub evidence_hash: [u8; 32], pub nonce: u64, pub created_at_ms: u64, pub expires_at_ms: u64,
}

pub const DOMAIN: &[u8] = b"CHECKPOINT_BASKET_V1\x00";
// hash = env::sha256(&[DOMAIN, &payload_bytes].concat());
// ok   = env::ed25519_verify(&sig_64, &hash, &guard_pubkey_32);
```

For the Vault's own unit test (I-0.4 step 4): load this file, `BasketPayloadV1::try_from_slice(&hex::decode(payload_hex))` (rejects trailing bytes, so it gives ERR_DECODE), recompute the hash, and assert `ed25519_verify` against `test_key.pubkey_hex`.

Payouts are sorted by `vendor_id` in **byte order** (Rust's `String` ordering). Guard always sorts this way; the TS encoder rejects unsorted or duplicate vendors unless called with `{ strict: false }`, which is for attack scripts.
