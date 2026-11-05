/**
 * Request, event and evidence-bundle store (FR-AG01, FR-AG02). Every state
 * change is written as an event first; request state is derived from the
 * events with the shared reducer, so replay and audit come for free.
 *
 * Uses Node's built-in SQLite (node:sqlite, Node ≥ 22.13) instead of
 * better-sqlite3, so a clean machine needs no C++ toolchain (decisions-pending item 9).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  AgentEventSchema,
  EvidenceBundleSchema,
  type AgentEvent,
  type AgentEventData,
  type AgentEventType,
  type EvidenceBundle,
} from '@checkpoint/shared';

export interface RequestRow {
  request_id: string;
  owner_id: string;
  created_at: string;
  acknowledged_offer_ids: string[];
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS requests (
        request_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        acks TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS requests_owner ON requests(owner_id, created_at);
      CREATE TABLE IF NOT EXISTS events (
        request_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (request_id, seq)
      );
      CREATE TABLE IF NOT EXISTS bundles (
        basket_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        hash_hex TEXT,
        bundle TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  insertRequest(row: Omit<RequestRow, 'acknowledged_offer_ids'>): void {
    this.db
      .prepare('INSERT INTO requests (request_id, owner_id, created_at) VALUES (?, ?, ?)')
      .run(row.request_id, row.owner_id, row.created_at);
  }

  getRequest(id: string): RequestRow | null {
    const r = this.db.prepare('SELECT * FROM requests WHERE request_id = ?').get(id) as
      { request_id: string; owner_id: string; created_at: string; acks: string } | undefined;
    return r
      ? {
          request_id: r.request_id,
          owner_id: r.owner_id,
          created_at: r.created_at,
          acknowledged_offer_ids: JSON.parse(r.acks),
        }
      : null;
  }

  listRequests(ownerId: string, limit = 50): RequestRow[] {
    const rows = this.db
      .prepare('SELECT * FROM requests WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(ownerId, limit) as {
      request_id: string;
      owner_id: string;
      created_at: string;
      acks: string;
    }[];
    return rows.map((r) => ({
      request_id: r.request_id,
      owner_id: r.owner_id,
      created_at: r.created_at,
      acknowledged_offer_ids: JSON.parse(r.acks),
    }));
  }

  allRequestIds(): string[] {
    return (
      this.db.prepare('SELECT request_id FROM requests').all() as { request_id: string }[]
    ).map((r) => r.request_id);
  }

  setAcks(id: string, acks: string[]): void {
    this.db
      .prepare('UPDATE requests SET acks = ? WHERE request_id = ?')
      .run(JSON.stringify(acks), id);
  }

  /** Append an event with the next seq. The event is schema-checked before it is stored. */
  appendEvent<T extends AgentEventType>(
    id: string,
    type: T,
    data: AgentEventData<T>,
    ts = new Date().toISOString(),
  ): AgentEvent {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM events WHERE request_id = ?')
      .get(id) as { s: number };
    const event = AgentEventSchema.parse({ seq: row.s + 1, ts, type, data });
    this.db
      .prepare('INSERT INTO events (request_id, seq, ts, type, data) VALUES (?, ?, ?, ?, ?)')
      .run(id, event.seq, event.ts, event.type, JSON.stringify(event.data));
    return event;
  }

  listEvents(id: string, afterSeq = 0): AgentEvent[] {
    const rows = this.db
      .prepare(
        'SELECT seq, ts, type, data FROM events WHERE request_id = ? AND seq > ? ORDER BY seq',
      )
      .all(id, afterSeq) as {
      seq: number;
      ts: string;
      type: string;
      data: string;
    }[];
    return rows.map(
      (r) => ({ seq: r.seq, ts: r.ts, type: r.type, data: JSON.parse(r.data) }) as AgentEvent,
    );
  }

  putBundle(bundle: EvidenceBundle, hashHex: string | null = null): void {
    const b = EvidenceBundleSchema.parse(bundle);
    this.db
      .prepare(
        'INSERT INTO bundles (basket_id, request_id, hash_hex, bundle) VALUES (?, ?, ?, ?) ON CONFLICT(basket_id) DO UPDATE SET bundle = excluded.bundle, hash_hex = COALESCE(excluded.hash_hex, bundles.hash_hex)',
      )
      .run(b.core.basket.basket_id, b.core.request.request_id, hashHex, JSON.stringify(b));
  }

  getBundle(basketId: string): EvidenceBundle | null {
    const r = this.db.prepare('SELECT bundle FROM bundles WHERE basket_id = ?').get(basketId) as
      { bundle: string } | undefined;
    return r ? EvidenceBundleSchema.parse(JSON.parse(r.bundle)) : null;
  }

  updateBundle(
    basketId: string,
    patch: (b: EvidenceBundle) => EvidenceBundle,
    hashHex: string | null = null,
  ): void {
    const cur = this.getBundle(basketId);
    if (cur) this.putBundle(patch(cur), hashHex);
  }
}
