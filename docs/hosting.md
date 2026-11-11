# Hosting Guard and the agents for the web app (task D-8.2)

The keyless path for judges is still `pnpm demo:sandbox`. Hosting lets the Vercel web app talk to a real Guard and agents on testnet.

[`render.yaml`](../render.yaml) is a Render Blueprint for two free web services, `checkpoint-guard` and `checkpoint-agents`. Both run against the testnet Vault.

## Live (11 Nov)

| Service | URL | Render ID |
|---|---|---|
| Guard | https://checkpoint-guard.onrender.com | `srv-dbq51j49v7es73ci4lb0` |
| Agents (Groq on) | https://checkpoint-agents.onrender.com | `srv-dbq51p0ae00c73dbe8q0` |

`WEB_ORIGIN` on both: `https://checkpoint-eight-dusky.vercel.app`, `https://checkpoint-*-pinzypatz-2831s-projects.vercel.app` (Vercel previews) and `http://localhost:3000`.

Checked after deploy:
- Guard health: `rules_hash_match: true`, policy v4.
- CORS headers come back for the Vercel site and are refused for other origins.
- The demo list reached a Guard-signed basket in 4 s with the LLM parser.

The services deploy from the public repo URL, so **auto-deploy is off.** After merging to `main`, run `render deploys create srv-dbq51j49v7es73ci4lb0` (Guard) and `render deploys create srv-dbq51p0ae00c73dbe8q0` (agents).

## Deploy from scratch (about 15 minutes)

1. In Render, go to **New → Blueprint**, connect GitHub and pick the repo: either `Phantomcall/Checkpoint__V2` or a fork kept in sync with `main`. Render reads `render.yaml` and proposes both services.
2. Fill in the `sync: false` values when Render asks. **These are secrets: they go only in Render, never in git or in Vercel.**

   | Variable | Service | Value |
   |---|---|---|
   | `NEAR_RPC_URL` | both | `https://rpc.testnet.fastnear.com` |
   | `GUARD_SECRET_KEY` | Guard | From Bitwarden: "Checkpoint .env: GUARD_SECRET_KEY". It must be the key the Vault knows as Guard v1, `CAR74z4P…`. |
   | `AGENT_FC_PRIVATE_KEY` | agents | From Bitwarden: "Checkpoint .env: AGENT_FC_PRIVATE_KEY". It is a function-call key that can only call `execute_basket`. |
   | `GROQ_API_KEY` | agents | From Bitwarden: "Checkpoint .env: GROQ_API_KEY" |
   | `GUARD_URL` | agents | The Guard service's URL, e.g. `https://checkpoint-guard.onrender.com` |
   | `WEB_ORIGIN` | both | The Vercel production URL. To allow preview links too, add a pattern after a comma, e.g. `https://checkpoint.vercel.app,https://checkpoint-*-yourteam.vercel.app` |

3. Click **Apply**. The first build takes a few minutes.
4. Check both services:
   - `https://checkpoint-guard.onrender.com/v1/health` should show `"rules_hash_match": true`.
   - `https://checkpoint-agents.onrender.com/v1/health` should show `{"ok":true}`.
5. In Vercel, set these two values and redeploy the web app:
   - `NEXT_PUBLIC_AGENTS_URL`: the agents URL
   - `NEXT_PUBLIC_GUARD_URL`: the Guard URL

## Know before a demo

- **Free instances sleep after about 15 minutes idle.** The first request then takes 30–60 s. Open both `/v1/health` URLs a minute before a demo or recording.
- **The agents' SQLite history is on an ephemeral disk,** so it resets on every deploy or restart. Paid baskets stay on chain, and `pnpm verify:audit` and the Audit page still read them.
- **The agent key is limited.** The function-call key can only call `execute_basket`, with a 1 NEAR allowance. Even if it leaked, nothing moves without a Guard signature and the owner's approval (AT-08).
- **`WEB_ORIGIN` controls which sites may call the services.** Anything not listed is blocked by the browser. Each entry allows one `*`, which matches letters, digits and hyphens only, never a `.` or `/`.
