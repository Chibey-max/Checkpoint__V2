# Checkpoint docs

## Planning documents

| Document | What it is | Read it when |
|---|---|---|
| [**Project decision**](planning/NEAR-Project-Decision.pdf) (8 pp, 5 Nov) | Why we merged Checkpoint (Guard · Vault · DAO) with Agent Procurement Desk into one submission. It compares the four options, checks the live hackathon rules (HACKATHON.md Q-007 Intents testnet, Q-015 two projects, Q-017 AI screening) and lists the risks of merging. | You want the reasoning behind the scope |
| [**PRD v2.0**](planning/Checkpoint-PRD-v2.pdf) (23 pp, 5 Nov) | The product spec: goals, roles, tracks, scope and priorities, architecture, flows (including failures), about 70 functional requirements, Guard rules, data model, **frozen interfaces** (contract methods, basket payload, events, APIs), invariants, threat model, test plan, demo script, risks and open decisions. | You are building anything. It is the source of truth for interfaces. |
| [**Task list**](planning/Checkpoint-Task-List.pdf) (28 pp, 5 Nov) | 74 day-by-day tasks for Isaac, David and Patrick (IDs like `I-2.2`). Each has steps, the tools needed, a recommended approach, an alternative, a "done when" test and handoffs (H1–H14). It also includes the daily routine, gate criteria and the submission checklist. | You are picking your next task |

The PDFs are the readable versions. The editable sources are in [`planning/source/`](planning/source/):

- `*.html` are the print sources. Re-render with headless Chrome:
  `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=OUT.pdf IN.html`
- `build_tasks.py` generates `Checkpoint-Task-List.html` from structured task data:
  `python3 build_tasks.py Checkpoint-Task-List.html`

## Engineering docs

| Document | What it is |
|---|---|
| [**Decisions pending**](decisions-pending.md) | Where the Day 0 code departs from or adds to PRD v2, each with who needs to agree. **Read this first.** |
| [**API**](api.md) | Guard and agents HTTP contracts, SSE events with real examples, the evidence bundle, the mock server, and the Vault view shapes Guard expects |
| [**Architecture**](architecture.md) | How the off-chain code maps to PRD §6, and where each guarantee is enforced and tested |
| [README section draft](readme-section-guard-agents.md) | Guard and agents text for the master README (D-7.1) |
| [Payload vector](../packages/shared/vectors/README.md) | The shared Borsh test vector (H1) and the Rust struct that matches it |
| [Wallet check](wallet.md) | The wallet decision for the web app (P-0.3) and the manual testnet check |
| [**Demo script**](demo-script.md) | The 4:00 video as a shot list: screens, accounts, what to say, timings, fallbacks, and how to reset state for a clean take |
| [**Evidence**](evidence.md) | One row per acceptance test with the command, result and nearblocks link. Template until the gate; frozen on 12 Nov |

## Change rules

- The PRD's §11 interfaces are **frozen**. Change them only when all three of us agree, and update the PRD, the shared test vectors and the code in the same PR.
- When a task's "done when" passes, tick it on the board. If the plan changes, update the task data in `build_tasks.py` and re-render.
- The other docs planned under `docs/` (`permissions.md`, `limitations.md`) arrive with the milestones in the task list.
