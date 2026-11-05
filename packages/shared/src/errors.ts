/** Stable Vault error codes (PRD §11.1) with one-line plain-language messages for the UI. */
export const VAULT_ERRORS = {
  ERR_PAUSED: 'The Vault is paused. New baskets cannot be approved or executed.',
  ERR_DECODE: 'The basket payload could not be decoded.',
  ERR_BAD_SIGNATURE: "Guard's signature does not match this exact basket.",
  ERR_KEY_VERSION: 'The basket was signed with an old or disabled Guard key.',
  ERR_NETWORK: 'The basket was signed for a different network.',
  ERR_VAULT_ID: 'The basket was signed for a different Vault.',
  ERR_POLICY_VERSION: 'The policy changed after this basket was signed.',
  ERR_RULES_HASH: "The basket was checked under different rules than the Vault's.",
  ERR_AGENT_MISMATCH: 'This agent is not the one named in the basket.',
  ERR_AGENT_NOT_AUTHORISED: 'The owner has not authorised this agent.',
  ERR_NO_APPROVAL: 'The owner has not approved this exact basket.',
  ERR_EXPIRED: 'The basket or its approval has expired.',
  ERR_TTL: "The basket's lifetime is longer than the Vault allows.",
  ERR_ALREADY_USED: 'This basket was already paid.',
  ERR_TOKEN: 'This token is not on the Vault allowlist.',
  ERR_VENDOR: 'A vendor in this basket is not on the Vault allowlist.',
  ERR_DUP_VENDOR: 'A vendor appears more than once in this basket.',
  ERR_PAYOUT_COUNT: 'The basket has too many or too few vendors.',
  ERR_ZERO_AMOUNT: 'A payout amount is zero.',
  ERR_TOTAL_MISMATCH: 'The payouts do not add up to the basket total.',
  ERR_OVER_BASKET_CAP: 'The basket total is above the per-basket cap.',
  ERR_OVER_DAILY_CAP: "This basket would exceed today's spending cap.",
  ERR_INSUFFICIENT_AVAILABLE: 'Not enough available balance in the Vault.',
  ERR_GAS: 'Not enough gas was attached to pay every vendor.',
  ERR_BAD_STATE: 'This payout was already settled.',
  ERR_NOT_DAO: 'Only the DAO can make this change.',
  ERR_NOT_GUARDIAN: 'Only the guardian or the DAO can do this.',
  ERR_BOUNDS: 'The new value is outside the limits hard-coded in the Vault.',
  ERR_DEFICIT: 'The Vault found a deficit and is paused until the DAO clears it.',
} as const;

export type VaultErrorCode = keyof typeof VAULT_ERRORS;

/** Find the first ERR_ code in a contract error string and map it to a message. */
export function explainVaultError(raw: string): { code: VaultErrorCode | null; message: string } {
  const m = /ERR_[A-Z_]+/.exec(raw);
  const code = m && m[0] in VAULT_ERRORS ? (m[0] as VaultErrorCode) : null;
  return { code, message: code ? VAULT_ERRORS[code] : raw };
}
