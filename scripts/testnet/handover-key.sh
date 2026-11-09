#!/usr/bin/env bash
# Hand a council account (or any testnet account) to its owner without sharing
# a private key. The owner sends only their PUBLIC key (from their wallet, or
# `near account create ... print-to-terminal` / `near keys`); this script:
#   1. adds it as a full-access key to the account,
#   2. checks it is on chain,
#   3. deletes the key that was created on this machine (unless KEEP_OLD=1).
# After step 3 only the owner can sign for the account.
#   bash scripts/testnet/handover-key.sh isaac-cp.testnet ed25519:<their public key>
source "$(dirname "$0")/lib.sh"
ACCOUNT="${1:?account id}"; NEWPK="${2:?new public key (ed25519:...)}"
[[ "$NEWPK" =~ ^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$ ]] || { echo "not an ed25519 public key: $NEWPK" >&2; exit 2; }
CRED="$HOME/.near-credentials/testnet/$ACCOUNT.json"
[ -f "$CRED" ] || { echo "no local key for $ACCOUNT" >&2; exit 2; }
OLDPK=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['public_key'])" "$CRED")
[ "$OLDPK" != "$NEWPK" ] || { echo "that is the local key already" >&2; exit 2; }

say "Adding $NEWPK to $ACCOUNT"
near account add-key "$ACCOUNT" grant-full-access use-manually-provided-public-key "$NEWPK" $NET sign-with-legacy-keychain send | grep -E "Transaction ID|rror" || true
near account list-keys "$ACCOUNT" $NET now | grep -q "${NEWPK#ed25519:}" || { echo "new key not visible on chain; stopping before deleting anything" >&2; exit 1; }

if [ "${KEEP_OLD:-0}" = 1 ]; then echo "KEEP_OLD=1: local key $OLDPK kept"; exit 0; fi
say "Deleting the local key $OLDPK from $ACCOUNT"
near account delete-keys "$ACCOUNT" public-keys "$OLDPK" $NET sign-with-legacy-keychain send | grep -E "Transaction ID|rror" || true
near account list-keys "$ACCOUNT" $NET now | grep -E "^\| [0-9]" | cut -c1-120
echo "Done. Move $CRED out of ~/.near-credentials (it no longer controls the account)."
