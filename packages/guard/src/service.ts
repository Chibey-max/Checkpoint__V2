/**
 * Guard service logic, independent of HTTP: assess offers (R-01–R-10) and
 * sign exact baskets after re-running every rule against live Vault views
 * (R-20–R-24). Fails closed whenever the Vault cannot be read (FR-R07).
 */
import { randomUUID } from 'node:crypto';
import {
  basketHash,
  encodePayload,
  fromHex,
  groupPayouts,
  lineAmountBaseUnits,
  secureRandomBytes,
  toBase64,
  toHex,
  unitPriceMicro,
  utcDayIndex,
  type AssessRequest,
  type AssessResponse,
  type BasketPayloadV1,
  type CatalogItem,
  type Finding,
  type GuardErrorCode,
  type Offer,
  type RulesConfig,
  type SignBasketRequest,
  type SignBasketResponse,
  type VaultPolicyView,
} from '@checkpoint/shared';
import { silentLogger, type Logger } from './logger';
import { assessBasket, assessOffers, UnknownOfferError } from './rules';
import type { GuardSigner } from './signer';
import { VaultUnavailableError, type VaultViews } from './vault/views';

export class GuardHttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 422 | 429 | 500 | 503,
    readonly code: GuardErrorCode,
    message: string,
    readonly findings?: Finding[],
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'GuardHttpError';
  }
}

export interface GuardServiceDeps {
  rules: RulesConfig;
  rulesHash: string;
  catalog: CatalogItem[];
  offers: Offer[];
  vault: VaultViews;
  signer: GuardSigner;
  networkId: string;
  vaultId: string;
  guardKeyVersion: number;
  /** --dev: skip the rules-hash match (FR-R06). Never on testnet. */
  dev: boolean;
  /** Wall clock for payload timestamps. */
  now?: () => number;
  /** Clock for R-02 staleness; defaults to `now`. Pinned in the sandbox demo for reproducibility. */
  assessNow?: () => number;
  /** Signature lifetime; capped by the Vault's max_ttl_ms. Default 15 minutes. */
  ttlMs?: number;
  randomNonce?: () => bigint;
  randomUuid?: () => string;
  logger?: Logger;
}

function randomU64(): bigint {
  const b = secureRandomBytes(8);
  return new DataView(b.buffer, b.byteOffset, 8).getBigUint64(0, true);
}

/** How long /v1/health reuses its last Vault read. */
export const HEALTH_CACHE_MS = 30_000;

export class GuardService {
  private readonly now: () => number;
  private readonly assessNow: () => number;
  private readonly ttlMs: bigint;
  private readonly randomNonce: () => bigint;
  private readonly randomUuid: () => string;
  private readonly log: Logger;

  constructor(private readonly d: GuardServiceDeps) {
    this.now = d.now ?? Date.now;
    this.assessNow = d.assessNow ?? this.now;
    this.ttlMs = BigInt(d.ttlMs ?? 15 * 60_000);
    this.randomNonce = d.randomNonce ?? randomU64;
    this.randomUuid = d.randomUuid ?? randomUUID;
    this.log = d.logger ?? silentLogger;
  }

  get offers(): readonly Offer[] {
    return this.d.offers;
  }

  policyInfo() {
    return {
      rules: this.d.rules,
      rules_hash: this.d.rulesHash,
      guard_pubkey_b58: this.d.signer.publicKeyB58,
      guard_key_version: this.d.guardKeyVersion,
      vault_id: this.d.vaultId,
      network_id: this.d.networkId,
    };
  }

  /** Problems that make Guard unfit to sign against this Vault. Empty = consistent. */
  policyProblems(policy: VaultPolicyView): { code: GuardErrorCode; message: string }[] {
    const out: { code: GuardErrorCode; message: string }[] = [];
    if (policy.network_id !== this.d.networkId) {
      out.push({
        code: 'GUARD_DEPENDENCY_DOWN',
        message: `Vault network is ${policy.network_id}, Guard is configured for ${this.d.networkId}`,
      });
    }
    if (policy.rules_hash !== this.d.rulesHash && !this.d.dev) {
      out.push({
        code: 'RULES_HASH_MISMATCH',
        message: `local rules_hash ${this.d.rulesHash} ≠ Vault rules_hash ${policy.rules_hash}; a DAO vote must pin the new hash first`,
      });
    }
    if (
      policy.guard_pubkey !== this.d.signer.publicKeyB58 ||
      policy.guard_key_version !== this.d.guardKeyVersion
    ) {
      out.push({
        code: 'GUARD_KEY_MISMATCH',
        message: `Vault expects Guard key v${policy.guard_key_version} ${policy.guard_pubkey || '(none)'}, this Guard has v${this.d.guardKeyVersion} ${this.d.signer.publicKeyB58}`,
      });
    }
    if (policy.guard_key_disabled)
      out.push({ code: 'GUARD_KEY_MISMATCH', message: 'the Guard key is disabled in the Vault' });
    return out;
  }

