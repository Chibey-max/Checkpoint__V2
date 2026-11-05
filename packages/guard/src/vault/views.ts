import {
  RpcError,
  VaultBalanceViewSchema,
  VaultOwnerStateViewSchema,
  VaultPolicyViewSchema,
  viewFunction,
  type VaultBalanceView,
  type VaultOwnerStateView,
  type VaultPolicyView,
} from '@checkpoint/shared';

/** Read-only Vault views Guard needs. Injected so the same code runs on mock, sandbox and testnet. */
export interface VaultViews {
  getPolicy(): Promise<VaultPolicyView>;
  getOwnerState(ownerId: string): Promise<VaultOwnerStateView>;
  getBalance(ownerId: string, tokenId: string): Promise<VaultBalanceView>;
}

/** Any failure to read the Vault. Guard fails closed on it (FR-R07, HTTP 503). */
export class VaultUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultUnavailableError';
  }
}

export class RpcVaultViews implements VaultViews {
  constructor(
    private readonly rpcUrl: string,
    private readonly vaultId: string,
    private readonly timeoutMs = 8_000,
  ) {}

  private async view<T>(
    method: string,
    args: Record<string, unknown>,
    parse: (v: unknown) => T,
  ): Promise<T> {
    let raw: unknown;
    try {
      raw = await viewFunction(this.rpcUrl, this.vaultId, method, args, {
        timeoutMs: this.timeoutMs,
      });
    } catch (e) {
      throw new VaultUnavailableError(e instanceof RpcError ? e.message : `view ${method} failed`);
    }
    try {
      return parse(raw);
    } catch (e) {
      throw new VaultUnavailableError(
        `view ${method} returned an unexpected shape: ${(e as Error).message}`,
      );
    }
  }

  getPolicy(): Promise<VaultPolicyView> {
    return this.view('get_policy', {}, (v) => VaultPolicyViewSchema.parse(v));
  }

  getOwnerState(ownerId: string): Promise<VaultOwnerStateView> {
    return this.view('get_owner_state', { owner_id: ownerId }, (v) =>
      VaultOwnerStateViewSchema.parse(v),
    );
  }

  getBalance(ownerId: string, tokenId: string): Promise<VaultBalanceView> {
    return this.view('get_balance', { owner_id: ownerId, token_id: tokenId }, (v) =>
      VaultBalanceViewSchema.parse(v),
    );
  }
}
