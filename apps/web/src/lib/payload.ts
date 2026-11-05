import { deserialize, serialize, type Schema } from "borsh";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * BasketPayloadV1, PRD §11.2. Field order is binding: it is the byte layout Guard signs and the Vault hashes.
 * Provisional local copy until packages/shared ships the same schema with the shared test vector (H1);
 * then this file becomes a re-export and the vector decides any disagreement.
 */
export const DOMAIN = new TextEncoder().encode("CHECKPOINT_BASKET_V1\0"); // 21 bytes, prepended before hashing only

export interface PayoutV1 {
  vendor_id: string;
  amount: bigint;
  line_count: number;
}

export interface BasketPayloadV1 {
  schema_version: number;
  network_id: string;
  vault_id: string;
  policy_version: number;
  rules_hash: Uint8Array;
  guard_key_version: number;
  basket_id: string;
  owner_id: string;
  agent_id: string;
  token_id: string;
  payouts: PayoutV1[];
  total: bigint;
  evidence_hash: Uint8Array;
  nonce: bigint;
  created_at_ms: bigint;
  expires_at_ms: bigint;
}

const BYTES32: Schema = { array: { type: "u8", len: 32 } };
export const PAYLOAD_SCHEMA: Schema = {
  struct: {
    schema_version: "u8",
    network_id: "string",
    vault_id: "string",
    policy_version: "u32",
    rules_hash: BYTES32,
    guard_key_version: "u32",
    basket_id: "string",
    owner_id: "string",
    agent_id: "string",
    token_id: "string",
    payouts: { array: { type: { struct: { vendor_id: "string", amount: "u128", line_count: "u16" } } } },
    total: "u128",
    evidence_hash: BYTES32,
    nonce: "u64",
    created_at_ms: "u64",
    expires_at_ms: "u64",
  },
};

export function encodePayload(p: BasketPayloadV1): Uint8Array {
  return serialize(PAYLOAD_SCHEMA, { ...p, rules_hash: Array.from(p.rules_hash), evidence_hash: Array.from(p.evidence_hash) });
}

type Raw = Omit<BasketPayloadV1, "rules_hash" | "evidence_hash" | "payouts"> & {
  rules_hash: number[] | Uint8Array;
  evidence_hash: number[] | Uint8Array;
  payouts: { vendor_id: string; amount: bigint | number; line_count: number }[];
};

export function decodePayload(bytes: Uint8Array): BasketPayloadV1 {
  const r = deserialize(PAYLOAD_SCHEMA, bytes) as Raw;
  return {
    ...r,
    rules_hash: Uint8Array.from(r.rules_hash),
    evidence_hash: Uint8Array.from(r.evidence_hash),
    total: BigInt(r.total),
    nonce: BigInt(r.nonce),
    created_at_ms: BigInt(r.created_at_ms),
    expires_at_ms: BigInt(r.expires_at_ms),
    payouts: r.payouts.map((x) => ({ vendor_id: x.vendor_id, amount: BigInt(x.amount), line_count: x.line_count })),
  };
}

/** hash = sha256(DOMAIN ‖ borsh(payload)), hex. The value the owner approves and the Vault recomputes. */
export function basketHash(payloadBytes: Uint8Array): string {
  const buf = new Uint8Array(DOMAIN.length + payloadBytes.length);
  buf.set(DOMAIN);
  buf.set(payloadBytes, DOMAIN.length);
  return bytesToHex(sha256(buf));
}

export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
export const bytesToB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const hex = bytesToHex;
export const sha256Hex = (data: string | Uint8Array) => bytesToHex(sha256(typeof data === "string" ? new TextEncoder().encode(data) : data));

/** Canonical JSON: sorted keys, no whitespace, bigints as strings. Used for evidence_hash. */
export function canonicalJson(v: unknown): string {
  if (typeof v === "bigint") return JSON.stringify(v.toString());
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}
