/** Public chain config. NEXT_PUBLIC_* values are inlined into the browser bundle, so nothing secret goes here. */
export const config = {
  network: (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "testnet" | "sandbox",
  rpcUrl: process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com",
  vaultId: process.env.NEXT_PUBLIC_VAULT_ID ?? "vault.cpdemo.testnet",
  tokenId: process.env.NEXT_PUBLIC_TOKEN_ID ?? "cpusd.cpdemo.testnet",
  daoId: process.env.NEXT_PUBLIC_DAO_ID ?? "checkpoint-council.sputnik-v2.testnet",
  agentsUrl: process.env.NEXT_PUBLIC_AGENTS_URL ?? "http://localhost:8788",
  guardUrl: process.env.NEXT_PUBLIC_GUARD_URL ?? "http://localhost:8787",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.nearblocks.io",
  useMock: process.env.NEXT_PUBLIC_USE_MOCK === "1",
} as const;

export const txUrl = (hash: string) => `${config.explorerUrl}/txns/${hash}`;
export const accountUrl = (id: string) => `${config.explorerUrl}/address/${id}`;
