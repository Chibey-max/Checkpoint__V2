/**
 * Independent verification of an evidence bundle (FR-AG09, task D-4.2).
 * Used by `pnpm verify:audit` and by the web app's audit page, so it depends
 * only on this package, never on the agents service code.
 */
import { fromBase58, fromBase64, toHex } from './encoding';
import { evidenceHashHex } from './evidence';
import { basketHashHex, decodePayload, verifyBasketSignature } from './payload';
import { groupPayouts } from './pricing';
import { EvidenceBundleSchema, type EvidenceBundle } from './schemas';
import { fromHex } from './encoding';
import type { VaultBasketView } from './vault-views';

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';
export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface VerifyInputs {
  /** Guard public key (base58), e.g. from the Vault's get_policy. Without it the signature check is skipped. */
  guardPubkeyB58?: string | null;
  /** get_basket(hash) from the chain. Without it the on-chain checks are skipped. */
  chainBasket?: VaultBasketView | null;
}

export function verifyEvidenceBundle(
  raw: unknown,
  inputs: VerifyInputs = {},
): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean | null, detail: string) =>
    checks.push({ name, status: pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL', detail });

  const parsed = EvidenceBundleSchema.safeParse(raw);
  add(
    'bundle schema',
    parsed.success,
    parsed.success
      ? 'valid'
      : parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
  );
  if (!parsed.success) return { ok: false, checks };
  const b: EvidenceBundle = parsed.data;

  const recomputed = evidenceHashHex(b.core);
  add('evidence_hash recomputes', recomputed === b.evidence_hash, recomputed);

  const lines = b.core.basket.lines;
  const regrouped = groupPayouts(
    lines.map((l) => ({ vendor_id: l.vendor_id, amount: BigInt(l.amount) })),
  );
  const payoutsOk =
    regrouped.total.toString() === b.core.basket.total &&
    regrouped.payouts.length === b.core.basket.payouts.length &&
    regrouped.payouts.every((p, i) => {
      const q = b.core.basket.payouts[i]!;
      return (
        p.vendor_id === q.vendor_id &&
        p.amount.toString() === q.amount &&
        p.line_count === q.line_count
      );
    });
  add('basket lines add up to payouts and total', payoutsOk, `total ${b.core.basket.total}`);

  if (!b.signed) {
    add('signed payload present', false, 'bundle has no signed basket');
    return { ok: false, checks };
  }
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(b.signed.payload_b64);
  } catch {
    add('payload decodes', false, 'payload_b64 is not valid base64');
    return { ok: false, checks };
  }
  let p;
  try {
    p = decodePayload(bytes);
    add('payload decodes', true, `${bytes.length} bytes, basket ${p.basket_id}`);
  } catch (e) {
    add('payload decodes', false, (e as Error).message);
    return { ok: false, checks };
  }
  const hash = basketHashHex(bytes);
  add('basket hash recomputes', hash === b.signed.hash_hex, hash);
  add(
    'payload carries this evidence_hash',
    toHex(p.evidence_hash) === b.evidence_hash,
    toHex(p.evidence_hash),
  );
  const samePayouts =
    p.basket_id === b.core.basket.basket_id &&
    p.owner_id === b.core.basket.owner_id &&
    p.token_id === b.core.basket.token_id &&
    p.total.toString() === b.core.basket.total &&
    p.payouts.length === b.core.basket.payouts.length &&
    p.payouts.every(
      (po, i) =>
        po.vendor_id === b.core.basket.payouts[i]!.vendor_id &&
        po.amount.toString() === b.core.basket.payouts[i]!.amount,
    );
  add(
    'payload matches the evidence basket',
    samePayouts,
    `${p.payouts.length} payouts, total ${p.total}`,
  );

  if (inputs.guardPubkeyB58) {
    let ok: boolean;
    try {
      ok = verifyBasketSignature(
        fromBase64(b.signed.signature_b64),
        fromHex(b.signed.hash_hex),
        fromBase58(inputs.guardPubkeyB58),
      );
    } catch {
      ok = false;
    }
    add('Guard signature verifies', ok, `key ${inputs.guardPubkeyB58}`);
  } else add('Guard signature verifies', null, 'no Guard public key given');

  const cb = inputs.chainBasket;
  if (cb === undefined) {
    add('on-chain basket matches', null, 'no chain data given');
  } else if (cb === null) {
    add('on-chain basket matches', false, `get_basket(${b.signed.hash_hex}) returned nothing`);
  } else {
    const ok =
      cb.hash === b.signed.hash_hex &&
      cb.evidence_hash === b.evidence_hash &&
      cb.total === b.core.basket.total &&
      cb.payouts.length === p.payouts.length &&
      cb.payouts.every(
        (x, i) =>
          x.vendor === p.payouts[i]!.vendor_id && x.amount === p.payouts[i]!.amount.toString(),
      );
    add('on-chain basket matches', ok, `status ${cb.status}`);
    if (b.chain.final_status)
      add(
        'final status matches chain',
        cb.status === b.chain.final_status,
        `${b.chain.final_status} vs ${cb.status}`,
      );
  }

  return { ok: checks.every((c) => c.status !== 'FAIL'), checks };
}
