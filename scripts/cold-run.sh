#!/usr/bin/env bash
# Cold run (D-7.3): clone the committed HEAD (nothing untracked, no .env) into a
# temp dir, build it in a clean container and run pnpm demo:sandbox there.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --quiet --depth 1 "file://$repo" "$tmp/checkpoint"
echo "cold run of $(git -C "$tmp/checkpoint" log --oneline -1)"
docker build --progress=plain -f "$tmp/checkpoint/docker/coldrun.Dockerfile" -t checkpoint-coldrun "$tmp/checkpoint"
docker run --rm checkpoint-coldrun
