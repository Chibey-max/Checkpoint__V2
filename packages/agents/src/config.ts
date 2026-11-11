import {
  assertNotMainnet,
  corsOriginFromEnv,
  rulesHashHex,
  type CorsOrigin,
  type RulesConfig,
} from '@checkpoint/shared';
import {
  envInt,
  loadSnapshotOrThrow,
  resolveFromRoot,
  type Snapshot,
} from '@checkpoint/shared/node';
import { loadRulesConfig } from '@checkpoint/guard';
import { DEFAULT_GROQ_MODEL, type LlmConfig } from './llm';

export interface AgentsConfig {
  network: 'testnet' | 'sandbox';
  rpcUrl: string;
  vaultId: string;
  tokenId: string;
  agentId: string;
  agentFcPrivateKey: string | undefined;
  guardUrl: string;
  port: number;
  dbPath: string;
  chainMode: 'rpc' | 'mock';
  corsOrigin: CorsOrigin | undefined;
  llm: LlmConfig;
  rules: RulesConfig;
  rulesHash: string;
  snapshot: Snapshot;
}

export function loadAgentsConfig(env: NodeJS.ProcessEnv = process.env): AgentsConfig {
  const network = (env.NEAR_NETWORK || 'testnet') as AgentsConfig['network'];
  const rpcUrl = env.NEAR_RPC_URL ?? '';
  assertNotMainnet(network, rpcUrl);
  const chainMode = (env.AGENTS_CHAIN || 'rpc') as AgentsConfig['chainMode'];
  if (!['rpc', 'mock'].includes(chainMode)) throw new Error('AGENTS_CHAIN must be rpc or mock');
  if (chainMode === 'rpc' && !rpcUrl)
    throw new Error('NEAR_RPC_URL is required (or set AGENTS_CHAIN=mock for local dev)');

  const provider = (env.LLM_PROVIDER || 'none') as LlmConfig['provider'];
  if (!['groq', 'none'].includes(provider)) throw new Error('LLM_PROVIDER must be groq or none');
  const effort = (env.LLM_REASONING_EFFORT || 'low') as NonNullable<LlmConfig['reasoningEffort']>;
  if (!['low', 'medium', 'high'].includes(effort))
    throw new Error('LLM_REASONING_EFFORT must be low, medium or high');
  // With no key, fall back to the deterministic path instead of failing every call.
  const llm: LlmConfig = {
    provider: provider === 'groq' && env.GROQ_API_KEY ? 'groq' : 'none',
    model: env.LLM_MODEL || DEFAULT_GROQ_MODEL,
    reasoningEffort: effort,
    ...(env.GROQ_API_KEY ? { apiKey: env.GROQ_API_KEY } : {}),
  };

  const rules = loadRulesConfig(
    resolveFromRoot(env.RULES_CONFIG_PATH || './config/rules.config.json'),
  );
  return {
    network,
    rpcUrl,
    vaultId: env.VAULT_ID || 'vault.cpdemo.testnet',
    tokenId: env.TOKEN_ID || 'cpusd.cpdemo.testnet',
    agentId: env.AGENT_ACCOUNT_ID || 'agent.cpdemo.testnet',
    agentFcPrivateKey: env.AGENT_FC_PRIVATE_KEY || undefined,
    guardUrl: env.GUARD_URL || 'http://localhost:8787',
    port: envInt('AGENTS_PORT', env.AGENTS_PORT, 8788),
    dbPath:
      env.AGENTS_DB_PATH === ':memory:'
        ? ':memory:'
        : resolveFromRoot(env.AGENTS_DB_PATH || './data/private/agents.sqlite'),
    chainMode,
    corsOrigin: corsOriginFromEnv(env.WEB_ORIGIN),
    llm,
    rules,
    rulesHash: rulesHashHex(rules),
    snapshot: loadSnapshotOrThrow(resolveFromRoot(env.EVIDENCE_DIR || './data/snapshot')),
  };
}

/** node:sqlite prints an ExperimentalWarning on Node 22; hide only that one. */
export function quietSqliteWarning(): void {
  const listeners = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (w) => {
    if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
    for (const l of listeners) l(w);
  });
}
