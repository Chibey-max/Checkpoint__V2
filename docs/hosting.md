# Optional hosting for judges (task D-8.2, P2)

The **keyless path for judges is `pnpm demo:sandbox`**: it runs locally in about a minute and needs no account. Hosting Guard and the agents is a nice extra, not a requirement.

## Render (free tier, decision D-06)

[`render.yaml`](../render.yaml) is a Blueprint for two web services, `checkpoint-guard` and `checkpoint-agents`, both on the testnet Vault.

1. In Render, go to **New → Blueprint** and pick this repo. Render reads `render.yaml`.
2. Fill in the `sync: false` values in the dashboard. Never commit them.
   - Both services: `NEAR_RPC_URL` (the D-04 choice) and `WEB_ORIGIN` (the web app's URL, for CORS).
   - Guard: `GUARD_SECRET_KEY`, the same key the Vault has as Guard key v1. Copy it from the password manager.
   - Agents: `AGENT_FC_PRIVATE_KEY` (function-call key only, from the password manager) and `GUARD_URL`, which is the Guard service's `https://…onrender.com` URL.
3. Point the web app at the services: set `NEXT_PUBLIC_AGENTS_URL` to the agents service URL.
4. Check that `GET /v1/health` on Guard returns `rules_hash_match: true`.

Things to know about the free tier:

- Free instances sleep after about 15 minutes idle. The first request then takes 30–60 s. Open both health URLs before a demo.
- The agents' SQLite file is on an ephemeral disk, so request history resets on every restart or deploy. Audit bundles for recorded baskets are in `docs/evidence.md` anyway.
- The hosted agents run with `LLM_PROVIDER=none`. To turn on Groq explanations, set `LLM_PROVIDER=groq` and add `GROQ_API_KEY` as a secret.
- The function-call key can only call `execute_basket` on the Vault, with a 1 NEAR allowance. A leaked hosted key can't move funds without a Guard signature and an owner approval (AT-08).

**Status (7 Nov):** the Blueprint is ready but not deployed. Deploying needs the team's Render account and the two secrets from the password manager.
