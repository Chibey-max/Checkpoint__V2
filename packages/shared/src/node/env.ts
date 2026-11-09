import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The monorepo root: the nearest directory with pnpm-workspace.yaml. */
export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
}

/** Resolve a path from env relative to the repo root (pnpm --filter runs scripts in the package dir). */
export function resolveFromRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(findRepoRoot(), p);
}

/**
 * Load <root>/.env into process.env if present. Existing variables win.
 * CHECKPOINT_NO_DOTENV=1 skips it (pnpm demo:sandbox runs isolated from .env).
 */
export function loadRootEnv(): void {
  if (envFlag(process.env.CHECKPOINT_NO_DOTENV)) return;
  const path = join(findRepoRoot(), '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}

export function envFlag(v: string | undefined): boolean {
  return v === '1' || v?.toLowerCase() === 'true';
}

export function envInt(name: string, v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  if (!/^\d+$/.test(v)) throw new Error(`${name} must be a non-negative integer`);
  return Number.parseInt(v, 10);
}
