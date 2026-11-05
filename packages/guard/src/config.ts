import { readFileSync } from 'node:fs';
import {
  assertNotMainnet,
  generateKeyPair,
  RulesConfigSchema,
  rulesHashHex,
  type RulesConfig,
} from '@checkpoint/shared';
import {
  envFlag,
  envInt,
  loadSnapshotOrThrow,
  resolveFromRoot,
  type Snapshot,
} from '@checkpoint/shared/node';
import { GuardSigner } from './signer';

export interface GuardConfig {
  network: 'testnet' | 'sandbox';
  rpcUrl: string;
  vaultId: string;
  tokenId: string;
  port: number;
  dev: boolean;
  vaultMode: 'rpc' | 'mock';
  guardKeyVersion: number;
  signer: GuardSigner;
  ephemeralKey: boolean;
  rules: RulesConfig;
  rulesHash: string;
  snapshot: Snapshot;
  /** Pinned clock for R-02 (sandbox or dev only), for a reproducible keyless demo. */
  assessNowMs: number | null;
  corsOrigin: string | undefined;
}

export function loadRulesConfig(path: string): RulesConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read rules config ${path}: ${(e as Error).message}`, { cause: e });
  }
  return RulesConfigSchema.parse(raw);
}

export function loadGuardConfig(env: NodeJS.ProcessEnv = process.env): GuardConfig {
  const network = (env.NEAR_NETWORK || 'testnet') as GuardConfig['network'];
  const rpcUrl = env.NEAR_RPC_URL ?? '';
  assertNotMainnet(network, rpcUrl);
  const dev = envFlag(env.GUARD_DEV);
  const vaultMode = (env.GUARD_VAULT || 'rpc') as GuardConfig['vaultMode'];
  if (!['rpc', 'mock'].includes(vaultMode)) throw new Error('GUARD_VAULT must be rpc or mock');
  if (vaultMode === 'rpc' && !rpcUrl)
    throw new Error('NEAR_RPC_URL is required (or set GUARD_VAULT=mock for local dev)');
  if (vaultMode === 'mock' && network === 'testnet' && !dev) {
    throw new Error('GUARD_VAULT=mock needs GUARD_DEV=1 or NEAR_NETWORK=sandbox');
  }

  let signer: GuardSigner;
  let ephemeralKey = false;
  if (env.GUARD_SECRET_KEY) signer = GuardSigner.fromEnv(env.GUARD_SECRET_KEY);
  else if (dev || vaultMode === 'mock') {
    signer = new GuardSigner(generateKeyPair());
    ephemeralKey = true;
  } else throw new Error('GUARD_SECRET_KEY is not set (generate one with: pnpm guard keygen)');

  const rules = loadRulesConfig(
    resolveFromRoot(env.RULES_CONFIG_PATH || './config/rules.config.json'),
  );
  const snapshot = loadSnapshotOrThrow(resolveFromRoot(env.EVIDENCE_DIR || './data/snapshot'));

  let assessNowMs: number | null = null;
  if (env.GUARD_ASSESS_NOW) {
    if (network !== 'sandbox' && !dev)
      throw new Error('GUARD_ASSESS_NOW is only allowed on sandbox or with GUARD_DEV=1');
    assessNowMs = Date.parse(env.GUARD_ASSESS_NOW);
    if (Number.isNaN(assessNowMs)) throw new Error('GUARD_ASSESS_NOW must be an ISO timestamp');
  }

  return {
    network,
    rpcUrl,
    vaultId: env.VAULT_ID || 'vault.cpdemo.testnet',
    tokenId: env.TOKEN_ID || 'cpusd.cpdemo.testnet',
    port: envInt('GUARD_PORT', env.GUARD_PORT, 8787),
    dev,
    vaultMode,
    guardKeyVersion: envInt('GUARD_KEY_VERSION', env.GUARD_KEY_VERSION, 1),
    signer,
    ephemeralKey,
    rules,
    rulesHash: rulesHashHex(rules),
    snapshot,
    assessNowMs,
    corsOrigin: env.WEB_ORIGIN || undefined,
  };
}
