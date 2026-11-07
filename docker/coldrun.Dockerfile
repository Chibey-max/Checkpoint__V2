# Cold run (tasks D-7.3 / I-7.3): a clean machine with only Rust, Node and pnpm,
# building and running `pnpm demo:sandbox` from a fresh clone. No .env, no keys.
#
#   bash scripts/cold-run.sh          # clones HEAD into a temp dir and runs this
FROM node:22-bookworm AS node

FROM rust:1.96-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && npm install -g pnpm@9.15.9 \
 && rustup target add wasm32-unknown-unknown
WORKDIR /repo
COPY . .
RUN rustup toolchain install && pnpm install --frozen-lockfile
CMD ["pnpm", "demo:sandbox"]
