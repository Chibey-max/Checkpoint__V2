# Saved evidence bundles

The hosted agents service (Render free tier) keeps evidence bundles on a temporary disk, so it forgets them whenever it
restarts or redeploys. A bundle saved here keeps that basket verifiable on the Audit page for good: when the agents answer
404, the page loads `<basket id>.json` from this folder (on `main`, through raw.githubusercontent.com) and re-runs every check
in the browser: schema, evidence hash, basket hash, Guard's signature against the on-chain Guard key, and the match with the
Vault's record. A saved copy proves nothing by being here; it passes only if it is the real bundle for that basket.

## Saving one

Right after a basket is paid (before Render restarts), with its basket id from the Audit page or the request page:

```bash
ID=<basket id>
curl -s "https://checkpoint-agents.onrender.com/v1/audit/$ID" -o "docs/evidence/bundles/$ID.json"
head -c 120 "docs/evidence/bundles/$ID.json"   # starts with {"core":…, not {"code":"NOT_FOUND"…
```

Commit it to `main` (through a PR as usual). The Audit page picks it up within a few minutes, with no redeploy.

Only save bundles of baskets that were approved and executed on testnet: a basket that was only signed has no Vault
record, so its "on-chain basket matches" check fails.
