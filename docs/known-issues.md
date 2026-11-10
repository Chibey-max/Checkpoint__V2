# Known issues and integration fixes (D-4.1 scratch log)

Found while wiring Guard and the agents to the real Vault (testnet on 6–7 Nov, local sandbox on 7 Nov). Fixed items stay listed so the history is clear.

## Open

| Issue | Impact | Workaround / owner |
|---|---|---|
| `cpdemo.testnet` keys live on one machine | All the testnet signing keys are in David's `~/.near-credentials/testnet/` | Copy them to the team password manager. **David** |
| The demo list always ends PartiallyPaid | Vendor-06 (unregistered, AT-10) wins storage | Intended (decisions-pending #6). Use the AT-01 list in [gate-dry-run.md](gate-dry-run.md) for "all Completed". |
| Groq latency varies | Request → signed basket with the LLM on: median 8 s, max 10.8 s (NFR-07 limit 20 s) | Record with the cache warm, or fall back to `LLM_PROVIDER=none` (D-8.1). |

## Fixed

| Issue | Fix |
|---|---|
| The public RPC dropped calls during the gate (Guard failed closed with `GUARD_UNAVAILABLE`) | `.env` uses FastNEAR (about 0.9 s against 3.9 s); `viewFunction` retries a network failure once. Proposed for D-04. |
| Testnet NEAR was short | A faucet top-up (9 Nov) paid for the DAO (6 NEAR). The Vault now holds 6 NEAR, about 3 free (FR-V09); the root has 1.5. |
| The agent account ran out of NEAR (each `execute_basket` reserves 300 TGas up front) | Topped up to 2.49 NEAR on 9 Nov. Watch it before demos. |
| LLM explanations held up signing and the approval prompt. Under Groq load a request sat in `signed` for over 60 s. | Explanations now stream in afterwards and never block planning or signing (`orchestrator.ts`). |
| near-workspaces JS 5.0 runs nearcore 2.6.2 (protocol 77), which rejects rustc 1.87+ wasm (`PrepareWasmError: Deserialization`) | `pnpm demo:sandbox` runs the official near-sandbox 2.14 binary directly (`scripts/lib/sandbox.ts`), the same version the Rust tests use |
| `cargo install cargo-near` fails on CI runners (`hidapi` needs libudev) | CI and clean machines build the wasm with plain cargo and `--cfg near` (`CONTRACTS_BUILD=cargo`). cargo-near is only needed for testnet deploys. |
| The Vault on testnet didn't match the repo (`pnpm freeze:check`): it was built minutes before the source was formatted and committed, and line numbers are compiled into panic messages | Redeployed from the repo on 9 Nov (code only, state kept); both contracts now MATCH. A live payout and AT-04 were re-run afterwards. |
| Council keys were all on one machine | Patrick's seat now uses his own key (10 Nov); Isaac's seat was removed when the team became David and Patrick (proposal 2). The council is 2 of 2. |
| The first cold run on Debian bookworm failed: near-sandbox 2.14 needs glibc 2.39 | The cold-run image is Ubuntu 24.04 (same as CI). The script names the requirement when the sandbox can't start. |
| CI `contracts` job had a job-level `hashFiles()`, which GitHub doesn't support there | Removed, now that `contracts/` exists |
| The captured snapshot failed validation (decision #5) | Patrick relabelled the fixture rows. The CI snapshot check is blocking again. |
