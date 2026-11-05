import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES_CONFIG,
  canonicalJson,
  formatBaseUnits,
  fromBase64,
  microUsdToBaseUnits,
  parseDecimalToBaseUnits,
  parseSecretKey,
  replayRequest,
  rulesHashHex,
  toBase58,
  toBase64,
  keyPairFromSeed,
  assertNotMainnet,
  explainVaultError,
  type AgentEvent,
} from '../src/index';
import { readFileSync } from 'node:fs';

describe('canonicalJson', () => {
  it('sorts keys, drops whitespace and undefined keys', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined })).toBe(
      '{"a":[true,null,"x"],"b":1}',
    );
  });
  it('rejects floats, bigints and unsafe integers', () => {
    expect(() => canonicalJson({ x: 1.5 })).toThrow(/non-integer/);
    expect(() => canonicalJson({ x: 1n })).toThrow(/bigint/);
    expect(() => canonicalJson({ x: 2 ** 60 })).toThrow(/unsafe/);
  });
  it('is stable under JSON round trip', () => {
    const v = { z: 'ü\n"', a: { y: [1, 2], x: 'q' } };
    expect(canonicalJson(JSON.parse(JSON.stringify(v)))).toBe(canonicalJson(v));
  });
});

describe('rules config and hash', () => {
  it('config/rules.config.json equals the default and hashes stably', () => {
    const file = JSON.parse(
      readFileSync(new URL('../../../config/rules.config.json', import.meta.url), 'utf8'),
    );
    expect(file).toEqual(DEFAULT_RULES_CONFIG);
    expect(rulesHashHex(file)).toBe(rulesHashHex(DEFAULT_RULES_CONFIG));
    expect(rulesHashHex(DEFAULT_RULES_CONFIG)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('any threshold change changes the hash', () => {
    const changed = {
      ...DEFAULT_RULES_CONFIG,
      bps: { ...DEFAULT_RULES_CONFIG.bps, fair_max: 12_001 },
    };
    expect(rulesHashHex(changed)).not.toBe(rulesHashHex(DEFAULT_RULES_CONFIG));
  });
  it('key order in the file does not matter', () => {
    const reordered = JSON.parse(
      `{"usd_to_token":{"rate_micro":1000000,"decimals":6},"currency":"USD","bps":{"low_min":5000,"fair_max":12000,"good_max":10500},"max_age_hours":720,"min_offers":3,"version":1}`,
    );
    expect(rulesHashHex(reordered)).toBe(rulesHashHex(DEFAULT_RULES_CONFIG));
  });
});

describe('money (integers only)', () => {
  it('1 USD = 1 cpUSD at 6 decimals', () => {
    expect(microUsdToBaseUnits(12_345_678n, DEFAULT_RULES_CONFIG.usd_to_token)).toBe(12_345_678n);
  });
  it('floors on other rates', () => {
    expect(microUsdToBaseUnits(1n, { decimals: 2, rate_micro: 1_000_000 })).toBe(0n);
    expect(microUsdToBaseUnits(1_999_999n, { decimals: 2, rate_micro: 1_000_000 })).toBe(199n);
  });
  it('formats and parses without floats', () => {
    expect(formatBaseUnits(12_509_999n)).toBe('12.50');
    expect(parseDecimalToBaseUnits('12.5')).toBe(12_500_000n);
    expect(() => parseDecimalToBaseUnits('1.0000001')).toThrow();
  });
});

describe('encoding and keys', () => {
  it('base64 is strict and canonical', () => {
    expect(toBase64(fromBase64('AAEC'))).toBe('AAEC');
    expect(() => fromBase64('AAE')).toThrow();
    expect(() => fromBase64('AAF=')).toThrow(/non-canonical/);
  });
  it('parses a base58 seed and the NEAR 64-byte secret form', () => {
    const pair = keyPairFromSeed(new Uint8Array(32).fill(7));
    expect(parseSecretKey(toBase58(pair.seed)).publicKey).toEqual(pair.publicKey);
    const near = `ed25519:${toBase58(new Uint8Array([...pair.seed, ...pair.publicKey]))}`;
    expect(parseSecretKey(near).publicKey).toEqual(pair.publicKey);
    expect(() =>
      parseSecretKey(`ed25519:${toBase58(new Uint8Array([...pair.seed, ...new Uint8Array(32)]))}`),
    ).toThrow(/does not match/);
  });
  it('rejects mainnet (NFR-02)', () => {
    expect(() => assertNotMainnet('mainnet')).toThrow();
    expect(() => assertNotMainnet('testnet', 'https://rpc.mainnet.near.org')).toThrow();
    expect(() => assertNotMainnet('sandbox', 'http://localhost:3030')).not.toThrow();
  });
  it('maps Vault errors to plain language', () => {
    expect(explainVaultError('Smart contract panicked: ERR_ALREADY_USED').code).toBe(
      'ERR_ALREADY_USED',
    );
  });
});

describe('request reducer', () => {
  it('replays to the same state and ignores duplicate seqs', () => {
    const ts = '2026-11-05T10:00:00.000Z';
    const events: AgentEvent[] = [
      {
        seq: 1,
        ts,
        type: 'request.created',
        data: {
          request_id: '3f2c1d4e-8a7b-4c6d-9e0f-1a2b3c4d5e6f',
          owner_id: 'owner.test',
          text: '2 vps',
          constraints: {},
        },
      },
      {
        seq: 2,
        ts,
        type: 'research.parsed',
        data: { items: [{ item_key: 'vps', qty: 2 }], parser: 'deterministic' },
      },
      {
        seq: 3,
        ts,
        type: 'error',
        data: { code: 'GUARD_UNAVAILABLE', message: 'down', recoverable: false },
      },
    ];
    const view = replayRequest([...events, events[1]!]);
    expect(view.state).toBe('refused');
    expect(view.items).toHaveLength(1);
    expect(view.last_seq).toBe(3);
  });
});
