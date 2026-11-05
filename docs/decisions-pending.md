# Decisions pending (from David's Day 0 work, 5 Nov)

The code in this branch implements these choices. Each one either departs from PRD v2 or fills a gap in it, so it needs the team's OK. None changes the frozen payload (§11.2): the Rust/TS test vector is unaffected. Where an item touches another frozen interface, it is additive and optional.

**Reply in chat with agree / change for each numbered item.** If an item is changed, it's a small edit; the file is named.

## Needs agreement before H3 (rules hash to Isaac, Day 1 18:00)

### 1. `max_age_hours` 720 instead of 168, and the clock is an input
R-02 marks offers older than `max_age_hours` as REVIEW. With 168 h, a snapshot captured on 5–6 Nov goes stale on 12–13 Nov (freeze and video days), and every run after 14 Nov, including the AI screener's, would show every offer as REVIEW and Guard would refuse to sign. The config now says 720 h (30 days).

The rules also take `now` as an input instead of reading the clock (FR-R01 says pure). For the keyless sandbox demo, `GUARD_ASSESS_NOW=<ISO>` pins that clock (only allowed on sandbox or with `GUARD_DEV=1`).
*Files:* `config/rules.config.json`, `packages/shared/src/rules-config.ts`. *Owner to agree:* all three (it changes the rules hash).

### 2. The rules config no longer names the token
PRD §9.4 puts `"token": "cpusd.cpdemo.testnet"` inside `usd_to_token`. The sandbox token has a different account ID, so the rules hash would differ between sandbox and testnet, and Guard refuses to start when its hash differs from the Vault's. The token already comes from Vault policy and the payload, so it's dropped. One rules hash now works everywhere:

`rules_hash = 89e1b151b955375cf1ae7b5af890d0212ad6284e21dc280bc504090d63f9c23d` (`pnpm rules:hash`)

*Owner:* Isaac (Vault init uses this hash).

## Needs agreement (behaviour)

### 3. Acknowledged REVIEW offers become eligible on re-plan
PRD §7.3 step 5 only picks a REVIEW offer when an item has no ALLOW offer, so the demo beat "unusually cheap → acknowledge" could never happen (the cheap offer always sits next to ALLOW offers). The Coordinator now treats ALLOW **and acknowledged REVIEW** offers as eligible, as the decision doc and `POST /acknowledge → re-plan and re-sign` already imply. The UI needs an acknowledge action on REVIEW rows in the offers table, not only on basket lines.
*File:* `packages/agents/src/coordinator.ts`. *Owner:* Patrick (UI), David.

### 4. `evidence_hash` covers only what exists before signing
§10.2 lists the signed basket and chain transaction hashes inside the evidence bundle, but `evidence_hash` goes inside the signed payload, which is circular. The bundle is now `{ core, evidence_hash, signed, chain }`. Only `core` (request, offers, verdicts, rules config and hash, acknowledgements, basket) is hashed; `signed` and `chain` are attached afterwards. `verify:audit` and the web app's verified badge use `verifyEvidenceBundle` from `@checkpoint/shared`.
*Owner:* Patrick (audit page), Isaac (the Vault just stores and emits the 32 bytes).

### 5. Adversarial rows live in `data/snapshot/fixtures/` and say `capture_method: "fixture"`
The loader reads `catalog.json`, `offers.json` and every `fixtures/*.json`, so the demo shows the adversarial rows. Every fixture row must say `capture_method: "fixture"` (a new enum value), so the UI and README can label it as synthetic and the "real listings" claim stays true. `pnpm snapshot:check` enforces it.
*Owner:* Patrick (P-0.1).

### 6. The demo basket and AT-01 need different requests
With vendor-06 (unregistered on cpUSD) holding the cheapest allowed offer for one demo item, the demo basket always ends `PartiallyPaid`, which is good for AT-10. AT-01 ("both payouts Completed") then needs a request whose items vendor-06 doesn't win. The dev fixtures follow this layout: `dom-f` is vendor-06's.
*Owner:* Patrick (snapshot), Isaac (AT-01 script).

## Additive interface changes (no breakage; please confirm)

7. **API additions** (all optional or new):
   - `basket_id` on `POST /v1/sign-basket`
   - `unit_price_micro` and `ratio_bps` on `Verdict`
   - `name` on `Finding` (e.g. `PRICE_POOR`)
   - `aliases` on `CatalogItem`
   - `GET /v1/requests?owner_id=` for the Desk history
   - request state `cancelled`
   - Guard error codes `NOT_FOUND` and `INTERNAL`

   SSE messages carry `event: <type>` and the full envelope in `data`. See [api.md](api.md).
8. **Vault view JSON** (Isaac): the views Guard and the agents read are proposed in [api.md § Vault views](api.md#vault-views-guard-and-the-agents-read-proposal-for-isaac), with arg names `owner_id`, `token_id`, `hash_hex` and the pubkey as base58. If the contract returns something else, change `packages/shared/src/vault-views.ts` in the same PR. Guard fails closed (503) on any unexpected shape.

## FYI (decided, easy to revert)

9. **SQLite:** Node's built-in `node:sqlite` instead of `better-sqlite3`. On this machine better-sqlite3 compiled from C++ source, which a clean screener machine may not be able to do. The engines field now needs Node ≥ 22.13. It prints an ExperimentalWarning, which the agents hide.
10. **LLM: Groq, not Anthropic (team decision, 5 Nov).** This supersedes PRD §13 and D-10. The agents call the Groq API through the official `groq-sdk` with model `openai/gpt-oss-120b` (production on Groq; strict structured outputs; $0.15 / $0.60 per million tokens) at `reasoning_effort: low`. Each call sends a strict JSON schema generated from the same Zod schema that then re-validates the reply. Any failure (API error, truncation, schema mismatch) falls back to the deterministic parser or template explanations with a recoverable `error` event. The deterministic parser stays the default for the demo and CI, so the AI screener needs no key. **D-0.4 passed on 5 Nov:** `pnpm llm:check` parsed the demo list live in 1.4 s with the same items as the deterministic parser, and a live run produced 16/16 verdict explanations that passed the post-check. The basket summary may not claim the basket is approved or paid, since it is written before the owner approves. With `LLM_PROVIDER=groq` but no key, the agents log a warning and use the deterministic path.
11. **AT-09 (Guard signs an over-cap basket):** `GUARD_DEV=1` only skips the rules-hash startup check. It does not let Guard sign rule-breaking baskets. `attacks/over-cap.ts` should build and sign the payload directly with `encodePayload` / `basketHash` / `signBasketHash` from `@checkpoint/shared` and the Guard key. That is exactly a "Guard bug", without a backdoor in the service.
12. **Guard refuses early** when the agent isn't in the owner's `set_agent` list, or the Vault is paused or in deficit. The Vault would reject these anyway; refusing early saves the owner a wasted approval.
13. **The agents API has no auth.** Anyone can create a request naming any `owner_id`. Nothing moves without that owner's on-chain approval, so this is acceptable for the hackathon, and it's listed as a limitation.
14. **Repo is public, so the pre-commit hook fails closed without gitleaks.** Install it before committing: `brew install gitleaks`, or the release binary with its checksum verified, as the CI workflow does.
15. **Task list weekdays are off by one.** 5 Nov 2026 is a Thursday. The gate is **Monday 9 Nov** and submission is **Saturday 14 Nov**. The labels come from `DAYS` in `docs/planning/source/build_tasks.py`.
