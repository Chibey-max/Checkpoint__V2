/**
 * Orchestrator (task D-3.3). Runs the pipeline for each request:
 *   parse → research → Guard assess → explain → Coordinator basket
 *   → (needs_ack) → Guard sign → approval watch → settlement → final.
 * Every step is an event (PRD §11.5); state is derived from the event log.
 */
import { randomUUID } from 'node:crypto';
import {
  basketHashHex,
  decodePayload,
  evidenceHashHex,
  explainVaultError,
  fromBase64,
  replayRequest,
  toHex,
  isTerminal,
  type AgentEvent,
  type AgentEventData,
  type AgentEventType,
  type AssessResponse,
  type CatalogItem,
  type CreateRequest,
  type EvidenceBundle,
  type EvidenceCore,
  type Offer,
  type RequestView,
  type RulesConfig,
  type SignBasketResponse,
} from '@checkpoint/shared';
import { silentLogger, type Logger } from '@checkpoint/guard';
import type { Settlement, VaultChain } from './chain/types';
import { planBasket } from './coordinator';
import { Explainer } from './explain';
import { GuardClientError, type GuardClient } from './guard-client';
import type { StructuredLlm } from './llm';
import { parseDeterministic, type ParseResult } from './parser/deterministic';
import { parseWithLlm } from './parser/llm';
import type { Store } from './store';

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface OrchestratorDeps {
  store: Store;
  guard: GuardClient;
  chain: VaultChain & { watch?: (hashHex: string, owner: string, expiresAtMs: number) => void };
  settlement: Settlement;
  catalog: CatalogItem[];
  offers: Offer[];
  rules: RulesConfig;
  rulesHash: string;
  agentId: string;
  tokenId: string;
  llm: StructuredLlm | null;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  uuid?: () => string;
  approvalPollMs?: number;
  settlementPollMs?: number;
  settlementTimeoutMs?: number;
  /** Pause between research.offer events so the UI timeline animates (mock/demo only). */
  researchDelayMs?: number;
  logger?: Logger;
}

type Listener = (e: AgentEvent) => void;

export class Orchestrator {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly generation = new Map<string, number>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly explainer: Explainer;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly uuid: () => string;
  private readonly log: Logger;

  constructor(private readonly d: OrchestratorDeps) {
    this.explainer = new Explainer(d.llm);
    this.now = d.now ?? Date.now;
    this.sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.uuid = d.uuid ?? randomUUID;
    this.log = d.logger ?? silentLogger;
  }

  // ── public API (used by the HTTP server) ────────────────────────────────

  get catalog(): readonly CatalogItem[] {
    return this.d.catalog;
  }

  createRequest(input: CreateRequest): string {
    const id = this.uuid();
    this.d.store.insertRequest({
      request_id: id,
      owner_id: input.owner_id,
      created_at: new Date(this.now()).toISOString(),
    });
    this.emit(id, 'request.created', {
      request_id: id,
      owner_id: input.owner_id,
      text: input.text,
      constraints: input.constraints ?? {},
    });
    const gen = this.bump(id);
    this.track(id, this.runPipeline(id, gen));
    return id;
  }

  view(id: string): RequestView {
    if (!this.d.store.getRequest(id))
      throw new HttpError(404, 'NOT_FOUND', `request ${id} not found`);
    return replayRequest(this.d.store.listEvents(id));
  }

  events(id: string, afterSeq = 0): AgentEvent[] {
    if (!this.d.store.getRequest(id))
      throw new HttpError(404, 'NOT_FOUND', `request ${id} not found`);
    return this.d.store.listEvents(id, afterSeq);
  }

  list(ownerId: string): {
    request_id: string;
    created_at: string;
    text: string;
    state: string;
    total: string | null;
  }[] {
    return this.d.store.listRequests(ownerId).map((r) => {
      const v = this.view(r.request_id);
      return {
        request_id: r.request_id,
        created_at: r.created_at,
        text: v.text,
        state: v.state,
        total: v.basket?.total ?? null,
      };
    });
  }

  subscribe(id: string, listener: Listener): () => void {
    const set = this.listeners.get(id) ?? new Set();
    set.add(listener);
    this.listeners.set(id, set);
    return () => set.delete(listener);
  }

