# Cold run (tasks D-7.3 / I-7.3): a clean machine with only Rust, Node and pnpm,
# building and running `pnpm demo:sandbox` from a fresh clone. No .env, no keys.
#
#   pnpm cold-run          # clones HEAD into a temp dir and runs this
FROM rust:1.96-bookworm AS rust

FROM node:22-bookworm
COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=rust /usr/local/rustup /usr/local/rustup
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN npm install -g pnpm@9.15.9
WORKDIR /repo
COPY . .
RUN rustup toolchain install && rustup target add wasm32-unknown-unknown && pnpm install --frozen-lockfile
CMD ["pnpm", "demo:sandbox"]
