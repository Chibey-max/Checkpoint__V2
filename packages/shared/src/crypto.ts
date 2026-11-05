import * as ed from '@noble/ed25519';
import { sha256 as nobleSha256, sha512 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { fromBase58 } from './encoding';

// Enable the synchronous ed25519 API (noble v3 needs an explicit sha512).
ed.hashes.sha512 = sha512;

export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}

export function secureRandomBytes(length: number): Uint8Array {
  return randomBytes(length);
}

export interface Ed25519KeyPair {
  seed: Uint8Array; // 32-byte secret seed
  publicKey: Uint8Array; // 32 bytes
}

export function keyPairFromSeed(seed: Uint8Array): Ed25519KeyPair {
  if (seed.length !== 32) throw new Error('ed25519 seed must be 32 bytes');
  return { seed, publicKey: ed.getPublicKey(seed) };
}

export function generateKeyPair(): Ed25519KeyPair {
  return keyPairFromSeed(secureRandomBytes(32));
}

/**
 * Parse GUARD_SECRET_KEY: base58 of a 32-byte seed. Also accepts NEAR's
 * `ed25519:<base58 of seed||pubkey>` 64-byte form, in which case the
 * embedded public key must match the seed.
 */
export function parseSecretKey(value: string): Ed25519KeyPair {
  const raw = value.trim().replace(/^ed25519:/, '');
  let bytes: Uint8Array;
  try {
    bytes = fromBase58(raw);
  } catch {
    throw new Error('GUARD_SECRET_KEY is not valid base58');
  }
  if (bytes.length === 32) return keyPairFromSeed(bytes);
  if (bytes.length === 64) {
    const pair = keyPairFromSeed(bytes.slice(0, 32));
    const embedded = bytes.slice(32);
    if (!embedded.every((b, i) => b === pair.publicKey[i])) {
      throw new Error('GUARD_SECRET_KEY: embedded public key does not match the seed');
    }
    return pair;
  }
  throw new Error(`GUARD_SECRET_KEY must decode to 32 or 64 bytes, got ${bytes.length}`);
}

export function ed25519Sign(message: Uint8Array, seed: Uint8Array): Uint8Array {
  return ed.sign(message, seed);
}

export function ed25519Verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
