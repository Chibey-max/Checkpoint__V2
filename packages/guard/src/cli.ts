/**
 * Guard CLI (FR-R08).
 *   pnpm guard assess --fixture <file> [--json]
 *   pnpm guard assess --snapshot <dir> [--allow a,b,...] [--now ISO] [--json]
 *   pnpm guard rules-hash [--config <path>]
 *   pnpm guard keygen [--env <file>] [--force]
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  CatalogItemSchema,
  OfferSchema,
  RulesConfigSchema,
  canonicalRulesConfig,
  formatBaseUnits,
  generateKeyPair,
  rulesHashHex,
  toBase58,
  toHex,
  type RulesConfig,
} from '@checkpoint/shared';
import { loadSnapshotOrThrow, resolveFromRoot } from '@checkpoint/shared/node';
import { z } from 'zod';
import { loadRulesConfig } from './config';
import { assessOffers, type AssessResult } from './rules';

const FixtureSchema = z.object({
  catalog: z.array(CatalogItemSchema),
  offers: z.array(z.unknown()),
  allowed_vendors: z.array(z.string()),
  offer_ids: z.array(z.string()).optional(),
  now: z.string().optional(),
  rules: RulesConfigSchema.optional(),
});

function table(res: AssessResult): string {
  const rows = res.verdicts.map((v) => [
    v.offer_id,
    v.item_key,
    v.vendor_id,
    v.unit_price_micro ? `$${formatBaseUnits(BigInt(v.unit_price_micro))}` : '-',
    v.ratio_bps === null ? '-' : `${(v.ratio_bps / 100).toFixed(2)}%`,
    v.level,
    v.findings.map((f) => f.rule_id).join(' '),
  ]);
  const head = ['offer', 'item', 'vendor', 'unit price', 'vs median', 'verdict', 'rules'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  const lines = [fmt(head), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(fmt)];
  const medians = Object.entries(res.medians).map(
    ([k, m]) => `  ${k}: ${m === null ? '-' : `$${formatBaseUnits(BigInt(m))}`}`,
  );
  return [...lines, '', 'medians:', ...medians].join('\n');
}

function assessCmd(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      fixture: { type: 'string' },
      snapshot: { type: 'string' },
      allow: { type: 'string' },
      now: { type: 'string' },
      config: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  let rules: RulesConfig = loadRulesConfig(
    resolveFromRoot(values.config ?? './config/rules.config.json'),
  );
  let input: Parameters<typeof assessOffers>[0];
  if (values.fixture) {
    const fx = FixtureSchema.parse(JSON.parse(readFileSync(values.fixture, 'utf8')));
    if (fx.rules) rules = fx.rules;
    const offers = fx.offers.map((o) => OfferSchema.parse(o));
    input = {
      offers,
      catalog: fx.catalog,
      offerIds: fx.offer_ids ?? offers.map((o) => o.offer_id),
      config: rules,
      rulesHash: rulesHashHex(rules),
      allowedVendors: fx.allowed_vendors,
      nowMs: Date.parse(values.now ?? fx.now ?? new Date().toISOString()),
    };
  } else if (values.snapshot) {
    const snap = loadSnapshotOrThrow(resolveFromRoot(values.snapshot));
    input = {
      offers: snap.offers,
      catalog: snap.catalog,
      offerIds: snap.offers.map((o) => o.offer_id),
      config: rules,
      rulesHash: rulesHashHex(rules),
      allowedVendors: (
        values.allow ??
        ['01', '02', '03', '04', '06'].map((n) => `vendor-${n}.cpdemo.testnet`).join(',')
      ).split(','),
      nowMs: Date.parse(values.now ?? new Date().toISOString()),
    };
  } else {
    throw new Error('assess needs --fixture <file> or --snapshot <dir>');
  }
  if (Number.isNaN(input.nowMs)) throw new Error('--now must be an ISO timestamp');
  const res = assessOffers(input);
  if (values.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(table(res));
    console.log(`\nrules_hash ${input.rulesHash}\n`);
    console.log(JSON.stringify(res, null, 2));
  }
}

function rulesHashCmd(args: string[]) {
  const { values } = parseArgs({ args, options: { config: { type: 'string' } } });
  const path = resolveFromRoot(values.config ?? './config/rules.config.json');
  const rules = loadRulesConfig(path);
  console.log(`config     ${path}`);
  console.log(`canonical  ${canonicalRulesConfig(rules)}`);
  console.log(`rules_hash ${rulesHashHex(rules)}`);
}

/**
 * keygen            prints a new seed (copy it into the password manager and .env).
 * keygen --env FILE writes GUARD_SECRET_KEY into FILE without printing the secret;
 *                   refuses to replace an existing key unless --force.
 */
function keygenCmd(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { env: { type: 'string' }, force: { type: 'boolean', default: false } },
  });
  const pair = generateKeyPair();
  const line = `GUARD_SECRET_KEY=${toBase58(pair.seed)}`;
  if (values.env) {
    const path = resolveFromRoot(values.env);
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const current = /^GUARD_SECRET_KEY=[ \t]*([^\s#]*)/m.exec(text);
    if (current?.[1] && !values.force) {
      throw new Error(
        `${path} already has a GUARD_SECRET_KEY; pass --force to replace it (the old key is lost)`,
      );
    }
    const next = current
      ? text.replace(/^GUARD_SECRET_KEY=.*$/m, line)
      : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
    writeFileSync(path, next, { mode: 0o600 });
    chmodSync(path, 0o600);
    console.log(
      `Wrote a new GUARD_SECRET_KEY to ${path} (not shown). Back it up in the team password manager.`,
    );
  } else {
    console.log(
      'New Guard ed25519 key. Store the secret in the team password manager and in .env on the',
    );
    console.log('machine that runs Guard only. Never commit it, paste it in chat, or log it.\n');
    console.log(line);
  }
  console.log(`\npublic key (base58, for set_guard_key / Vault init): ${toBase58(pair.publicKey)}`);
  console.log(`public key (hex, 32 bytes):                         ${toHex(pair.publicKey)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'assess') assessCmd(rest);
  else if (cmd === 'rules-hash') rulesHashCmd(rest);
  else if (cmd === 'keygen') keygenCmd(rest);
  else {
    console.error('usage: pnpm guard <assess|rules-hash|keygen> [options]');
    process.exit(2);
  }
} catch (e) {
  console.error(`guard: ${(e as Error).message}`);
  process.exit(1);
}
