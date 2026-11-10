#!/usr/bin/env bash
# I-7.1 (address freeze): check that what runs on testnet is what is in the repo.
#   pnpm freeze:check
# Rebuilds the contracts with cargo-near (the testnet build), compares each
# wasm's SHA-256 (base58) with the account's on-chain code hash, then prints the
# Vault's admin, policy version and every account's access keys.
source "$(dirname "$0")/lib.sh"
command -v cargo-near >/dev/null || { echo "freeze:check needs cargo-near 0.23 (the testnet build)" >&2; exit 2; }
CONTRACTS_BUILD=cargo-near bash "$REPO/scripts/contracts-build.sh" >/dev/null

b58sha() { python3 -c "
import hashlib,sys
a='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
n=int.from_bytes(hashlib.sha256(open(sys.argv[1],'rb').read()).digest(),'big');s=''
while n: n,r=divmod(n,58); s=a[r]+s
print(s)" "$1"; }
onchain() { curl -s "${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['code_hash'])"; }

status=0
for pair in "$VAULT:vault/checkpoint_vault.wasm" "$TOKEN:cpusd/checkpoint_cpusd.wasm"; do
  acc="${pair%%:*}"; wasm="$REPO/target/near/${pair#*:}"
  local_h=$(b58sha "$wasm"); chain_h=$(onchain "$acc")
  if [ "$local_h" = "$chain_h" ]; then echo "MATCH     $acc  $chain_h"; else echo "MISMATCH  $acc  chain $chain_h  repo $local_h"; status=1; fi
done

say "Vault admin and policy"
near contract call-function as-read-only "$VAULT" get_policy json-args '{}' $NET now 2>/dev/null | grep -E '"(dao_id|guardian|policy_version|rules_hash|guard_pubkey|guard_key_version|paused|deficit)"'
say "Access keys"
for a in "$VAULT" "$TOKEN" "$AGENT" "$GUARDIAN" "$ROOT"; do
  echo "$a"; near account list-keys "$a" $NET now 2>/dev/null | grep -E "^\| [0-9]" | cut -c1-140
done
exit $status