  audit(basketId: string): EvidenceBundle {
    const b = this.d.store.getBundle(basketId);
    if (!b) throw new HttpError(404, 'NOT_FOUND', `no evidence bundle for basket ${basketId}`);
    return b;
  }

  /** Owner ticks "I reviewed this" for REVIEW offers → re-plan and re-sign (PRD §7.3 step 6). */
  acknowledge(id: string, offerIds: string[]): void {
    const view = this.view(id);
    if (!['assessed', 'needs_ack', 'signed', 'awaiting_approval'].includes(view.state)) {
      throw new HttpError(
        409,
        'BAD_STATE',
        `cannot acknowledge while the request is ${view.state}`,
      );
    }
    for (const oid of offerIds) {
      const v = view.verdicts[oid];
      if (!v || v.level !== 'REVIEW')
        throw new HttpError(
          400,
          'NOT_REVIEW',
          `only offers with a REVIEW verdict can be acknowledged (${oid})`,
        );
    }
    const row = this.d.store.getRequest(id)!;
    this.d.store.setAcks(id, [...new Set([...row.acknowledged_offer_ids, ...offerIds])].sort());
    const gen = this.bump(id);
    this.track(id, this.planAndSign(id, gen));
  }

  cancel(id: string): void {
    const view = this.view(id);
    if (isTerminal(view.state) || view.state === 'executing') {
      throw new HttpError(409, 'BAD_STATE', `cannot cancel while the request is ${view.state}`);
    }
    this.bump(id);
    const approved = view.state === 'awaiting_approval';
    this.emit(id, 'error', {
      code: 'CANCELLED',
      message: approved
        ? 'Cancelled. If you already approved this basket in your wallet, revoke the approval (revoke_approval).'
        : 'Cancelled.',
      recoverable: false,
    });
  }

  /** Restart approval watchers after a restart (FR-AG01: requests survive restarts). */
  resume(): void {
    for (const id of this.d.store.allRequestIds()) {
      const v = replayRequest(this.d.store.listEvents(id));
      if (v.state === 'awaiting_approval' && v.signed && v.signed.expires_at_ms > this.now()) {
        const gen = this.bump(id);
        this.track(id, this.watchApproval(id, gen, v.signed, false));
      }
    }
  }

  /** Resolves when every pipeline step started so far for this request has finished (tests, shutdown). */
  async whenIdle(id: string): Promise<void> {
    for (;;) {
      const p = this.running.get(id);
      await p;
      if (this.running.get(id) === p) return;
    }
  }

  // ── pipeline ───────────────────────────────────────────────────────────

  private emit<T extends AgentEventType>(id: string, type: T, data: AgentEventData<T>): AgentEvent {
    const e = this.d.store.appendEvent(id, type, data, new Date(this.now()).toISOString());
    for (const l of this.listeners.get(id) ?? []) {
      try {
        l(e);
      } catch (err) {
        this.log.warn('listener failed', { error: (err as Error).message });
      }
    }
    return e;
  }

  private bump(id: string): number {
    const g = (this.generation.get(id) ?? 0) + 1;
    this.generation.set(id, g);
    return g;
  }

  private current(id: string, gen: number): boolean {
    return this.generation.get(id) === gen;
  }

  private track(id: string, p: Promise<void>): void {
    const guarded = p.catch((e: Error) => {
      this.log.error('pipeline failed', { request_id: id, error: e.message });
      try {
        this.emit(id, 'error', {
          code: 'INTERNAL',
          message: 'Internal error in the agents service.',
          recoverable: false,
        });
      } catch {
        /* store unavailable */
      }
    });
    const prev = this.running.get(id) ?? Promise.resolve();
    this.running.set(
      id,
      Promise.all([prev, guarded]).then(() => undefined),
    );
  }

  private guardFailure(id: string, e: unknown, step: string): void {
    if (e instanceof GuardClientError) {
      this.emit(id, 'error', {
        code: e.unavailable ? 'GUARD_UNAVAILABLE' : e.code,
        message: e.unavailable
          ? `Guard unavailable during ${step}: no new baskets can be signed. Deposits and withdrawals still work.`
          : e.message,
        recoverable: false,
      });
      return;
    }
    throw e;
  }

