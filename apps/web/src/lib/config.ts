/**
 * A pasted env value can carry a stray newline or spaces (Vercel's form keeps them), which turns
 * "vault.cpdemo.testnet" into an account that doesn't exist. Trim every value, and treat an empty one as unset.
 * Each `process.env.NEXT_PUBLIC_*` stays a direct reference so Next.js can inline it at build time.
 */
const clean = (v: string | undefined) => v?.trim() || undefined;

/** Public chain config. NEXT_PUBLIC_* values are inlined into the browser bundle, so nothing secret goes here. */
export const config = {
  network: (clean(process.env.NEXT_PUBLIC_NEAR_NETWORK) ?? "testnet") as "testnet" | "sandbox",
  rpcUrl: clean(process.env.NEXT_PUBLIC_NEAR_RPC_URL) ?? "https://rpc.testnet.fastnear.com",
  vaultId: clean(process.env.NEXT_PUBLIC_VAULT_ID) ?? "vault.cpdemo.testnet",
  tokenId: clean(process.env.NEXT_PUBLIC_TOKEN_ID) ?? "cpusd.cpdemo.testnet",
  daoId: clean(process.env.NEXT_PUBLIC_DAO_ID) ?? "checkpoint-council.sputnik-v2.testnet",
  agentsUrl: clean(process.env.NEXT_PUBLIC_AGENTS_URL) ?? "http://localhost:8788",
  guardUrl: clean(process.env.NEXT_PUBLIC_GUARD_URL) ?? "http://localhost:8787",
  explorerUrl: clean(process.env.NEXT_PUBLIC_EXPLORER_URL) ?? "https://testnet.nearblocks.io",
  useMock: clean(process.env.NEXT_PUBLIC_USE_MOCK) === "1",
} as const;

export const txUrl = (hash: string) => `${config.explorerUrl}/txns/${hash}`;
export const accountUrl = (id: string) => `${config.explorerUrl}/address/${id}`;
