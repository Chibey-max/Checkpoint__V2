import {
  RpcError,
  VaultApprovalViewSchema,
  VaultBasketViewSchema,
  VaultPolicyViewSchema,
  viewFunction,
  type VaultBasketView,
} from '@checkpoint/shared';
import { ChainError, type ApprovalView, type VaultChain } from './types';

/** Vault views over NEAR JSON-RPC. View names and args follow PRD FR-S09 (see docs/api.md). */
export class RpcVaultChain implements VaultChain {
  constructor(
    private readonly rpcUrl: string,
    private readonly vaultId: string,
  ) {}

  private async view(method: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await viewFunction(this.rpcUrl, this.vaultId, method, args);
    } catch (e) {
      throw new ChainError(e instanceof RpcError ? e.message : `${method} failed`);
    }
  }

  async getApproval(hashHex: string): Promise<ApprovalView | null> {
    const raw = await this.view('get_approval', { hash_hex: hashHex });
    if (raw === null) return null;
    const a = VaultApprovalViewSchema.parse(raw);
    return { owner: a.owner, expires_at_ms: Number(a.expires_at_ms) };
  }

  async getBasket(hashHex: string): Promise<VaultBasketView | null> {
    const raw = await this.view('get_basket', { hash_hex: hashHex });
    return raw === null ? null : VaultBasketViewSchema.parse(raw);
  }

  async getMaxVendors(): Promise<number> {
    return VaultPolicyViewSchema.parse(await this.view('get_policy', {})).max_vendors;
  }
}