  private async runPipeline(id: string, gen: number): Promise<void> {
    const view = this.view(id);
    let parsed: ParseResult;
    let parser: 'deterministic' | 'llm' = 'deterministic';
    if (this.d.llm) {
      try {
        parsed = await parseWithLlm(this.d.llm, view.text, this.d.catalog);
        parser = 'llm';
      } catch (e) {
        this.emit(id, 'error', {
          code: 'LLM_PARSE_FAILED',
          message: `LLM parser unavailable (${(e as Error).message}); used the deterministic parser.`,
          recoverable: true,
        });
        parsed = parseDeterministic(view.text, this.d.catalog);
      }
    } else {
      parsed = parseDeterministic(view.text, this.d.catalog);
    }
    if (!this.current(id, gen)) return;
    this.emit(id, 'research.parsed', { items: parsed.items, parser });
    if (parsed.unmatched.length)
      this.emit(id, 'research.unmatched', { unmatched: parsed.unmatched });
    if (!parsed.items.length) {
      this.emit(id, 'error', {
        code: 'NO_ITEMS',
        message: 'Nothing in the list matches the catalogue.',
        recoverable: false,
      });
      return;
    }

    const keys = new Set(parsed.items.map((i) => i.item_key));
    const offers = this.d.offers.filter((o) => keys.has(o.item_key));
    for (const offer of offers) {
      if (!this.current(id, gen)) return;
      this.emit(id, 'research.offer', { offer });
      if (this.d.researchDelayMs) await this.sleep(this.d.researchDelayMs);
    }
    if (!offers.length) {
      this.emit(id, 'error', {
        code: 'NO_OFFERS',
        message: 'The snapshot has no offers for these items.',
        recoverable: false,
      });
      return;
    }

    let assessed: AssessResponse;
    try {
      assessed = await this.d.guard.assess({
        offer_ids: offers.map((o) => o.offer_id),
        owner_id: view.owner_id!,
      });
    } catch (e) {
      this.guardFailure(id, e, 'assessment');
      return;
    }
    if (!this.current(id, gen)) return;
    for (const v of assessed.verdicts) {
      this.emit(id, 'policy.verdict', {
        verdict: v,
        median_micro: assessed.medians[v.item_key] ?? null,
      });
    }

    // Explanations are advisory: they stream in when ready and never hold up
    // planning or signing (NFR-07 measures request → signed basket).
    void this.explainer
      .explain({ verdicts: assessed.verdicts, basket: null })
      .then((ex) => {
        if (!this.current(id, gen)) return;
        if (ex.llmError)
          this.emit(id, 'error', {
            code: 'LLM_EXPLAIN_FAILED',
            message: `Explanations use templates (${ex.llmError}).`,
            recoverable: true,
          });
        for (const v of ex.verdicts)
          this.emit(id, 'explain.verdict', {
            offer_id: v.offer_id,
            text: v.text,
            source: v.source,
            advisory: true,
          });
      })
      .catch(() => undefined);

    await this.planAndSign(id, gen);
  }

