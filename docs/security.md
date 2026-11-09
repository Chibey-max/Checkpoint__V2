# Security checklist and permission inventory (I-6.2, FR-G06)

As of 9 Nov 2026, testnet, Vault policy v2. Re-check against `near account list-keys` and `get_policy` before the freeze (I-7.1).

## Who can call what on the Vault

| Method | Caller | Deposit | Notes |
|---|---|---|---|
| `new(config)` | deployer, once | 0 | `#[init]` refuses a second call |
| `ft_on_transfer` | an allowlisted token | 0 | Credits `sender_id` only. Unknown tokens, a zero amount or a flagged deficit are refunded in full. |
| `withdraw(token_id, amount)` | the owner | exactly 1 yocto | Allowed while paused, refused during a deficit. Funds move to `withdrawing`, then the callback settles or restores them. |
| `set_agent`, `set_owner_limits` | the owner (must have deposited) | exactly 1 yocto | ≤ 3 agents. Owner limits are ≤ the global ones. |
| `approve_basket`, `revoke_approval` | the owner (must have deposited) | exactly 1 yocto | 1 yocto means a dapp's function-call key can't approve. Expiry must be ≤ now + max TTL. |
| `execute_basket(payload_b64, signature_b64)` | the owner's authorised agent | 0 | The function-call key path. Every check (FR-A04–A09) runs before any state change. |
| `on_payout`, `on_withdraw`, `on_solvency` | the Vault itself | 0 | `#[private]`. Only `Executing → final` is allowed (`ERR_BAD_STATE`). |
| `check_solvency(token_id)` | anyone | 0 | Can only set `deficit` + `paused`. Skips if balances moved during the check. |
| `set_vendor`, `set_token`, `set_limits`, `set_rules_hash`, `set_guard_key`, `set_guardian`, `transfer_admin` | `dao_id` | exactly 1 yocto | Each bumps `policy_version` and emits `policy_updated`. FR-G03 bounds are hard-coded. |
| `unpause`, `clear_deficit`, `resolve_stuck_payout` | `dao_id` | exactly 1 yocto | `unpause` is refused while a deficit is flagged. `resolve_stuck_payout` only works on payouts still Executing after 10 min or more. |
| `emergency_pause(reason)`, `disable_guard_key()` | guardian or `dao_id` | exactly 1 yocto | The guardian has no other power: unpause and setters fail `ERR_NOT_DAO`. |
| views | anyone | – | `get_policy`, `get_status`, `get_balance`, `get_owner_state`, `get_liabilities`, `get_approval`, `get_basket`, `get_baskets` |

`dao_id` is **`cpdemo.testnet`** until the hand-over to `checkpoint-council.sputnik-v2.testnet` (I-0.5 / I-5.1).

## Access keys (testnet, 9 Nov)

| Account | Keys | Plan |
|---|---|---|
| `vault.cpdemo.testnet` | 1 full access (`ed25519:2omt…VT9b`) | **Remove it after the DAO hand-over (D-08).** After that the code can't be redeployed without a DAO-approved path, and the README must say so. |
| `cpusd.cpdemo.testnet` | 1 full access | Token owner (mint). Test token, no value. |
| `agent.cpdemo.testnet` | Function-call key `ed25519:719F…FREG`: receiver `vault.cpdemo.testnet`, methods `execute_basket` only, 1 NEAR allowance (0.98 left). Plus 1 full access, kept offline. | The function-call key lives in the agents' `.env`. AT-08 shows it can't call anything else or attach deposits. |
| `guardian.cpdemo.testnet` | 1 full access | Pause and disable-key only |
| `owner-demo.cpdemo.testnet` | 1 full access | Demo owner. Approvals need this key, not a function-call key. |
| `cpdemo.testnet` | 1 full access | Root of the account tree, and the Vault admin until the hand-over |

All the full-access keys are currently in one person's `~/.near-credentials/testnet/`. **Copy them to the team password manager.**

Sputnik factory upgrade setting: to fill in when the DAO is created (I-0.5).

## Checklist

| Item | Status | Where |
|---|---|---|
| Checks, then effects, then interactions in `execute_basket` (INV-5) | ✅ | `execute.rs`. Table-driven test shows every ERR_ path leaves state unchanged. |
| Balances only move through the `bal_*` helpers, which keep liabilities and in-flight in step (INV-1) | ✅ | `state.rs`. INV-1 is asserted in unit tests, sandbox tests and `pnpm demo:sandbox`. |
| Callbacks are `#[private]`, read promise results bounded (16 bytes), and don't unwrap external data | ✅ | `deposits.rs` `transfer_succeeded` |
| Payouts are independent promise chains; one bad vendor doesn't block the others | ✅ | AT-10 in the sandbox, `demo:sandbox` and on testnet |
| Replay protection: hash used once, approval consumed (INV-3) | ✅ | AT-06 |
| A replay is checked before the approval, so it is reported correctly | ✅ | decisions-pending #18 |
| Exact 1 yocto on every owner/admin action (no function-call-key approvals) | ✅ | `assert_one_yocto` |
| Overflow: release builds keep `overflow-checks = true`; sums are checked | ✅ | root `Cargo.toml`, `ERR_TOTAL_MISMATCH` |
| Storage griefing: owner actions need a prior deposit | ✅ | `ERR_UNKNOWN_OWNER` (decisions-pending #17) |
| The Vault re-checks caps, vendors and token, even if Guard is wrong | ✅ | AT-04 and AT-09 on testnet |
| Guard fails closed: RPC down or a policy/rules mismatch → 503, no signature | ✅ | AT-14 in tests, the sandbox and the 9 Nov gate (live RPC drop) |
| Guard: rate limit 30/min/IP, request IDs, secret redaction in logs | ✅ | `packages/guard` (D-5.3) |
| LLM can't choose offers, vendors or amounts; output is schema-validated and number-checked | ✅ | AT-13 |
| No secrets in git (gitleaks in pre-commit and CI over full history) | ✅ | CI `secrets` job |
| Agents API has no auth (anyone can open a request for any owner) | ⚠️ accepted | Nothing moves without the owner's on-chain approval. Listed as a limitation. |
| Vault full-access key still present | ⚠️ open | Remove after the hand-over (D-08) |
| Reconciliation can't tell a deficit from in-flight transfers; it is conservative | ⚠️ documented | decisions-pending #23 |
| Callback out-of-gas path tested only in unit tests | ⚠️ open | AT-19. A sandbox test is still to write. |

## Contract limitations (for the README, I-8.2)

- **One token in practice.** The allowlist holds any NEP-141, but amounts and caps are in that token's base units, with no price conversion. The demo uses cpUSD (6 decimals).
- **`ft_transfer` must be atomic in the token** (a panic moves nothing). That holds for cpUSD and for tokens we review. A token that takes funds and then fails would break FR-S05's restore.
- **Deposits only credit the sender.** `msg` is ignored in v1.
- **An expired approval reports `ERR_EXPIRED`**, not `ERR_NO_APPROVAL`.
- **Reconciliation** skips when balances move during the check, and treats in-flight funds conservatively.
- **A stuck payout** (callback out of gas) needs a DAO vote, `resolve_stuck_payout`, at least 10 minutes later.
- **Testnet only.** Mainnet is refused by Guard and the agents (NFR-02).
