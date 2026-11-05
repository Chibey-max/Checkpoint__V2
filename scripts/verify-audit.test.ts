import { buildMock } from '@checkpoint/agents';
import {
  toBase64,
  fromBase64,
  verifyEvidenceBundle,
  type EvidenceBundle,
} from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';

async function paidBasket() {
  const m = buildMock({
    autoApproveMs: 10,
    settleMs: 0,
    researchDelayMs: 0,
    approvalPollMs: 5,
    settlementPollMs: 5,
    assessNowMs: Date.parse('2026-11-06T00:00:00Z'),
  });
  const id = m.orch.createRequest({
    owner_id: 'owner-demo.cpdemo.testnet',
    text: '2x vps, 1 .com domain, 1 TB storage',
  });
  await m.orch.whenIdle(id);
  const view = m.orch.view(id);
  const bundle = m.orch.audit(view.basket!.basket_id);
  const chainBasket = await m.chain.getBasket(view.signed!.hash_hex);
  return { bundle, chainBasket, pubkey: m.signer.publicKeyB58 };
}

const statusOf = (r: ReturnType<typeof verifyEvidenceBundle>, name: string) =>
  r.checks.find((c) => c.name === name)?.status;

describe('verify:audit (D-4.2, FR-AG09)', () => {
  it('PASSes on a paid basket, with signature and chain checks', async () => {
    const { bundle, chainBasket, pubkey } = await paidBasket();
    const r = verifyEvidenceBundle(JSON.parse(JSON.stringify(bundle)), {
      guardPubkeyB58: pubkey,
      chainBasket,
    });
    expect(r.checks.filter((c) => c.status !== 'PASS')).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('FAILs when the evidence was edited after signing', async () => {
    const { bundle, chainBasket, pubkey } = await paidBasket();
    const edited: EvidenceBundle = structuredClone(bundle);
    edited.core.offers[0]!.price_total_micro_usd = 1;
    const r = verifyEvidenceBundle(edited, { guardPubkeyB58: pubkey, chainBasket });
    expect(r.ok).toBe(false);
    expect(statusOf(r, 'evidence_hash recomputes')).toBe('FAIL');
  });

  it('FAILs when the payload bytes were changed, or the signature is not Guard’s', async () => {
    const { bundle, chainBasket, pubkey } = await paidBasket();
    const edited: EvidenceBundle = structuredClone(bundle);
    const bytes = fromBase64(edited.signed!.payload_b64);
    bytes[bytes.length - 1]! ^= 1;
    edited.signed!.payload_b64 = toBase64(bytes);
    expect(
      statusOf(
        verifyEvidenceBundle(edited, { guardPubkeyB58: pubkey, chainBasket }),
        'basket hash recomputes',
      ),
    ).toBe('FAIL');
    const wrongKey = verifyEvidenceBundle(bundle, {
      guardPubkeyB58: '11111111111111111111111111111111',
      chainBasket,
    });
    expect(statusOf(wrongKey, 'Guard signature verifies')).toBe('FAIL');
  });

  it('FAILs when the chain disagrees, and SKIPs what it cannot check', async () => {
    const { bundle, chainBasket, pubkey } = await paidBasket();
    const r = verifyEvidenceBundle(bundle, {
      guardPubkeyB58: pubkey,
      chainBasket: { ...chainBasket!, total: '1' },
    });
    expect(statusOf(r, 'on-chain basket matches')).toBe('FAIL');
    const offline = verifyEvidenceBundle(bundle);
    expect(offline.ok).toBe(true);
    expect(offline.checks.filter((c) => c.status === 'SKIP').map((c) => c.name)).toEqual([
      'Guard signature verifies',
      'on-chain basket matches',
    ]);
  });
});
