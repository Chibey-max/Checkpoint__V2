/**
 * A local NEAR sandbox node for pnpm demo:sandbox.
 *
 * near-workspaces JS 5.0 pins nearcore 2.6.2 (protocol 77), which rejects the
 * rustc 1.87+ wasm the contracts are built with (bulk-memory opcodes need
 * protocol 84+). So this runs the official near-sandbox binary directly, at the
 * same version the Rust near-workspaces tests use. The binary is downloaded
 * once from NEAR's release bucket into ~/.near/near-sandbox-<version>/ unless
 * NEAR_SANDBOX_BIN_PATH points at one.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const SANDBOX_VERSION = '2.14.0';

function platform(): string {
  if (process.platform === 'linux' && process.arch === 'x64') return 'Linux-x86_64';
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'Darwin-arm64';
  throw new Error(`near-sandbox has no build for ${process.platform}/${process.arch}`);
}

async function ensureBinary(): Promise<string> {
  const fromEnv = process.env.NEAR_SANDBOX_BIN_PATH;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`NEAR_SANDBOX_BIN_PATH=${fromEnv} does not exist`);
    return fromEnv;
  }
  const dir = join(homedir(), '.near', `near-sandbox-${SANDBOX_VERSION}`);
  const bin = join(dir, 'near-sandbox');
  if (existsSync(bin)) return bin;
  const url = `https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/${platform()}/${SANDBOX_VERSION}/near-sandbox.tar.gz`;
  console.log(`Downloading near-sandbox ${SANDBOX_VERSION} (once) from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  mkdirSync(dir, { recursive: true });
  const tgz = join(dir, 'near-sandbox.tar.gz');
  writeFileSync(tgz, new Uint8Array(await res.arrayBuffer()));
  const r = spawnSync('tar', ['-xzf', tgz, '--strip-components=1', '-C', dir], {
    stdio: 'inherit',
  });
  rmSync(tgz, { force: true });
  if (r.status !== 0 || !existsSync(bin)) throw new Error('could not unpack near-sandbox');
  return bin;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => (typeof a === 'object' && a ? resolve(a.port) : reject(new Error('no port'))));
    });
  });
}

export interface Sandbox {
  rpcUrl: string;
  rootId: string;
  rootKey: string;
  home: string;
  stop(): Promise<void>;
}

export async function startSandbox(): Promise<Sandbox> {
  const bin = await ensureBinary();
  const home = mkdtempSync(join(tmpdir(), 'checkpoint-sandbox-'));
  const init = spawnSync(bin, ['--home', home, 'init', '--fast'], { encoding: 'utf8' });
  if (init.status !== 0) {
    const glibc = /GLIBC_2\.\d+' not found/.test(init.stderr ?? '');
    throw new Error(
      glibc
        ? `near-sandbox ${SANDBOX_VERSION} needs glibc 2.39+ (Ubuntu 24.04 or newer). Run it on a newer OS, or use pnpm cold-run (Docker).`
        : `near-sandbox init failed: ${(init.stderr ?? '').slice(-400)}`,
    );
  }
  const key = JSON.parse(readFileSync(join(home, 'validator_key.json'), 'utf8')) as {
    account_id: string;
    secret_key: string;
  };
  const rpcPort = await freePort();
  const netPort = await freePort();
  const child: ChildProcess = spawn(
    bin,
    [
      '--home',
      home,
      'run',
      '--rpc-addr',
      `127.0.0.1:${rpcPort}`,
      '--network-addr',
      `127.0.0.1:${netPort}`,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const end = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`near-sandbox exited with ${child.exitCode}`);
    try {
      const r = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'block',
          params: { finality: 'final' },
        }),
      });
      const j = (await r.json()) as { result?: { header?: { height: number } } };
      if ((j.result?.header?.height ?? 0) > 1) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > end) throw new Error('near-sandbox did not start within 60 s');
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    rpcUrl,
    rootId: key.account_id,
    rootKey: key.secret_key,
    home,
    async stop() {
      if (child.exitCode === null) child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      rmSync(home, { recursive: true, force: true });
    },
  };
}
