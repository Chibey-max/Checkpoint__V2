# Address freeze (I-7.1, 11 Nov 2026)

Frozen from `main` at `11f6411`. From here on, only P0 fixes are allowed (I-8.2). Any contract change means a redeploy, then `pnpm freeze:check` again and an update to this page.

| What | Value | Check |
|---|---|---|
| Vault | `vault.cpdemo.testnet`, code `G9cZQeMRyvM6Uni3mPujsPYUqyhDnJpxoNn6Nnp6K6K` | `pnpm freeze:check` → MATCH |
| cpUSD | `cpusd.cpdemo.testnet`, code `EjXGxRYJk8nmQNHi6xs5MMJtrPgfSo6njWGA9bJbZG9N` | `pnpm freeze:check` → MATCH |
| Vault admin | `checkpoint-council.sputnik-v2.testnet` (David + Patrick, 2 of 2), policy v4 | `get_policy` |
| Guard key | `CAR74z4PpMpNAmCnmaRY3dPrjFUSMrswynTah4oSsBrY`, v1 | Guard `/v1/health` → `rules_hash_match: true` |
| Rules hash | `89e1b151b955375cf1ae7b5af890d0212ad6284e21dc280bc504090d63f9c23d` | `pnpm rules:hash` |
| Agent key | `agent.cpdemo.testnet`: function-call only (`execute_basket`), 1 NEAR allowance | `near account list-keys` |
| Hosted services | https://checkpoint-guard.onrender.com, https://checkpoint-agents.onrender.com | `/v1/health` |
| Web | https://checkpoint-eight-dusky.vercel.app | – |

## Checks run at the freeze

| Check | Result |
|---|---|
| `pnpm freeze:check` | Both contracts MATCH the repo |
| CI on `main` | 5/5 jobs green |
| `pnpm demo:sandbox` | ALL PASS: 13 rows, including AT-01, 05, 06, 08, 10, 14, AUDIT and INV-1 |
| `gitleaks detect --log-opts=--all` | No leaks |
| `.env.example` | Only public IDs; every secret field is empty |

## Not done on purpose

- **The Vault keeps its full-access key (D-08).** Removing it makes the code permanent, so not even a P0 fix could be deployed before submission. Decide after the 14 Nov submission. The permission inventory in [security.md](security.md) lists the key.
