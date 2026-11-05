import type { GuardConfig } from './config';
import type { Logger } from './logger';
import { GuardService } from './service';
import { MockVaultViews } from './vault/mock';
import { RpcVaultViews, type VaultViews } from './vault/views';

/** Wire a GuardService from config. Mock mode builds a Vault that agrees with this Guard. */
export function buildGuardService(
  cfg: GuardConfig,
  logger: Logger,
): { service: GuardService; vault: VaultViews } {
  const vault: VaultViews =
    cfg.vaultMode === 'mock'
      ? new MockVaultViews({
          policy: {
            network_id: cfg.network,
            tokens: [cfg.tokenId],
            rules_hash: cfg.rulesHash,
            guard_pubkey: cfg.signer.publicKeyB58,
            guard_key_version: cfg.guardKeyVersion,
          },
        })
      : new RpcVaultViews(cfg.rpcUrl, cfg.vaultId);
  const service = new GuardService({
    rules: cfg.rules,
    rulesHash: cfg.rulesHash,
    catalog: cfg.snapshot.catalog,
    offers: cfg.snapshot.offers,
    vault,
    signer: cfg.signer,
    networkId: cfg.network,
    vaultId: cfg.vaultId,
    guardKeyVersion: cfg.guardKeyVersion,
    dev: cfg.dev,
    ...(cfg.assessNowMs !== null ? { assessNow: () => cfg.assessNowMs! } : {}),
    logger,
  });
  return { service, vault };
}
