import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOMAIN,
  PayloadError,
  basketHash,
  decodePayload,
  encodePayload,
  fromBase64,
  fromHex,
  payloadFromJson,
  signBasketHash,
  toBase64,
  toHex,
  verifyBasketSignature,
  type PayloadJson,
} from '../src/index';
import { TEST_SEED, VECTOR_CASES, buildVectorFile } from '../scripts/gen-vector';

interface VectorFile {
  domain_hex: string;
  test_key: { seed_hex: string; pubkey_hex: string; pubkey_b58: string };
  cases: {
    name: string;
    payload: PayloadJson;
    payload_hex: string;
    payload_b64: string;
    hash_hex: string;
    signature_hex: string;
    signature_b64: string;
  }[];
}

const vector = JSON.parse(
  readFileSync(new URL('../vectors/basket-v1.json', import.meta.url), 'utf8'),
) as VectorFile;

describe('shared vector basket-v1.json (FR-DX05)', () => {
  it('is up to date with the generator', () => {
    expect(vector).toEqual(JSON.parse(JSON.stringify(buildVectorFile())));
  });

  it('domain is the 21-byte CHECKPOINT_BASKET_V1\\0', () => {
    expect(DOMAIN.length).toBe(21);
    expect(toHex(DOMAIN)).toBe(vector.domain_hex);
    expect(DOMAIN[20]).toBe(0);
  });

  for (const c of vector.cases) {
    describe(c.name, () => {
      const payload = payloadFromJson(c.payload);
      const bytes = encodePayload(payload);
      const pub = fromHex(vector.test_key.pubkey_hex);

      it('encodes to the vector bytes', () => {
        expect(toHex(bytes)).toBe(c.payload_hex);
        expect(toBase64(bytes)).toBe(c.payload_b64);
      });

      it('hashes to the vector hash', () => {
        expect(toHex(basketHash(bytes))).toBe(c.hash_hex);
      });

      it('signs deterministically to the vector signature, which verifies', () => {
        const sig = signBasketHash(basketHash(bytes), fromHex(vector.test_key.seed_hex));
        expect(toHex(sig)).toBe(c.signature_hex);
        expect(verifyBasketSignature(fromBase64(c.signature_b64), fromHex(c.hash_hex), pub)).toBe(
          true,
        );
      });

      it('decodes back to the same payload', () => {
        expect(decodePayload(fromHex(c.payload_hex))).toEqual(payload);
      });

      it('a one-byte change to the payload or signature fails verification (FR-A04)', () => {
        const hash = fromHex(c.hash_hex);
        const sig = fromHex(c.signature_hex);
        const flipped = fromHex(c.payload_hex);
        flipped[flipped.length - 1]! ^= 0x01;
        expect(verifyBasketSignature(sig, basketHash(flipped), pub)).toBe(false);
        const badSig = sig.slice();
        badSig[0]! ^= 0x01;
        expect(verifyBasketSignature(badSig, hash, pub)).toBe(false);
      });
    });
  }
});

describe('Borsh layout (PRD §11.2)', () => {
  const payload = VECTOR_CASES[0]!.payload;
  const bytes = encodePayload(payload);

  it('starts with schema_version u8 then a u32-LE length-prefixed network_id', () => {
    expect(bytes[0]).toBe(1);
    expect(Array.from(bytes.slice(1, 5))).toEqual([7, 0, 0, 0]);
    expect(new TextDecoder().decode(bytes.slice(5, 12))).toBe('testnet');
  });

  it('ends with nonce, created_at_ms, expires_at_ms as u64 little-endian', () => {
    const tail = bytes.slice(bytes.length - 24);
    const view = new DataView(tail.buffer, tail.byteOffset);
    expect(view.getBigUint64(0, true)).toBe(payload.nonce);
    expect(view.getBigUint64(8, true)).toBe(payload.created_at_ms);
    expect(view.getBigUint64(16, true)).toBe(payload.expires_at_ms);
  });

  it('encodes u128 as 16 bytes little-endian', () => {
    const edge = VECTOR_CASES[1]!.payload;
    const b = encodePayload(edge);
    // total sits right before evidence_hash (32) + nonce/created/expires (24)
    const totalBytes = b.slice(b.length - 24 - 32 - 16, b.length - 24 - 32);
    let v = 0n;
    for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(totalBytes[i]!);
    expect(v).toBe(edge.total);
  });
});

describe('decode and validation', () => {
  const bytes = encodePayload(VECTOR_CASES[0]!.payload);

  it('rejects trailing bytes (ERR_DECODE)', () => {
    const extra = new Uint8Array([...bytes, 0]);
    expect(() => decodePayload(extra)).toThrow(/ERR_DECODE/);
  });

  it('rejects truncated bytes (ERR_DECODE)', () => {
    expect(() => decodePayload(bytes.slice(0, bytes.length - 1))).toThrow(/ERR_DECODE/);
  });

  it('strict mode requires payouts sorted by vendor_id with no duplicates', () => {
    const p = VECTOR_CASES[0]!.payload;
    const unsorted = { ...p, payouts: [...p.payouts].reverse() };
    expect(() => encodePayload(unsorted)).toThrow(PayloadError);
    const dup = { ...p, payouts: [p.payouts[0]!, p.payouts[0]!] };
    expect(() => encodePayload(dup)).toThrow(/sorted/);
    // attack scripts can still build these with strict: false
    expect(() => encodePayload(dup, { strict: false })).not.toThrow();
  });

  it('rejects out-of-range integers and wrong-length hashes', () => {
    const p = VECTOR_CASES[0]!.payload;
    expect(() => encodePayload({ ...p, total: 1n << 128n })).toThrow(/total/);
    expect(() => encodePayload({ ...p, nonce: -1n })).toThrow(/nonce/);
    expect(() => encodePayload({ ...p, policy_version: 2 ** 32 })).toThrow(/policy_version/);
    expect(() => encodePayload({ ...p, rules_hash: new Uint8Array(31) })).toThrow(/rules_hash/);
    expect(() => encodePayload({ ...p, basket_id: 'NOT-A-UUID' })).toThrow(/basket_id/);
  });

  it('the vector key is the published test key', () => {
    expect(toHex(TEST_SEED)).toBe(vector.test_key.seed_hex);
  });
});
