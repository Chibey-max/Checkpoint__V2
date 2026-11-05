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
