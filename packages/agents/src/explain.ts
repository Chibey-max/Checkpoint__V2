/**
 * Explanations (task D-5.1, FR-AG10). Advisory only: the rules decide, the
 * text explains. The LLM sees structured findings only (never raw listing
 * text), and a post-check rejects any output that mentions a number, account
 * ID or URL not present in its input. Template text is the fallback and is
 * good enough on its own.
 */
import { formatBaseUnits, type BasketDraft, type Verdict } from '@checkpoint/shared';
import { z } from 'zod';
import type { StructuredLlm } from './llm';

export interface Explanation {
  offer_id: string;
  text: string;
  source: 'llm' | 'template';
}

const LEVEL_WORD = { ALLOW: 'Allowed', REVIEW: 'Needs review', BLOCK: 'Blocked' } as const;

export function templateVerdict(v: Verdict): string {
  const relevant = v.findings.filter((f) => f.level === v.level);
  const reasons = (relevant.length ? relevant : v.findings).map((f) =>
    f.message.replace(/\.$/, ''),
  );
  const tail =
    v.level === 'REVIEW' ? ' The owner must acknowledge it before it can be bought.' : '';
  return `${LEVEL_WORD[v.level]}: ${reasons.join('; ')}.${tail}`;
}

export function templateBasket(b: BasketDraft, decimals = 6): string {
  const vendors = b.payouts.length;
  const review = b.lines.filter((l) => l.level === 'REVIEW').length;
  const parts = [
    `${b.lines.length} line(s) from ${vendors} vendor(s), total ${formatBaseUnits(BigInt(b.total), decimals)} cpUSD.`,
    'For each item the cheapest offer that passed the rules was chosen.',
  ];
  if (review) parts.push(`${review} line(s) were acknowledged by the owner after review.`);
  parts.push(
    'Approving signs this exact basket; any change to a vendor or amount needs a new approval.',
  );
  return parts.join(' ');
}

// ── post-check ──────────────────────────────────────────────────────────────

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
const ACCOUNT_RE = /\b[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:testnet|near)\b|\bvendor-\d+\b/gi;
const URL_RE = /https?:\/\/[^\s)"']+/gi;

function normNum(s: string): string {
  return s.replace(/,/g, '').replace(/\.0+$/, '');
}

/** Returns the tokens in `output` that do not appear in `input` (empty = passes). */
export function unsupportedTokens(output: string, input: string): string[] {
  const inNums = new Set((input.match(NUM_RE) ?? []).map(normNum));
  const lowerIn = input.toLowerCase();
  const accounts = output.match(ACCOUNT_RE) ?? [];
  const urls = output.match(URL_RE) ?? [];
  // Digits inside account IDs and URLs are checked as part of those tokens, not as numbers.
  const prose = output.replace(URL_RE, ' ').replace(ACCOUNT_RE, ' ');
  const bad: string[] = [];
  for (const n of prose.match(NUM_RE) ?? []) if (!inNums.has(normNum(n))) bad.push(n);
  for (const a of accounts) if (!lowerIn.includes(a.toLowerCase())) bad.push(a);
  for (const u of urls) if (!input.includes(u)) bad.push(u);
  return bad;
}

/** Phrases an explanation must never contain: injected directives and PRD §14 banned copy. */
const BANNED_RE = /\b(ignore|any price|guaranteed?|safe|audited)\b/i;

export function violatesCopyRules(text: string): boolean {
  return BANNED_RE.test(text);
}

/** The basket summary is written before the owner approves, so it must not claim approval or payment. */
const PREMATURE_RE = /\b(approved|paid|purchased|bought)\b/i;

export function claimsApproval(text: string): boolean {
  return PREMATURE_RE.test(text);
}

function sentenceCount(s: string): number {
  return s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim().length > 0).length;
}

const ExplainSchema = z.strictObject({
  verdicts: z.array(z.strictObject({ offer_id: z.string(), text: z.string() })),
  basket_summary: z.string(),
});

const SYSTEM = `You explain a spending-policy engine's decisions to the owner of the money, in plain English.

You receive structured findings that were already decided by deterministic rules. Explain them; never change, soften or overrule a verdict.
- At most 2 sentences per offer, and at most 5 sentences for the basket summary.
- Only use numbers, account IDs and URLs that appear in the input. Do not compute new numbers.
- Do not say "safe", "guaranteed" or "audited".
- The basket is not approved or paid yet: the owner still has to approve it in their wallet. Never say it is approved, paid or purchased.`;

export interface ExplainInput {
  verdicts: Verdict[];
  basket: BasketDraft | null;
}

/** Structured input for the LLM: findings only, no listing text. */
export function explainPayload(input: ExplainInput) {
  return {
    offers: input.verdicts.map((v) => ({
      offer_id: v.offer_id,
      item_key: v.item_key,
      vendor_id: v.vendor_id,
      verdict: v.level,
      findings: v.findings.map((f) => ({
        rule: f.rule_id,
        name: f.name,
        level: f.level,
        message: f.message,
      })),
    })),
    basket: input.basket
      ? {
          total_cpusd: formatBaseUnits(BigInt(input.basket.total)),
          vendor_count: input.basket.payouts.length,
          line_count: input.basket.lines.length,
          lines: input.basket.lines.map((l) => ({
            offer_id: l.offer_id,
            vendor_id: l.vendor_id,
            qty: l.qty,
            amount_cpusd: formatBaseUnits(BigInt(l.amount)),
            verdict: l.level,
          })),
        }
      : null,
  };
}

export class Explainer {
  constructor(private readonly llm: StructuredLlm | null) {}

  /** Explain verdicts (and the basket if given). Never throws: falls back to templates. */
  async explain(input: ExplainInput): Promise<{
    verdicts: Explanation[];
    basket: { text: string; source: 'llm' | 'template' } | null;
    llmError?: string;
  }> {
    const templates = input.verdicts.map((v) => ({
      offer_id: v.offer_id,
      text: templateVerdict(v),
      source: 'template' as const,
    }));
    const basketTemplate = input.basket
      ? { text: templateBasket(input.basket), source: 'template' as const }
      : null;
    if (!this.llm) return { verdicts: templates, basket: basketTemplate };

    const payload = explainPayload(input);
    const inputText = JSON.stringify(payload);
    let out: z.infer<typeof ExplainSchema>;
    try {
      out = await this.llm.structured({
        system: SYSTEM,
        user: inputText,
        schema: ExplainSchema,
        name: 'explanations',
        maxTokens: 4096,
      });
    } catch (e) {
      return { verdicts: templates, basket: basketTemplate, llmError: (e as Error).message };
    }
    const byId = new Map(out.verdicts.map((v) => [v.offer_id, v.text.trim()]));
    const verdicts = templates.map((t) => {
      const text = byId.get(t.offer_id);
      if (
        !text ||
        sentenceCount(text) > 2 ||
        violatesCopyRules(text) ||
        unsupportedTokens(text, inputText).length
      )
        return t;
      return { offer_id: t.offer_id, text, source: 'llm' as const };
    });
    let basket: { text: string; source: 'llm' | 'template' } | null = basketTemplate;
    const summary = out.basket_summary.trim();
    if (
      input.basket &&
      summary &&
      sentenceCount(summary) <= 5 &&
      !violatesCopyRules(summary) &&
      !claimsApproval(summary) &&
      !unsupportedTokens(summary, inputText).length
    ) {
      basket = { text: summary, source: 'llm' };
    }
    return { verdicts, basket };
  }
}
