/**
 * In-memory stand-in for the Vault, the owner's wallet and the Settlement
 * Agent, for the mock server and tests only. It decodes the real payload
 * bytes, so the UI sees the same hashes and amounts it would on testnet.
 */
import { randomBytes } from 'node:crypto';
import {
  basketHashHex,
  decodePayload,
  fromBase64,
  toBase58,
  type VaultBasketView,
} from '@checkpoint/shared';
import { ChainError, type ApprovalView, type Settlement, type VaultChain } from './types';

export interface MockChainOptions {
  /** Auto-approve each new basket after this delay (simulates the owner's wallet). 0 = never. */
  autoApproveMs?: number;
  /** Vendors whose transfer fails, like vendor-06 not being registered on cpUSD (AT-10). */
  failingVendors?: string[];
  /** Delay before payouts settle. */
  settleMs?: number;
  maxVendors?: number;
  now?: () => number;
}

export class MockChain implements VaultChain, Settlement {
  private approvals = new Map<string, ApprovalView>();
  private baskets = new Map<string, VaultBasketView>();
  private watched = new Set<string>();
  down = false;
  readonly opts: Required<MockChainOptions>;

  constructor(opts: MockChainOptions = {}) {
    this.opts = {
      autoApproveMs: opts.autoApproveMs ?? 0,
      failingVendors: opts.failingVendors ?? ['vendor-06.cpdemo.testnet'],
      settleMs: opts.settleMs ?? 0,
      maxVendors: opts.maxVendors ?? 4,
      now: opts.now ?? Date.now,
    };
  }

  private check(): void {
    if (this.down) throw new ChainError('mock RPC is down');
  }

  /** What the owner's wallet does: approve_basket(hash, expires_at_ms). */
  approve(hashHex: string, owner: string, expiresAtMs: number): void {
    this.approvals.set(hashHex, { owner, expires_at_ms: expiresAtMs });
  }

  /** Called by the orchestrator when it starts watching a hash; drives auto-approval. */
  watch(hashHex: string, owner: string, expiresAtMs: number): void {
    if (this.watched.has(hashHex) || this.opts.autoApproveMs <= 0) return;
    this.watched.add(hashHex);
    setTimeout(() => this.approve(hashHex, owner, expiresAtMs), this.opts.autoApproveMs).unref?.();
  }

  async getApproval(hashHex: string): Promise<ApprovalView | null> {
    this.check();
    const a = this.approvals.get(hashHex);
    return a && a.expires_at_ms > this.opts.now() ? { ...a } : null;
  }

  async getBasket(hashHex: string): Promise<VaultBasketView | null> {
    this.check();
    const b = this.baskets.get(hashHex);
    return b ? structuredClone(b) : null;
  }

  async getMaxVendors(): Promise<number> {
    this.check();
    return this.opts.maxVendors;
  }

  /** Settlement Agent stand-in: the checks a Vault would make that matter for the demo, then payouts. */
  async execute(payloadB64: string, _signatureB64: string): Promise<{ tx_hash: string }> {
    this.check();
    const bytes = fromBase64(payloadB64);
    const p = decodePayload(bytes);
    const hash = basketHashHex(bytes);
    if (this.baskets.has(hash)) throw new ChainError('Smart contract panicked: ERR_ALREADY_USED');
    const approval = this.approvals.get(hash);
    if (!approval || approval.owner !== p.owner_id)
      throw new ChainError('Smart contract panicked: ERR_NO_APPROVAL');
    if (BigInt(this.opts.now()) >= p.expires_at_ms)
      throw new ChainError('Smart contract panicked: ERR_EXPIRED');
    this.approvals.delete(hash);
    const basket: VaultBasketView = {
      hash,
      basket_id: p.basket_id,
      owner: p.owner_id,
      agent: p.agent_id,
      token: p.token_id,
      total: p.total.toString(),
      evidence_hash: Buffer.from(p.evidence_hash).toString('hex'),
      status: 'Executing',
      created_at_ms: this.opts.now(),
      payouts: p.payouts.map((po) => ({
        vendor: po.vendor_id,
        amount: po.amount.toString(),
        status: 'Executing' as const,
      })),
    };
    this.baskets.set(hash, basket);
    const settle = () => {
      for (const po of basket.payouts)
        po.status = this.opts.failingVendors.includes(po.vendor) ? 'Failed' : 'Completed';
      const ok = basket.payouts.filter((x) => x.status === 'Completed').length;
      basket.status =
        ok === basket.payouts.length ? 'Completed' : ok === 0 ? 'Failed' : 'PartiallyPaid';
    };
    if (this.opts.settleMs > 0) setTimeout(settle, this.opts.settleMs).unref?.();
    else settle();
    return { tx_hash: toBase58(randomBytes(32)) };
  }
}