  private async planAndSign(id: string, gen: number): Promise<void> {
    if (!this.current(id, gen)) return;
    const view = this.view(id);
    const row = this.d.store.getRequest(id)!;
    const owner = view.owner_id!;

    let maxVendors: number;
    try {
      maxVendors = await this.d.chain.getMaxVendors();
    } catch (e) {
      this.emit(id, 'error', {
        code: 'CHAIN_UNAVAILABLE',
        message: `Cannot read the Vault policy: ${(e as Error).message}`,
        recoverable: false,
      });
      return;
    }

    const basketId = this.uuid();
    const plan = planBasket({
      request_id: id,
      basket_id: basketId,
      owner_id: owner,
      token_id: this.d.tokenId,
      items: view.items,
      offers: view.offers,
      verdicts: view.verdicts,
      acknowledged_offer_ids: row.acknowledged_offer_ids,
      ...(view.constraints.preferred_vendors
        ? { preferred_vendors: view.constraints.preferred_vendors }
        : {}),
      max_vendors: maxVendors,
      rate: this.d.rules.usd_to_token,
    });
    if (!plan.ok) {
      this.emit(id, 'error', { code: plan.code, message: plan.message, recoverable: false });
      return;
    }
    if (plan.unfilled.length) {
      this.emit(id, 'error', {
        code: 'NO_ELIGIBLE_OFFER',
        message: `No offer passed the rules for: ${plan.unfilled.join(', ')}. They are left out of the basket.`,
        recoverable: true,
      });
    }
    if (
      view.constraints.max_total &&
      BigInt(plan.basket.total) > BigInt(view.constraints.max_total)
    ) {
      this.emit(id, 'error', {
        code: 'OVER_OWNER_BUDGET',
        message: `The cheapest allowed basket costs more than your max total.`,
        recoverable: false,
      });
      return;
    }

    const byId = (a: { offer_id: string }, b: { offer_id: string }) =>
      a.offer_id < b.offer_id ? -1 : a.offer_id > b.offer_id ? 1 : 0;
    const core: EvidenceCore = {
      schema: 'checkpoint-evidence-v1',
      request: {
        request_id: id,
        owner_id: owner,
        text: view.text,
        constraints: view.constraints,
        items: view.items,
        unmatched: view.unmatched,
      },
      offers: [...view.offers].sort(byId),
      verdicts: Object.values(view.verdicts).sort(byId),
      rules: { config: this.d.rules, rules_hash: this.d.rulesHash },
      acknowledged_offer_ids: row.acknowledged_offer_ids,
      basket: plan.basket,
    };
    const evidenceHash = evidenceHashHex(core);
    this.d.store.putBundle({
      core,
      evidence_hash: evidenceHash,
      signed: null,
      chain: { approve_tx: null, execute_tx: null, payouts: [], final_status: null },
    });
    this.emit(id, 'coordinator.basket', {
      basket: { ...plan.basket, evidence_hash: evidenceHash },
      acknowledged_offer_ids: row.acknowledged_offer_ids,
    });

    if (plan.needs_ack.length) {
      this.emit(id, 'coordinator.needs_ack', {
        offer_ids: plan.needs_ack,
        reasons: plan.needs_ack.map((oid) => ({
          offer_id: oid,
          findings: view.verdicts[oid]!.findings.filter((f) => f.level === 'REVIEW'),
        })),
      });
      return;
    }

    let signed: SignBasketResponse;
    try {
      signed = await this.d.guard.signBasket({
        request_id: id,
        basket_id: basketId,
        owner_id: owner,
        agent_id: this.d.agentId,
        token_id: this.d.tokenId,
        lines: plan.basket.lines.map((l) => ({
          item_key: l.item_key,
          offer_id: l.offer_id,
          qty: l.qty,
        })),
        acknowledged_offer_ids: row.acknowledged_offer_ids,
        evidence_hash: evidenceHash,
      });
    } catch (e) {
      if (e instanceof GuardClientError) {
        this.emit(id, 'guard.refused', {
          code: e.unavailable ? 'GUARD_UNAVAILABLE' : e.code,
          message: e.unavailable
            ? 'Guard is unavailable, so no signature. Deposits and withdrawals still work.'
            : e.message,
          findings: e.findings,
        });
        return;
      }
      throw e;
    }
    if (!this.current(id, gen)) return;

    // Cross-check Guard's bytes against our own basket before anyone is asked to approve them.
    const bytes = fromBase64(signed.payload_b64);
    const p = decodePayload(bytes);
    const mismatch =
      basketHashHex(bytes) !== signed.hash_hex
        ? 'hash'
        : toHex(p.evidence_hash) !== evidenceHash
          ? 'evidence_hash'
          : p.total.toString() !== plan.basket.total
            ? 'total'
            : p.basket_id !== basketId
              ? 'basket_id'
              : null;
    if (mismatch) {
      this.emit(id, 'error', {
        code: 'SIGNED_BASKET_MISMATCH',
        message: `Guard's signed payload does not match the planned basket (${mismatch}).`,
        recoverable: false,
      });
      return;
    }

    const sb = {
      payload_b64: signed.payload_b64,
      hash_hex: signed.hash_hex,
      signature_b64: signed.signature_b64,
      guard_key_version: signed.guard_key_version,
      expires_at_ms: signed.expires_at_ms,
    };
    this.d.store.updateBundle(basketId, (b) => ({ ...b, signed: sb }), signed.hash_hex);
    this.emit(id, 'guard.signed', {
      signed: sb,
      basket_id: signed.basket_id,
      payouts: signed.payouts,
      total: signed.total,
      findings: signed.findings,
    });

    void this.explainer
      .explain({ verdicts: [], basket: { ...plan.basket, evidence_hash: evidenceHash } })
      .then((ex) => {
        if (ex.basket && this.current(id, gen))
          this.emit(id, 'explain.basket', {
            text: ex.basket.text,
            source: ex.basket.source,
            advisory: true,
          });
      })
      .catch(() => undefined);

    await this.watchApproval(id, gen, sb, true);
  }

