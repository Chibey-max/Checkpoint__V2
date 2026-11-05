/**
 * Evidence store loader (task D-1.2, PRD §10.2). Node-only.
 *
 * Layout of EVIDENCE_DIR (default ./data/snapshot):
 *   catalog.json            [CatalogItem] or { items: [CatalogItem] }
 *   offers.json             [Offer] or { offers: [Offer] }   captured real listings
 *   fixtures/*.json         [Offer] or { offers: [Offer] }   adversarial rows, capture_method "fixture"
 *
 * Fixture rows are loaded with the captured rows so the demo shows them, but
 * each must say capture_method: "fixture" so the UI and docs can label it as
 * synthetic (docs/decisions-pending.md, item 5).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { z } from 'zod';
import {
  CatalogItemSchema,
  OfferSchema,
  StrictOfferSchema,
  type CatalogItem,
  type Offer,
} from '../schemas';

export interface SnapshotIssue {
  file: string;
  row: number | null; // 1-based row in the array, null for file-level issues
  offer_id?: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface Snapshot {
  dir: string;
  catalog: CatalogItem[];
  offers: Offer[];
  /** offer_id → source file (relative to dir) */
  sources: Record<string, string>;
  issues: SnapshotIssue[];
}

export class SnapshotError extends Error {
  constructor(
    message: string,
    readonly issues: SnapshotIssue[],
  ) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function readJsonArray(
  path: string,
  key: 'items' | 'offers',
  rel: string,
  issues: SnapshotIssue[],
): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    issues.push({
      file: rel,
      row: null,
      field: '(file)',
      message: `invalid JSON: ${(e as Error).message}`,
      severity: 'error',
    });
    return [];
  }
  if (Array.isArray(parsed)) return parsed;
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as Record<string, unknown>)[key])
  ) {
    return (parsed as Record<string, unknown[]>)[key]!;
  }
  issues.push({
    file: rel,
    row: null,
    field: '(file)',
    message: `expected an array or { "${key}": [...] }`,
    severity: 'error',
  });
  return [];
}

function zodIssues(
  err: z.ZodError,
  file: string,
  row: number,
  offerId: string | undefined,
  severity: 'error' | 'warning',
): SnapshotIssue[] {
  return err.issues.map((i) => ({
    file,
    row,
    ...(offerId ? { offer_id: offerId } : {}),
    field: i.path.join('.') || '(row)',
    message: i.message,
    severity,
  }));
}

/**
 * Load and validate a snapshot directory. Rows that fail the lenient schema
 * are skipped and reported as errors; rows that fail only the strict schema
 * load (Guard's R-01 judges them) and are reported as warnings, unless they
 * are fixtures, which are allowed to be deliberately broken.
 */
export function loadSnapshot(dir: string): Snapshot {
  const issues: SnapshotIssue[] = [];
  const catalog: CatalogItem[] = [];
  const offers: Offer[] = [];
  const sources: Record<string, string> = {};

  const catalogPath = join(dir, 'catalog.json');
  if (!existsSync(catalogPath)) {
    issues.push({
      file: 'catalog.json',
      row: null,
      field: '(file)',
      message: 'missing',
      severity: 'error',
    });
  } else {
    readJsonArray(catalogPath, 'items', 'catalog.json', issues).forEach((raw, i) => {
      const r = CatalogItemSchema.safeParse(raw);
      if (!r.success) issues.push(...zodIssues(r.error, 'catalog.json', i + 1, undefined, 'error'));
      else if (catalog.some((c) => c.item_key === r.data.item_key)) {
        issues.push({
          file: 'catalog.json',
          row: i + 1,
          field: 'item_key',
          message: `duplicate item_key ${r.data.item_key}`,
          severity: 'error',
        });
      } else catalog.push(r.data);
    });
  }

  const offerFiles: string[] = [];
  if (existsSync(join(dir, 'offers.json'))) offerFiles.push(join(dir, 'offers.json'));
  else
    issues.push({
      file: 'offers.json',
      row: null,
      field: '(file)',
      message: 'missing',
      severity: 'error',
    });
  const fixturesDir = join(dir, 'fixtures');
  if (existsSync(fixturesDir)) {
    for (const f of readdirSync(fixturesDir)
      .filter((n) => n.endsWith('.json'))
      .sort())
      offerFiles.push(join(fixturesDir, f));
  }

  const itemKeys = new Set(catalog.map((c) => c.item_key));
  for (const path of offerFiles) {
    const rel = relative(dir, path);
    const isFixtureFile = rel.startsWith('fixtures');
    readJsonArray(path, 'offers', rel, issues).forEach((raw, i) => {
      const row = i + 1;
      const r = OfferSchema.safeParse(raw);
      const id = (raw as { offer_id?: unknown })?.offer_id;
      const offerId = typeof id === 'string' ? id : undefined;
      if (!r.success) {
        issues.push(...zodIssues(r.error, rel, row, offerId, 'error'));
        return;
      }
      const o = r.data;
      if (sources[o.offer_id]) {
        issues.push({
          file: rel,
          row,
          offer_id: o.offer_id,
          field: 'offer_id',
          message: `duplicate offer_id (also in ${sources[o.offer_id]})`,
          severity: 'error',
        });
        return;
      }
      if (!itemKeys.has(o.item_key)) {
        issues.push({
          file: rel,
          row,
          offer_id: o.offer_id,
          field: 'item_key',
          message: `unknown item_key ${o.item_key}`,
          severity: 'error',
        });
        return;
      }
      if (isFixtureFile && o.capture_method !== 'fixture') {
        issues.push({
          file: rel,
          row,
          offer_id: o.offer_id,
          field: 'capture_method',
          message: 'rows under fixtures/ must have capture_method "fixture"',
          severity: 'error',
        });
        return;
      }
      if (o.capture_method !== 'fixture') {
        const strict = StrictOfferSchema.safeParse(o);
        if (!strict.success)
          issues.push(...zodIssues(strict.error, rel, row, o.offer_id, 'warning'));
      }
      offers.push(o);
      sources[o.offer_id] = rel;
    });
  }

  for (const item of catalog) {
    const n = offers.filter(
      (o) => o.item_key === item.item_key && o.capture_method !== 'fixture',
    ).length;
    if (n < 3) {
      issues.push({
        file: 'offers.json',
        row: null,
        field: item.item_key,
        message: `only ${n} captured offer(s); R-03 needs at least 3 (P-0.1 asks for 4–6)`,
        severity: 'warning',
      });
    }
  }

  return { dir, catalog, offers, sources, issues };
}

/** Load a snapshot and throw if it has any errors (warnings are allowed). */
export function loadSnapshotOrThrow(dir: string): Snapshot {
  const snap = loadSnapshot(dir);
  const errors = snap.issues.filter((i) => i.severity === 'error');
  if (errors.length) {
    throw new SnapshotError(
      `snapshot ${dir} has ${errors.length} error(s); run pnpm snapshot:check`,
      errors,
    );
  }
  return snap;
}

export function formatIssues(issues: SnapshotIssue[]): string {
  return issues
    .map(
      (i) =>
        `${i.severity.toUpperCase().padEnd(7)} ${i.file}${i.row ? `:${i.row}` : ''}${i.offer_id ? ` [${i.offer_id}]` : ''} ${i.field}: ${i.message}`,
    )
    .join('\n');
}
