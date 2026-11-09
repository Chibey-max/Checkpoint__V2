#!/usr/bin/env bash
# I-0.5: create the council DAO on the Sputnik v2 factory, paid by the root account.
#   COUNCIL="david.testnet,isaac.testnet,patrick.testnet" bash scripts/testnet/dao-create.sh
# Default policy: the listed accounts form the council; 1/2 of the council approves
# (2 of 3). Proposal bond 1 NEAR. Then check: get_policy lists the 3 members.
source "$(dirname "$0")/lib.sh"
: "${COUNCIL:?set COUNCIL to three comma-separated testnet accounts}"
NAME="${DAO_NAME:-checkpoint-council}"
FACTORY="${DAO_FACTORY:-sputnik-v2.testnet}"
DAO="$NAME.$FACTORY"
if exists "$DAO"; then say "$DAO already exists"; else
  members=$(python3 -c "import json,sys; print(json.dumps([a.strip() for a in sys.argv[1].split(',') if a.strip()]))" "$COUNCIL")
  args=$(printf '{"config":{"name":"%s","purpose":"Checkpoint Vault policy","metadata":""},"policy":%s}' "$NAME" "$members" | base64 -w0)
  say "Creating $DAO with council $members"
  near contract call-function as-transaction "$FACTORY" create json-args "{\"name\":\"$NAME\",\"args\":\"$args\"}" \
    prepaid-gas '150 Tgas' attached-deposit "${DAO_DEPOSIT:-6} NEAR" sign-as "$ROOT" $NET $SIGN
fi
say "get_policy"
near contract call-function as-read-only "$DAO" get_policy json-args '{}' $NET now