  /** Startup check (FR-R06): refuse to run if the Vault disagrees, except in --dev for the rules hash. */
  async startupCheck(): Promise<{ code: GuardErrorCode; message: string }[]> {
    const policy = await this.d.vault.getPolicy();
    return this.policyProblems(policy);
  }

  /**
   * Health is polled often (Render checks every 5 s), so the Vault read behind it
   * is cached for HEALTH_CACHE_MS. Without the cache every probe was a live RPC
   * call, and the shared hosting IPs hit the RPC provider's rate limit (HTTP 429).
   * Signing and assessing always read the Vault live.
   */
  private healthCache: {
    at: number;
    value: Awaited<ReturnType<GuardService['healthUncached']>>;
  } | null = null;

  async health() {
    const t = this.now();
    if (this.healthCache && t - this.healthCache.at < HEALTH_CACHE_MS)
      return this.healthCache.value;
    const value = await this.healthUncached();
    this.healthCache = { at: t, value };
    return value;
  }

  private async healthUncached() {
    try {
      const policy = await this.d.vault.getPolicy();
      const problems = this.policyProblems(policy);
      return {
        ok: problems.length === 0,
        rpc_ok: true,
        vault_policy_version: policy.policy_version as number | null,
        rules_hash_match: (policy.rules_hash === this.d.rulesHash) as boolean | null,
      };
    } catch {
      return { ok: false, rpc_ok: false, vault_policy_version: null, rules_hash_match: null };
    }
  }

