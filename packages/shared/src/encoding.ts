import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import bs58 from 'bs58';

export { concatBytes, utf8ToBytes };

const HEX_RE = /^(?:[0-9a-f]{2})*$/;
const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Lowercase hex, no prefix. */
export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

/** Strict: lowercase, even length, no 0x prefix. */
export function fromHex(hex: string): Uint8Array {
  if (!HEX_RE.test(hex)) throw new Error('invalid hex: expected lowercase, even length, no 0x');
  return hexToBytes(hex);
}

export function isHex32(value: string): boolean {
  return value.length === 64 && HEX_RE.test(value);
}

/** Standard base64 with padding (what near-sdk Base64VecU8 expects). */
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Strict standard base64: rejects bad alphabet, missing padding and non-canonical trailing bits. */
export function fromBase64(value: string): Uint8Array {
  if (!B64_RE.test(value)) throw new Error('invalid base64');
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (toBase64(out) !== value) throw new Error('non-canonical base64');
  return out;
}

export function toBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

export function fromBase58(value: string): Uint8Array {
  return bs58.decode(value);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Byte-wise comparison of UTF-8 strings, matching Rust's `String` ordering. */
export function compareUtf8(a: string, b: string): number {
  const x = utf8ToBytes(a);
  const y = utf8ToBytes(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  }
  return x.length - y.length;
}
