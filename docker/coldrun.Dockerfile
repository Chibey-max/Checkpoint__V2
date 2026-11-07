# Cold run (tasks D-7.3 / I-7.3): a clean Ubuntu 24.04 machine with only Rust,
# Node and pnpm, building and running `pnpm demo:sandbox` from a fresh clone.
# No .env, no keys. (near-sandbox 2.14 needs glibc >= 2.39, i.e. Ubuntu 24.04+.)
#
#   pnpm cold-run          # clones HEAD into a temp dir and runs this
FROM rust:1.96-bookworm AS rust
FROM node:22-bookworm AS node

# buildpack-deps:noble = Ubuntu 24.04 with gcc, make and CA certificates, so no apt step.
FROM buildpack-deps:noble
COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=rust /usr/local/rustup /usr/local/rustup
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && npm install -g pnpm@9.15.9
WORKDIR /repo
COPY . .
RUN rustup toolchain install && rustup target add wasm32-unknown-unknown && pnpm install --frozen-lockfile
CMD ["pnpm", "demo:sandbox"]
