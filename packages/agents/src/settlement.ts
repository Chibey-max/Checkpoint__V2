/**
 * Settlement Agent module: OWNED BY ISAAC (task I-3.3, handoff H9).
 *
 * This placeholder fixes the interface the orchestrator calls. Replace the body
 * of createSettlement with the near-api-js signer that uses AGENT_FC_PRIVATE_KEY
 * (function-call key: receiver VAULT_ID, method execute_basket only) and sends
 * execute_basket(payload_b64, signature_b64) with 300 TGas and 0 deposit.
 * Return the transaction hash. Throw an Error whose message contains the Vault's
 * ERR_ code on failure; the orchestrator maps it to plain language.
 */
import type { Settlement } from './chain/types';

export interface SettlementConfig {
  rpcUrl: string;
  vaultId: string;
  agentAccountId: string;
  agentFcPrivateKey: string | undefined;
}

export function createSettlement(_cfg: SettlementConfig): Settlement {
  return {
    async execute() {
      throw new Error(
        'Settlement module is not wired yet (task I-3.3 / handoff H9). Use AGENTS_CHAIN=mock for local runs.',
      );
    },
  };
}
