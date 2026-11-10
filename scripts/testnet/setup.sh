#!/usr/bin/env bash
# pnpm setup:testnet (FR-DX02): create or validate the whole testnet setup.
# Idempotent: every step checks first and skips what already exists, so running
# it twice is harmless. Steps that need input say so and stop.
#   RULES_HASH=<hex> GUARD_PUBKEY=<b58> pnpm setup:testnet
source "$(dirname "$0")/lib.sh"
here="$(dirname "$0")"

view_ok() { near contract call-function as-read-only "$1" "$2" json-args "${3:-{\}}" $NET now >/dev/null 2>&1; }

say "1/4 accounts"
bash "$here/accounts.sh" | grep -E "^== |exists|Creating" || true

say "2/4 cpUSD"
if view_ok "$TOKEN" ft_metadata; then echo "cpUSD already deployed on $TOKEN"; else bash "$here/deploy-cpusd.sh"; fi

say "3/4 Vault"
if view_ok "$VAULT" get_policy; then echo "Vault already initialised on $VAULT"; else
  : "${RULES_HASH:?Vault not deployed yet: set RULES_HASH and GUARD_PUBKEY}"
  bash "$here/deploy-vault.sh"
fi

say "4/4 agent function-call key"
if near account list-keys "$AGENT" $NET now 2>/dev/null | grep -q "execute_basket"; then echo "agent already has an execute_basket key"; else bash "$here/agent-key.sh"; fi

say "Checks"
near contract call-function as-read-only "$TOKEN" storage_balance_of json-args "{\"account_id\":\"$VAULT\"}" $NET now | tail -n 3
for a in "$ROOT" "$VAULT"; do printf '%-28s ' "$a"; near account view-account-summary "$a" $NET now 2>/dev/null | grep -m1 -i "native account balance" || echo "?"; done
echo "Accounts and deploys are recorded in deployments/testnet.json."
