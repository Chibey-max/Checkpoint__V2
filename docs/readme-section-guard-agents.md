# Draft README section: Guard and agents (for Patrick to merge, D-7.1)

> Drop-in text for the master README. The commands below already work today; the sandbox and testnet commands are listed in the README's own "Getting started".

### Try the agents with no keys and no chain

```bash
pnpm install
pnpm mock            # agents API on :8788 with Guard in-process and synthetic fixture offers
```

In another terminal:

```bash
curl -s -XPOST localhost:8788/v1/requests -H 'content-type: application/json' \
  -d '{"owner_id":"owner-demo.cpdemo.testnet","text":"2x VPS, 1 .com domain, 1 TB object storage"}'
curl -N localhost:8788/v1/requests/<request_id>/events     # live agent timeline (SSE)
```

Within about 10 s you will see offers, verdicts (one overpriced offer and one unlisted vendor blocked, one unusually cheap offer flagged for review), a basket, Guard's signature, a simulated wallet approval, and payouts where vendor-06's transfer fails safely.

### Run the whole loop on a local NEAR sandbox (no keys)

You need Rust (any recent stable; `rust-toolchain.toml` pins 1.96 with the wasm target), Node 22 and pnpm 9, on Linux x86-64 with glibc 2.39+ (Ubuntu 24.04 or newer) or an Apple Silicon Mac. The `near-sandbox` 2.14 binary needs that glibc.

```bash
pnpm install
pnpm demo:sandbox
```

The first run builds the contracts with plain cargo and downloads the `near-sandbox` 2.14 binary once, into `~/.near/`. The script then:

1. Starts a local NEAR node and deploys cpUSD and the Vault. A plain account stands in for the DAO.
2. Funds an owner and gives the agent a function-call key.
3. Starts Guard and the agents against the sandbox. They don't read `.env` and the LLM is off.
4. Runs the demo list end to end, approving as the owner with a helper because there is no wallet in the sandbox.
5. Checks the basket with `verify:audit`.
6. Runs the attacks and prints a PASS/FAIL table.

| Check | Expected |
|---|---|
| DEMO / APPROVE | list → offers → verdicts → basket → Guard signature → approval → payouts |
| AT-10 | vendor-06 isn't registered on cpUSD: **PartiallyPaid**, and its amount goes back to the owner once |
| AUDIT | `verify:audit` PASS (10 checks) |
| AT-01 | 3 items, 2 vendors, every payout Completed |
| AT-05 / AT-06 | edited payload → `ERR_BAD_SIGNATURE`; replay → `ERR_ALREADY_USED` |
| AT-08 | stolen agent key: a self-paying basket → `ERR_BAD_SIGNATURE`; `withdraw` is refused by the access key |
| AT-14 | Guard stopped → request refused with no signature; `withdraw` still works |
| INV-1 | Vault token balance ≥ liabilities = Σ owner balances |

`pnpm cold-run` does the same from a fresh clone inside a clean Docker container.

### Latency (NFR-07)

The time from a request to a signed basket, for the demo list, measured with `DEMO_LATENCY_RUNS=10 pnpm demo:sandbox`. Explanations stream in afterwards and never delay signing.

| LLM | min | median | max | target |
|---|---|---|---|---|
| off (deterministic parser) | 334 ms | 347 ms | 360 ms | ≤ 3 s |
| on (Groq `openai/gpt-oss-120b`, `DEMO_LLM=groq`) | 0.9 s | 8.0 s | 10.8 s | ≤ 20 s |

Measured on 7 Nov 2026 on a local sandbox. On testnet, add the RPC round trips; the public RPC took about 3 s per call that day.

### Check Guard's rules yourself

```bash
pnpm guard assess --snapshot data/fixtures/dev-snapshot --now 2026-11-06T00:00:00Z   # verdict table + JSON
pnpm rules:hash                                                                        # the hash pinned in the Vault
pnpm test                                                                              # 137 tests: rules boundaries, payload vector, pipeline
```

### What Guard does

Guard is a deterministic rules engine and signer. It accepts **offer IDs only**, loads prices from the evidence snapshot itself, and applies rules R-01–R-10 (data validity, staleness, too few offers, unlisted vendor, price vs median in integer basis points, duplicates, minimum spec). To sign a basket it rebuilds every amount from the offer IDs, re-runs the rules, and checks R-20–R-24 against live Vault views: per-basket cap, daily cap, vendor count, token and balance, and acknowledged reviews. Only then does it sign `sha256("CHECKPOINT_BASKET_V1\0" ‖ borsh(payload))`. If it cannot read the Vault, it does not sign.

### What the agents do

The agents parse the list (deterministic by default; an LLM via the Groq API is optional), collect offers, ask Guard for verdicts, and build the cheapest allowed basket within the vendor cap. They then get Guard's signature, wait for the owner's on-chain approval of that exact hash, and submit it with a function-call key that can only call `execute_basket`. The LLM never chooses offers, vendors or amounts, and never sees a key.

### Verify a basket

```bash
pnpm verify:audit <basket_id> --rpc $NEAR_RPC_URL --vault vault.cpdemo.testnet
```

This recomputes the evidence hash and the basket hash, verifies Guard's signature with the key stored in the Vault, and compares everything with `get_basket` on chain. It prints PASS or FAIL per check.

### Commands for the testnet deployment

These sign with keys from `~/.near-credentials/testnet/` (near-cli-rs legacy keychain) and `.env`. Every rejected call still prints its nearblocks link.

| Command | What it does |
|---|---|
| `pnpm setup:testnet` | Creates or checks the account tree, cpUSD, the Vault and the agent's function-call key. Safe to run twice (FR-DX02). |
| `pnpm vault:check` | Reads the live Vault views and parses them with the shared schemas |
| `pnpm gate:testnet` | The gate loop through the running Guard and agents: AT-01, AT-10 (with `verify:audit`), AT-05, AT-06 |
| `pnpm settle -- <payload_b64> <signature_b64>` | Sends one `execute_basket` with the agent key and waits for the payouts |
| `pnpm attack:stolen-key` / `attack:over-cap` / `attack:expired` / `attack:unlisted-vendor` | AT-08 / AT-09 / AT-07 / AT-04 on testnet |
| `pnpm dao:propose -- <method> '<json>' --as <council>` | Creates a Sputnik FunctionCall proposal on the Vault, with 1 yocto, 50 TGas and the bond (FR-G07) |
| `pnpm dao:vote -- <id> --as <council>` / `pnpm dao:show [-- <id>]` | Votes on a proposal / shows the council policy or one proposal |
| `pnpm verify:audit -- <basket_id>` | Checks a basket's evidence against the chain |