  private async watchApproval(
    id: string,
    gen: number,
    signed: { payload_b64: string; hash_hex: string; signature_b64: string; expires_at_ms: number },
    announce: boolean,
  ): Promise<void> {
    const owner = this.d.store.getRequest(id)!.owner_id;
    const basketId = decodePayload(fromBase64(signed.payload_b64)).basket_id;
    if (announce)
      this.emit(id, 'approval.waiting', {
        hash_hex: signed.hash_hex,
        expires_at_ms: signed.expires_at_ms,
      });
    this.d.chain.watch?.(signed.hash_hex, owner, signed.expires_at_ms);

    let seen = false;
    let reportedError = false;
    while (this.now() < signed.expires_at_ms) {
      if (!this.current(id, gen)) return;
      try {
        const a = await this.d.chain.getApproval(signed.hash_hex);
        if (a && a.owner === owner) {
          seen = true;
          break;
        }
      } catch (e) {
        if (!reportedError) {
          reportedError = true;
          this.emit(id, 'error', {
            code: 'CHAIN_UNAVAILABLE',
            message: `Cannot check the approval yet: ${(e as Error).message}. Still trying.`,
            recoverable: true,
          });
        }
      }
      await this.sleep(this.d.approvalPollMs ?? 2_000);
    }
    if (!this.current(id, gen)) return;
    if (!seen) {
      this.emit(id, 'approval.expired', { hash_hex: signed.hash_hex });
      return;
    }
    this.emit(id, 'approval.seen', { hash_hex: signed.hash_hex, owner_id: owner });

    let txHash: string;
    try {
      txHash = (await this.d.settlement.execute(signed.payload_b64, signed.signature_b64)).tx_hash;
    } catch (e) {
      const { code, message } = explainVaultError((e as Error).message);
      this.emit(id, 'error', {
        code: code ?? 'SETTLEMENT_FAILED',
        message: code ? message : (e as Error).message,
        recoverable: false,
      });
      return;
    }
    this.emit(id, 'settlement.submitted', { hash_hex: signed.hash_hex, tx_hash: txHash });
    this.d.store.updateBundle(basketId, (b) => ({
      ...b,
      chain: { ...b.chain, execute_tx: txHash },
    }));

    const deadline = this.now() + (this.d.settlementTimeoutMs ?? 60_000);
    const reported = new Set<number>();
    while (this.now() < deadline) {
      let b = null;
      try {
        b = await this.d.chain.getBasket(signed.hash_hex);
      } catch {
        /* keep polling */
      }
      if (b) {
        b.payouts.forEach((po, index) => {
          if (po.status !== 'Executing' && !reported.has(index)) {
            reported.add(index);
            this.emit(id, 'settlement.payout', {
              index,
              vendor_id: po.vendor,
              amount: po.amount,
              status: po.status,
              tx_hash: txHash,
            });
          }
        });
        if (b.status !== 'Executing') {
          const final = b;
          this.emit(id, 'settlement.final', { hash_hex: signed.hash_hex, status: final.status });
          this.d.store.updateBundle(basketId, (x) => ({
            ...x,
            chain: {
              ...x.chain,
              payouts: final.payouts.map((po, index) => ({
                index,
                vendor_id: po.vendor,
                amount: po.amount,
                status: po.status,
              })),
              final_status: final.status,
            },
          }));
          return;
        }
      }
      await this.sleep(this.d.settlementPollMs ?? 1_500);
    }
    this.emit(id, 'error', {
      code: 'SETTLEMENT_TIMEOUT',
      message: 'Payouts are still executing; check the explorer link.',
      recoverable: true,
    });
  }
}
