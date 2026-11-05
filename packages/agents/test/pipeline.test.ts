import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentEventSchema,
  basketHashHex,
  decodePayload,
  evidenceHashHex,
  fromBase64,
  fromHex,
  toHex,
  verifyBasketSignature,
  type AgentEvent,
} from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import { buildMock } from '../src/mock/build';
import { Store } from '../src/store';

const OWNER = 'owner-demo.cpdemo.testnet';
const DEMO =
  '2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 1 TB object storage for 1 month';
const NOW = Date.parse('2026-11-06T00:00:00Z');

function fast(over: Parameters<typeof buildMock>[0] = {}) {
  return buildMock({
    autoApproveMs: 20,
    settleMs: 0,
    researchDelayMs: 0,
    approvalPollMs: 5,
    settlementPollMs: 5,
    assessNowMs: NOW,
    ...over,
  });
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function create(app: ReturnType<typeof fast>['app'], text = DEMO): Promise<string> {
  const res = await app.request('/v1/requests', json({ owner_id: OWNER, text }));
  expect(res.status).toBe(201);
  return (await res.json()).request_id;
}

const types = (events: AgentEvent[]) => events.map((e) => e.type);

describe('agents pipeline end to end (mock chain, in-process Guard)', () => {
  it('list → offers → verdicts → basket → signature → approval → payouts, with vendor-06 failing safely (AT-01/AT-10 shape)', async () => {
    const { app, orch, signer } = fast();
    const id = await create(app);
    await orch.whenIdle(id);
    const events = orch.events(id);
    for (const e of events) expect(() => AgentEventSchema.parse(e)).not.toThrow();
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    const t = types(events);
    expect(t[0]).toBe('request.created');
    expect(t).toEqual(
      expect.arrayContaining([
        'research.parsed',
        'research.offer',
        'policy.verdict',
        'explain.verdict',
        'coordinator.basket',
        'guard.signed',
        'explain.basket',
        'approval.waiting',
        'approval.seen',
        'settlement.submitted',
        'settlement.payout',
        'settlement.final',
      ]),
    );
    expect(t.indexOf('guard.signed')).toBeLessThan(t.indexOf('approval.waiting'));
    expect(t.indexOf('approval.seen')).toBeLessThan(t.indexOf('settlement.submitted'));

    const view = (await (await app.request(`/v1/requests/${id}`)).json()) as ReturnType<
      typeof orch.view
    >;
    expect(view.state).toBe('final');
    expect(view.settlement.final_status).toBe('PartiallyPaid');
    expect(view.settlement.payouts.map((p) => [p.vendor_id, p.status])).toEqual([
      ['vendor-02.cpdemo.testnet', 'Completed'],
      ['vendor-04.cpdemo.testnet', 'Completed'],
      ['vendor-06.cpdemo.testnet', 'Failed'],
    ]);

    // The UI's local check: decode the payload, recompute the hash, verify Guard's signature.
    const signed = view.signed!;
    const bytes = fromBase64(signed.payload_b64);
    expect(basketHashHex(bytes)).toBe(signed.hash_hex);
    expect(
      verifyBasketSignature(
        fromBase64(signed.signature_b64),
        fromHex(signed.hash_hex),
        signer.publicKey,
      ),
    ).toBe(true);
    expect(decodePayload(bytes).total).toBe(38_980_000n);

    // Audit bundle: evidence_hash recomputes and is the one inside the signed payload (FR-AG09).
    const bundle = await (await app.request(`/v1/audit/${view.basket!.basket_id}`)).json();
    expect(evidenceHashHex(bundle.core)).toBe(bundle.evidence_hash);
    expect(toHex(decodePayload(bytes).evidence_hash)).toBe(bundle.evidence_hash);
    expect(bundle.chain.final_status).toBe('PartiallyPaid');
    expect(bundle.chain.execute_tx).toBeTruthy();
  });

  it('streams events over SSE and replays from Last-Event-ID (FR-AG02)', async () => {
    const { app, orch } = fast();
    const id = await create(app);
    await orch.whenIdle(id);
    const total = orch.events(id).length;
    const res = await app.request(`/v1/requests/${id}/events`, {
      headers: { 'last-event-id': '3' },
    });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    while ((text.match(/^id: /gm) ?? []).length < total - 3) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value);
    }
    await reader.cancel();
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids[0]).toBe(4);
    expect(ids).toEqual(Array.from({ length: total - 3 }, (_, i) => i + 4));
    expect(text).toMatch(/^event: research\.offer$/m);
    expect(text).not.toMatch(/^event: request\.created$/m); // seq 1 is before Last-Event-ID
  });

  it('acknowledging a REVIEW offer re-plans and re-signs a new exact basket', async () => {
    const { app, orch, chain } = fast({ autoApproveMs: 0 });
    const id = await create(app);
    // Wait for the first signature, then acknowledge the unusually cheap storage offer.
    for (let i = 0; i < 200 && orch.view(id).state !== 'awaiting_approval'; i++)
      await new Promise((r) => setTimeout(r, 5));
    const first = orch.view(id);
    expect(first.basket!.lines.find((l) => l.item_key === 'storage-1tb-month')!.offer_id).toBe(
      'sto-d',
    );
    const ack = await app.request(`/v1/requests/${id}/acknowledge`, json({ offer_ids: ['sto-b'] }));
    expect(ack.status).toBe(202);
    for (
      let i = 0;
      i < 200 &&
      (orch.view(id).signed?.hash_hex ?? first.signed!.hash_hex) === first.signed!.hash_hex;
      i++
    )
      await new Promise((r) => setTimeout(r, 5));
    const second = orch.view(id);
    expect(second.basket!.lines.find((l) => l.item_key === 'storage-1tb-month')!.offer_id).toBe(
      'sto-b',
    );
    expect(second.signed!.hash_hex).not.toBe(first.signed!.hash_hex);
    expect(second.signed!.findings.map((f) => f.rule_id)).toEqual(['R-07']);
    // Approve the new hash from the "wallet" and let it settle.
    chain.approve(second.signed!.hash_hex, OWNER, second.signed!.expires_at_ms);
    await orch.whenIdle(id);
    expect(orch.view(id).state).toBe('final');
    // Acknowledging a non-REVIEW offer is rejected.
    expect(
      (await app.request(`/v1/requests/${id}/acknowledge`, json({ offer_ids: ['vps-b'] }))).status,
    ).toBe(409);
  });

  it('AT-14: Guard unavailable → error event, request refused, no signature', async () => {
    const { app, orch, vault } = fast();
    vault.down = true;
    const id = await create(app);
    await orch.whenIdle(id);
    const view = orch.view(id);
    expect(view.state).toBe('refused');
    expect(view.signed).toBeNull();
    expect(view.errors.map((e) => e.code)).toContain('GUARD_UNAVAILABLE');
  });

  it('Guard refuses an over-cap basket with findings (guard.refused)', async () => {
    const { app, orch, vault } = fast();
    vault.setOwner(OWNER, { max_basket: '1000000' });
    const id = await create(app);
    await orch.whenIdle(id);
    const view = orch.view(id);
    expect(view.state).toBe('refused');
    expect(view.refusal!.findings.map((f) => f.rule_id)).toEqual(['R-20']);
  });

  it('no approval before expiry → approval.expired', async () => {
    const { app, orch } = fast({ autoApproveMs: 0, ttlMs: 60 });
    const id = await create(app);
    await orch.whenIdle(id);
    expect(types(orch.events(id))).toContain('approval.expired');
    expect(orch.view(id).state).toBe('expired');
  });

  it('cancel stops the watcher and tells the owner to revoke if they approved', async () => {
    const { app, orch } = fast({ autoApproveMs: 0 });
    const id = await create(app);
    for (let i = 0; i < 200 && orch.view(id).state !== 'awaiting_approval'; i++)
      await new Promise((r) => setTimeout(r, 5));
    expect((await app.request(`/v1/requests/${id}/cancel`, { method: 'POST' })).status).toBe(200);
    await orch.whenIdle(id);
    const view = orch.view(id);
    expect(view.state).toBe('cancelled');
    expect(view.errors.at(-1)!.message).toMatch(/revoke/);
  });

  it('AT-13: an injected listing changes nothing: rules decide and the basket is unaffected', async () => {
    const { app, orch } = fast();
    const id = await create(app, '1 transactional email');
    await orch.whenIdle(id);
    const view = orch.view(id);
    expect(view.items).toEqual([{ item_key: 'email-10k-month', qty: 1 }]);
    expect(view.verdicts['eml-inject']!.level).toBe('BLOCK');
    expect(view.basket!.lines.map((l) => l.vendor_id)).not.toContain('vendor-05.cpdemo.testnet');
    expect(view.explanations.verdicts['eml-inject']!.text).not.toMatch(/ignore all rules/i);
  });

  it('nothing matched → refused with research.unmatched', async () => {
    const { app, orch } = fast();
    const id = await create(app, 'a unicorn');
    await orch.whenIdle(id);
    expect(types(orch.events(id))).toEqual([
      'request.created',
      'research.parsed',
      'research.unmatched',
      'error',
    ]);
    expect(orch.view(id).state).toBe('refused');
  });

  it('validates input, 404s unknown requests, lists by owner and serves the catalogue', async () => {
    const { app } = fast();
    expect(
      (await app.request('/v1/requests', json({ owner_id: 'NOT VALID', text: 'x' }))).status,
    ).toBe(400);
    expect((await app.request('/v1/requests/00000000-0000-4000-8000-000000000000')).status).toBe(
      404,
    );
    await create(app, 'a vps');
    const list = await (await app.request(`/v1/requests?owner_id=${OWNER}`)).json();
    expect(list.requests).toHaveLength(1);
    expect((await (await app.request('/v1/catalog')).json()).items).toHaveLength(4);
  });
});

describe('store (FR-AG01: requests survive a restart)', () => {
  it('events and bundles persist across reopen', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cp-agents-')), 'agents.sqlite');
    const a = fast({ dbPath: path });
    const id = await create(a.app);
    await a.orch.whenIdle(id);
    const before = a.orch.view(id);
    const reopened = new Store(path);
    expect(reopened.listEvents(id)).toHaveLength(before.last_seq);
    expect(reopened.getBundle(before.basket!.basket_id)!.evidence_hash).toBe(
      before.basket!.evidence_hash,
    );
    reopened.close();
  });
});
