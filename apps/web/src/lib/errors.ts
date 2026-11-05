/**
 * Vault error constants (PRD §11.1, frozen) → one plain-language line each.
 * Contract panics arrive wrapped in RPC error text, so we search for the code rather than matching exactly.
 */
export const VAULT_ERRORS = {
  ERR_PAUSED: "The Vault is paused by the guardian. Approvals and payments are stopped until the DAO unpauses it.",
  ERR_DECODE: "The basket data couldn't be read. Ask the desk to rebuild the basket.",
  ERR_BAD_SIGNATURE: "Guard's signature doesn't match this basket, so it may have been changed after it was checked.",
  ERR_KEY_VERSION: "This basket was signed with a Guard key the Vault no longer accepts.",
  ERR_NETWORK: "This basket was built for a different network.",
  ERR_VAULT_ID: "This basket was built for a different Vault.",
  ERR_POLICY_VERSION: "The Vault's policy changed after this basket was signed. Build a new basket.",
  ERR_RULES_HASH: "Guard used rules that don't match the rules published on-chain.",
  ERR_AGENT_MISMATCH: "A different agent tried to execute this basket than the one named in it.",
  ERR_AGENT_NOT_AUTHORISED: "You haven't authorised this agent. Turn it on in the Vault page first.",
  ERR_NO_APPROVAL: "There's no approval for this exact basket. Approve it from your wallet first.",
  ERR_EXPIRED: "This basket or its approval has expired. Build a new one.",
  ERR_TTL: "The approval's expiry is too far in the future for the Vault's policy.",
  ERR_ALREADY_USED: "This basket has already been paid. It can't be paid twice.",
  ERR_TOKEN: "That token isn't on the Vault's allowlist.",
  ERR_VENDOR: "A vendor in this basket isn't on the Vault's allowlist.",
  ERR_DUP_VENDOR: "The basket lists the same vendor twice.",
  ERR_PAYOUT_COUNT: "The basket has more vendors than the policy allows.",
  ERR_ZERO_AMOUNT: "An amount in the basket is zero.",
  ERR_TOTAL_MISMATCH: "The basket total doesn't equal the sum of its payouts.",
  ERR_OVER_BASKET_CAP: "This basket is above your per-basket limit.",
  ERR_OVER_DAILY_CAP: "This basket would take you over today's spending limit.",
  ERR_INSUFFICIENT_AVAILABLE: "Not enough available cpUSD in your Vault. Deposit more or wait for other payments to settle.",
  ERR_GAS: "Not enough gas was attached. Try again.",
  ERR_BAD_STATE: "That action isn't possible in the payment's current state.",
  ERR_NOT_DAO: "Only the DAO can do that.",
  ERR_NOT_GUARDIAN: "Only the guardian can do that.",
  ERR_BOUNDS: "That value is outside the limits hard-coded in the contract.",
  ERR_DEFICIT: "The Vault found less cpUSD than it owes and has stopped deposits and withdrawals until the DAO resolves it.",
} as const;

export type VaultErrorCode = keyof typeof VAULT_ERRORS;

const CODE_RE = new RegExp(`\\b(${Object.keys(VAULT_ERRORS).sort((a, b) => b.length - a.length).join("|")})\\b`);

/** Returns the Vault error code inside any thrown value or RPC message, if there is one. */
export function vaultErrorCode(err: unknown): VaultErrorCode | null {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify(err)}` : typeof err === "string" ? err : JSON.stringify(err ?? "");
  const m = CODE_RE.exec(text);
  return m ? (m[1] as VaultErrorCode) : null;
}

/** One line a person can act on. Wallet rejections are not errors worth alarming about. */
export function humanError(err: unknown): string {
  const code = vaultErrorCode(err);
  if (code) return VAULT_ERRORS[code];
  const text = err instanceof Error ? err.message : String(err);
  if (/reject|denied|cancel/i.test(text)) return "You cancelled the request in your wallet.";
  if (/not enough balance|NotEnoughBalance|LackBalanceForState/i.test(text)) return "Your account doesn't have enough NEAR for this transaction.";
  if (/fetch|network|ECONN|timeout/i.test(text)) return "Couldn't reach the NEAR network. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}
