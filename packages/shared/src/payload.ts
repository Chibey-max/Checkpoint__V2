/**
 * Basket payload v1 (PRD §11.2, frozen). Field order is binding.
 *
 * hash      = sha256(DOMAIN ‖ borsh(payload))
 * signature = ed25519(guard_key, hash)
 *
 * The Vault receives the raw bytes and hashes them itself, so callers must
 * pass the exact bytes around (payload_b64) and never re-encode a decoded copy.
 */
import * as borsh from 'borsh';
import { ed25519Sign, ed25519Verify, sha256 } from './crypto';
import { bytesEqual, compareUtf8, concatBytes, fromHex, toHex, utf8ToBytes } from './encoding';

/** b"CHECKPOINT_BASKET_V1\x00": 21 bytes, prepended before hashing, never serialised. */
export const DOMAIN = utf8ToBytes('CHECKPOINT_BASKET_V1\u0000');

export interface PayoutV1 {
  vendor_id: string;
  amount: bigint; // u128, token base units
  line_count: number; // u16
}

export interface BasketPayloadV1 {
  schema_version: number; // u8, = 1
  network_id: string; // "testnet" | "sandbox"
  vault_id: string;
  policy_version: number; // u32
  rules_hash: Uint8Array; // [u8; 32]
  guard_key_version: number; // u32
  basket_id: string; // uuid v4, lowercase
  owner_id: string;
  agent_id: string;
  token_id: string;
  payouts: PayoutV1[]; // sorted by vendor_id ascending
  total: bigint; // u128
  evidence_hash: Uint8Array; // [u8; 32]
  nonce: bigint; // u64
  created_at_ms: bigint; // u64
  expires_at_ms: bigint; // u64
}

const BYTES32 = { array: { type: 'u8', len: 32 } };

export const BASKET_PAYLOAD_V1_SCHEMA: borsh.Schema = {
  struct: {
    schema_version: 'u8',
    network_id: 'string',
    vault_id: 'string',
    policy_version: 'u32',
    rules_hash: BYTES32,
    guard_key_version: 'u32',
    basket_id: 'string',
    owner_id: 'string',
    agent_id: 'string',
    token_id: 'string',
    payouts: {
      array: { type: { struct: { vendor_id: 'string', amount: 'u128', line_count: 'u16' } } },
    },
    total: 'u128',
    evidence_hash: BYTES32,
    nonce: 'u64',
    created_at_ms: 'u64',
    expires_at_ms: 'u64',
  },
};

const U16_MAX = 0xffff;
const U32_MAX = 0xffff_ffff;
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadError';
  }
}

export interface EncodeOptions {
  /**
   * strict (default): payouts must be sorted by vendor_id with no duplicates
   * and basket_id must be a lowercase uuid v4. Attack scripts that need to
   * craft malformed-but-encodable payloads pass `{ strict: false }`.
   */
  strict?: boolean;
}

function checkUint(name: string, v: number, max: number): void {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new PayloadError(`${name} out of range`);
}

function checkBig(name: string, v: bigint, max: bigint): void {
  if (typeof v !== 'bigint' || v < 0n || v > max) throw new PayloadError(`${name} out of range`);
}

function check32(name: string, v: Uint8Array): void {
  if (!(v instanceof Uint8Array) || v.length !== 32)
    throw new PayloadError(`${name} must be 32 bytes`);
}

export function validatePayload(p: BasketPayloadV1, opts: EncodeOptions = {}): void {
  const strict = opts.strict ?? true;
  checkUint('schema_version', p.schema_version, 0xff);
  checkUint('policy_version', p.policy_version, U32_MAX);
  checkUint('guard_key_version', p.guard_key_version, U32_MAX);
  check32('rules_hash', p.rules_hash);
  check32('evidence_hash', p.evidence_hash);
  for (const [name, v] of [
    ['network_id', p.network_id],
    ['vault_id', p.vault_id],
    ['basket_id', p.basket_id],
    ['owner_id', p.owner_id],
    ['agent_id', p.agent_id],
    ['token_id', p.token_id],
  ] as const) {
    if (typeof v !== 'string') throw new PayloadError(`${name} must be a string`);
  }
  checkBig('total', p.total, U128_MAX);
  checkBig('nonce', p.nonce, U64_MAX);
  checkBig('created_at_ms', p.created_at_ms, U64_MAX);
  checkBig('expires_at_ms', p.expires_at_ms, U64_MAX);
  if (!Array.isArray(p.payouts)) throw new PayloadError('payouts must be an array');
  p.payouts.forEach((po, i) => {
    if (typeof po.vendor_id !== 'string')
      throw new PayloadError(`payouts[${i}].vendor_id must be a string`);
    checkBig(`payouts[${i}].amount`, po.amount, U128_MAX);
    checkUint(`payouts[${i}].line_count`, po.line_count, U16_MAX);
  });
  if (strict) {
    if (p.schema_version !== 1) throw new PayloadError('schema_version must be 1');
    if (!UUID_V4_RE.test(p.basket_id))
      throw new PayloadError('basket_id must be a lowercase uuid v4');
    for (let i = 1; i < p.payouts.length; i++) {
      if (compareUtf8(p.payouts[i - 1]!.vendor_id, p.payouts[i]!.vendor_id) >= 0) {
        throw new PayloadError('payouts must be sorted by vendor_id ascending with no duplicates');
      }
    }
  }
}

