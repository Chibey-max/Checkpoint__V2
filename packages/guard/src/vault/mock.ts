import {
  utcDayIndex,
  type VaultBalanceView,
  type VaultOwnerStateView,
  type VaultPolicyView,
} from '@checkpoint/shared';
import { VaultUnavailableError, type VaultViews } from './views';

export interface MockVaultOptions {
  policy?: Partial<VaultPolicyView>;
  /** Balance every owner has unless set with setBalance. */
  defaultAvailable?: bigint;
  /** Authorised agents every owner has unless set with setOwner. */
  defaultAgents?: string[];
  now?: () => number;
}

export const MOCK_VENDORS = ['01', '02', '03', '04', '06'].map((n) => `vendor-${n}.cpdemo.testnet`);

/**
 * In-memory Vault views for tests and local dev (GUARD_VAULT=mock). Mirrors
 * the PRD §7.1 setup: vendors 01–04 and 06 allowed, 500 cpUSD per basket,
 * 1,000 cpUSD per day, 4 vendors, 30-minute TTL.
 */
export class MockVaultViews implements VaultViews {
  policy: VaultPolicyView;
  down = false;
  private owners = new Map<string, VaultOwnerStateView>();
  private balances = new Map<string, VaultBalanceView>();
  private readonly defaultAvailable: bigint;
  private readonly defaultAgents: string[];
  private readonly now: () => number;

  constructor(opts: MockVaultOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.defaultAvailable = opts.defaultAvailable ?? 1_000_000_000n;
    this.defaultAgents = opts.defaultAgents ?? ['agent.cpdemo.testnet'];
    this.policy = {
      network_id: 'testnet',
      tokens: ['cpusd.cpdemo.testnet'],
      vendors: [...MOCK_VENDORS],
      max_basket_total: '500000000',
      daily_cap: '1000000000',
      max_vendors: 4,
      max_ttl_ms: 1_800_000,
      rules_hash: '0'.repeat(64),
      guard_pubkey: '',
      guard_key_version: 1,
      guard_key_disabled: false,
      guardian: 'guardian.cpdemo.testnet',
      dao_id: 'cpdemo.testnet',
      policy_version: 1,
      paused: false,
      deficit: false,
      ...opts.policy,
    };
  }

  private check(): void {
    if (this.down) throw new VaultUnavailableError('mock RPC is down');
  }

  setOwner(ownerId: string, state: Partial<VaultOwnerStateView>): void {
    this.owners.set(ownerId, { ...this.defaultOwner(), ...state });
  }

  setBalance(ownerId: string, tokenId: string, available: bigint): void {
    this.balances.set(`${ownerId}|${tokenId}`, {
      available: available.toString(),
      reserved: '0',
      withdrawing: '0',
    });
  }

  private defaultOwner(): VaultOwnerStateView {
    return {
      agents: [...this.defaultAgents],
      day: utcDayIndex(this.now()),
      spent_today: '0',
      max_basket: this.policy.max_basket_total,
      daily_cap: this.policy.daily_cap,
    };
  }

  async getPolicy(): Promise<VaultPolicyView> {
    this.check();
    return structuredClone(this.policy);
  }

  async getOwnerState(ownerId: string): Promise<VaultOwnerStateView> {
    this.check();
    return structuredClone(this.owners.get(ownerId) ?? this.defaultOwner());
  }

  async getBalance(ownerId: string, tokenId: string): Promise<VaultBalanceView> {
    this.check();
    return structuredClone(
      this.balances.get(`${ownerId}|${tokenId}`) ?? {
        available: this.defaultAvailable.toString(),
        reserved: '0',
        withdrawing: '0',
      },
    );
  }
}