  private async live<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (e instanceof VaultUnavailableError) {
        this.log.warn('vault unavailable', { error: e.message });
        throw new GuardHttpError(
          503,
          'GUARD_DEPENDENCY_DOWN',
          `Cannot read the Vault: ${e.message}`,
        );
      }
      throw e;
    }
  }

  async assess(req: AssessRequest): Promise<AssessResponse> {
    const policy = await this.live(() => this.d.vault.getPolicy());
    try {
      return assessOffers({
        offers: this.d.offers,
        catalog: this.d.catalog,
        offerIds: req.offer_ids,
        config: this.d.rules,
        rulesHash: this.d.rulesHash,
        allowedVendors: policy.vendors,
        nowMs: this.assessNow(),
      });
    } catch (e) {
      if (e instanceof UnknownOfferError)
        throw new GuardHttpError(400, 'UNKNOWN_OFFER', e.message, undefined, {
          offer_ids: e.offerIds,
        });
      throw e;
    }
  }

  async signBasket(req: SignBasketRequest): Promise<SignBasketResponse> {
    // 1. Shape checks on the request itself.
    const byId = new Map(this.d.offers.map((o) => [o.offer_id, o]));
    const unknown = req.lines.filter((l) => !byId.has(l.offer_id)).map((l) => l.offer_id);
    if (unknown.length)
      throw new GuardHttpError(
        400,
        'UNKNOWN_OFFER',
        `unknown offer id(s): ${unknown.join(', ')}`,
        undefined,
        { offer_ids: unknown },
      );
    const seenOffers = new Set<string>();
    const seenItems = new Set<string>();
    for (const l of req.lines) {
      if (byId.get(l.offer_id)!.item_key !== l.item_key) {
        throw new GuardHttpError(
          400,
          'BAD_REQUEST',
          `offer ${l.offer_id} is not an offer for ${l.item_key}`,
        );
      }
      if (seenOffers.has(l.offer_id) || seenItems.has(l.item_key)) {
        throw new GuardHttpError(
          400,
          'BAD_REQUEST',
          'each item and each offer may appear only once',
        );
      }
      seenOffers.add(l.offer_id);
      seenItems.add(l.item_key);
    }

    // 2. Live Vault state. Any failure → 503, no signature.
    const policy = await this.live(() => this.d.vault.getPolicy());
    const problems = this.policyProblems(policy);
    if (problems.length)
      throw new GuardHttpError(503, problems[0]!.code, problems.map((p) => p.message).join('; '));
    if (policy.paused)
      throw new GuardHttpError(
        422,
        'GUARD_REFUSED',
        'The Vault is paused; no new baskets can be signed.',
        [],
      );
    if (policy.deficit)
      throw new GuardHttpError(
        422,
        'GUARD_REFUSED',
        'The Vault has flagged a deficit; no new baskets can be signed.',
        [],
      );
    const [owner, balance] = await this.live(() =>
      Promise.all([
        this.d.vault.getOwnerState(req.owner_id),
        this.d.vault.getBalance(req.owner_id, req.token_id),
      ]),
    );
    if (!owner.agents.includes(req.agent_id)) {
      throw new GuardHttpError(
        422,
        'GUARD_REFUSED',
        `Agent ${req.agent_id} is not authorised by ${req.owner_id} (set_agent).`,
        [],
      );
    }

    // 3. Re-run every offer rule from the trusted copy. Caller amounts are never used.
    const assessed = assessOffers({
      offers: this.d.offers,
      catalog: this.d.catalog,
      offerIds: req.lines.map((l) => l.offer_id),
      config: this.d.rules,
      rulesHash: this.d.rulesHash,
      allowedVendors: policy.vendors,
      nowMs: this.assessNow(),
    });
    const verdictOf = new Map(assessed.verdicts.map((v) => [v.offer_id, v]));
    const tag = (f: Finding, offerId: string): Finding => ({
      ...f,
      inputs: { ...f.inputs, offer_id: offerId },
    });
    const blocked: Finding[] = [];
    const reviewed: Finding[] = [];
    const acks = new Set(req.acknowledged_offer_ids);
    const lines = req.lines.map((l) => {
      const v = verdictOf.get(l.offer_id)!;
      if (v.level === 'BLOCK')
        blocked.push(
          ...v.findings.filter((f) => f.level === 'BLOCK').map((f) => tag(f, l.offer_id)),
        );
      if (v.level === 'REVIEW' && acks.has(l.offer_id))
        reviewed.push(
          ...v.findings.filter((f) => f.level === 'REVIEW').map((f) => tag(f, l.offer_id)),
        );
      const offer = byId.get(l.offer_id)!;
      const p = unitPriceMicro(offer);
      const amount = p === null ? 0n : lineAmountBaseUnits(p, l.qty, this.d.rules.usd_to_token);
      return { offer_id: l.offer_id, vendor_id: offer.vendor_id, level: v.level, amount };
    });
    const { payouts, total } = groupPayouts(lines);

    // 4. Basket rules against live views (the Vault re-checks them all anyway).
    const today = utcDayIndex(this.now());
    const spentToday = BigInt(owner.day) === BigInt(today) ? BigInt(owner.spent_today) : 0n;
    blocked.push(
      ...assessBasket({
        token_id: req.token_id,
        total,
        vendor_count: payouts.length,
        lines: lines.map((l) => ({ offer_id: l.offer_id, level: l.level })),
        acknowledged_offer_ids: acks,
        vault: {
          tokens: policy.tokens,
          effective_max_basket: BigInt(owner.max_basket),
          effective_daily_cap: BigInt(owner.daily_cap),
          spent_today: spentToday,
          max_vendors: policy.max_vendors,
          available: BigInt(balance.available),
        },
        decimals: this.d.rules.usd_to_token.decimals,
      }),
    );
    if (blocked.length) {
      this.log.info('sign refused', {
        request_id: req.request_id,
        rules: blocked.map((f) => f.rule_id),
      });
      throw new GuardHttpError(422, 'GUARD_REFUSED', 'Guard will not sign this basket.', blocked);
    }

    // 5. Build the exact payload, hash it and sign the hash.
    const created = BigInt(this.now());
    const ttl = this.ttlMs < BigInt(policy.max_ttl_ms) ? this.ttlMs : BigInt(policy.max_ttl_ms);
    const payload: BasketPayloadV1 = {
      schema_version: 1,
      network_id: this.d.networkId,
      vault_id: this.d.vaultId,
      policy_version: policy.policy_version,
      rules_hash: fromHex(this.d.rulesHash),
      guard_key_version: this.d.guardKeyVersion,
      basket_id: req.basket_id ?? this.randomUuid(),
      owner_id: req.owner_id,
      agent_id: req.agent_id,
      token_id: req.token_id,
      payouts,
      total,
      evidence_hash: fromHex(req.evidence_hash),
      nonce: this.randomNonce(),
      created_at_ms: created,
      expires_at_ms: created + ttl,
    };
    const bytes = encodePayload(payload);
    const hash = basketHash(bytes);
    const signature = this.d.signer.sign(hash);
    const hashHex = toHex(hash);
    this.log.info('basket signed', {
      request_id: req.request_id,
      basket_id: payload.basket_id,
      hash: hashHex,
      total: total.toString(),
    });
    return {
      payload_b64: toBase64(bytes),
      hash_hex: hashHex,
      signature_b64: toBase64(signature),
      guard_key_version: this.d.guardKeyVersion,
      expires_at_ms: Number(payload.expires_at_ms),
      basket_id: payload.basket_id,
      payouts: payouts.map((p) => ({
        vendor_id: p.vendor_id,
        amount: p.amount.toString(),
        line_count: p.line_count,
      })),
      total: total.toString(),
      findings: reviewed,
    };
  }
}