function toBorshValue(p: BasketPayloadV1): unknown {
  return {
    ...p,
    rules_hash: Array.from(p.rules_hash),
    evidence_hash: Array.from(p.evidence_hash),
    payouts: p.payouts.map((po) => ({ ...po })),
  };
}

/** Borsh-encode a payload. These are the exact bytes Guard signs and the Vault hashes. */
export function encodePayload(p: BasketPayloadV1, opts: EncodeOptions = {}): Uint8Array {
  validatePayload(p, opts);
  return borsh.serialize(BASKET_PAYLOAD_V1_SCHEMA, toBorshValue(p));
}

type Decoded = Omit<
  BasketPayloadV1,
  'rules_hash' | 'evidence_hash' | 'nonce' | 'created_at_ms' | 'expires_at_ms' | 'total' | 'payouts'
> & {
  rules_hash: ArrayLike<number>;
  evidence_hash: ArrayLike<number>;
  nonce: bigint | number;
  created_at_ms: bigint | number;
  expires_at_ms: bigint | number;
  total: bigint | number;
  payouts: { vendor_id: string; amount: bigint | number; line_count: number }[];
};

/**
 * Decode payload bytes. Rejects anything that does not re-encode to the same
 * bytes (trailing data, truncation), mirroring the Vault's ERR_DECODE.
 */
export function decodePayload(bytes: Uint8Array): BasketPayloadV1 {
  let raw: Decoded;
  try {
    raw = borsh.deserialize(BASKET_PAYLOAD_V1_SCHEMA, bytes) as Decoded;
  } catch (e) {
    throw new PayloadError(`ERR_DECODE: ${(e as Error).message}`);
  }
  const p: BasketPayloadV1 = {
    ...raw,
    rules_hash: Uint8Array.from(raw.rules_hash),
    evidence_hash: Uint8Array.from(raw.evidence_hash),
    nonce: BigInt(raw.nonce),
    created_at_ms: BigInt(raw.created_at_ms),
    expires_at_ms: BigInt(raw.expires_at_ms),
    total: BigInt(raw.total),
    payouts: raw.payouts.map((po) => ({
      vendor_id: po.vendor_id,
      amount: BigInt(po.amount),
      line_count: po.line_count,
    })),
  };
  const again = encodePayload(p, { strict: false });
  if (!bytesEqual(again, bytes))
    throw new PayloadError('ERR_DECODE: trailing or non-canonical bytes');
  return p;
}

export function basketHash(payloadBytes: Uint8Array): Uint8Array {
  return sha256(concatBytes(DOMAIN, payloadBytes));
}

export function basketHashHex(payloadBytes: Uint8Array): string {
  return toHex(basketHash(payloadBytes));
}

export function signBasketHash(hash: Uint8Array, seed: Uint8Array): Uint8Array {
  if (hash.length !== 32) throw new PayloadError('hash must be 32 bytes');
  return ed25519Sign(hash, seed);
}

export function verifyBasketSignature(
  signature: Uint8Array,
  hash: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return signature.length === 64 && hash.length === 32 && ed25519Verify(signature, hash, publicKey);
}

/** JSON form: u64/u128 as decimal strings, byte arrays as lowercase hex. */
export interface PayloadJson {
  schema_version: number;
  network_id: string;
  vault_id: string;
  policy_version: number;
  rules_hash: string;
  guard_key_version: number;
  basket_id: string;
  owner_id: string;
  agent_id: string;
  token_id: string;
  payouts: { vendor_id: string; amount: string; line_count: number }[];
  total: string;
  evidence_hash: string;
  nonce: string;
  created_at_ms: string;
  expires_at_ms: string;
}

export function payloadToJson(p: BasketPayloadV1): PayloadJson {
  return {
    ...p,
    rules_hash: toHex(p.rules_hash),
    evidence_hash: toHex(p.evidence_hash),
    payouts: p.payouts.map((po) => ({ ...po, amount: po.amount.toString() })),
    total: p.total.toString(),
    nonce: p.nonce.toString(),
    created_at_ms: p.created_at_ms.toString(),
    expires_at_ms: p.expires_at_ms.toString(),
  };
}

export function payloadFromJson(j: PayloadJson): BasketPayloadV1 {
  return {
    ...j,
    rules_hash: fromHex(j.rules_hash),
    evidence_hash: fromHex(j.evidence_hash),
    payouts: j.payouts.map((po) => ({ ...po, amount: BigInt(po.amount) })),
    total: BigInt(j.total),
    nonce: BigInt(j.nonce),
    created_at_ms: BigInt(j.created_at_ms),
    expires_at_ms: BigInt(j.expires_at_ms),
  };
}
