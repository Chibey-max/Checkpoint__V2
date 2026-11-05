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

## Change rules

- The PRD's §11 interfaces are **frozen**. Change them only when all three of us agree, and update the PRD, the shared test vectors and the code in the same PR.
- When a task's "done when" passes, tick it on the board. If the plan changes, update the task data in `build_tasks.py` and re-render.
- The other docs planned under `docs/` (`architecture.md`, `api.md`, `permissions.md`, `evidence.md`, `limitations.md`, `demo-script.md`) arrive with the milestones in the task list.
