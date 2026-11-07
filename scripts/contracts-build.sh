#!/usr/bin/env bash
# Build the contracts into target/near/ (task I-0.1). Needs cargo-near 0.23.
#   target/near/vault/checkpoint_vault.wasm          Vault
#   target/near/cpusd/checkpoint_cpusd.wasm          cpUSD for testnet (no fault switches)
#   target/near/cpusd-sandbox/checkpoint_cpusd.wasm  cpUSD with the sandbox fault switches (tests only)
set -euo pipefail
cd "$(dirname "$0")/.."
command -v cargo-near >/dev/null || { echo "cargo-near is not installed: cargo install cargo-near --version 0.23.0 --locked" >&2; exit 2; }
b() { cargo near build non-reproducible-wasm --locked --manifest-path "$1" --out-dir "$2" "${@:3}"; }
b contracts/vault/Cargo.toml target/near/vault
b contracts/cpusd/Cargo.toml target/near/cpusd
b contracts/cpusd/Cargo.toml target/near/cpusd-sandbox --features sandbox
ls -l target/near/*/*.wasm
