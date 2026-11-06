import { Check, ExternalLink, FlaskConical, Info, Loader2 } from "lucide-react";
import { RatioBar } from "@/components/landing/product-window";
import { TrustLabel } from "@/components/trust-label";
import { VerdictBadge } from "@/components/verdict-badge";
import { canAcknowledge, type DeskView } from "@/lib/agents/reducer";
import type { Offer } from "@/lib/agents/types";
import { formatUsdMicro } from "@/lib/format";

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const unit = (o: Offer, unitMicro?: string | null) => (unitMicro ? BigInt(unitMicro) : BigInt(o.price_total_micro_usd ?? 0) / BigInt(o.quantity || 1));

/**
 * FR-UI03: offers grouped by item, each with its price against the median, the verdict and every finding's
 * reason. A REVIEW offer can be acknowledged right here; the Coordinator then counts it as eligible and
 * re-plans, and Guard re-checks it before signing (decisions-pending #3).
 */
export function OffersBoard({ view, titles, onAck, acking }: { view: DeskView; titles: Record<string, string>; onAck: (offerId: string) => void; acking: string | null }) {
  const picked = new Set(view.basket?.lines.map((l) => l.offer_id));
  const acked = new Set(view.acknowledged_offer_ids);
  const ackable = canAcknowledge(view);
  if (!view.items.length) return null;
  return (
    <div className="space-y-4">
      {view.items.map(({ item_key: key, qty }) => {
        const offers = view.offers.filter((o) => o.item_key === key).sort((a, b) => Number(unit(a, view.verdicts[a.offer_id]?.unit_price_micro) - unit(b, view.verdicts[b.offer_id]?.unit_price_micro)));
        const median = view.medians[key];
        return (
          <section key={key} className="panel rounded-[var(--radius-card)] p-4 sm:p-5">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold tracking-tight text-fg">
                {titles[key] ?? key} <span className="font-mono text-xs font-normal text-muted">× {qty}</span>
              </h3>
              <span className="font-mono text-[11px] text-muted">
                {offers.length} offers{median ? ` · median ${formatUsdMicro(BigInt(median))}` : ""}
              </span>
            </header>
            <ul className="mt-3 divide-y divide-line">
              {offers.map((o) => {
                const id = o.offer_id;
                const v = view.verdicts[id];
                const ex = view.explanations.verdicts[id];
                const isPick = picked.has(id);
                return (
                  <li key={id} className={`grid gap-x-4 gap-y-2 py-3 transition-opacity duration-500 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto] sm:items-center ${v?.level === "BLOCK" ? "opacity-70" : ""}`} style={{ animation: "fade-up 500ms var(--ease-out-soft)" }}>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-fg">
                        <span className={v?.level === "BLOCK" ? "line-through decoration-bad/60" : ""}>{o.seller_name ?? o.offer_id}</span>
                        {isPick && <span className="rounded-md bg-accent px-1.5 py-px font-mono text-[9.5px] text-accent-fg">IN BASKET</span>}
                        {o.capture_method === "fixture" && (
                          <span title="Synthetic test row (data/snapshot/fixtures), not a real listing" className="flex items-center gap-1 rounded-md px-1.5 py-px font-mono text-[9.5px] text-info ring-1 ring-inset ring-info/30">
                            <FlaskConical aria-hidden className="size-2.5" /> fixture
                          </span>
                        )}
                      </p>
                      <p className="truncate font-mono text-[10.5px] text-faint">
                        {o.vendor_id.split(".")[0]} · {o.product_title}
                      </p>
                    </div>
                    <p className="font-mono text-[14px] text-fg tabular sm:text-right">{formatUsdMicro(unit(o, v?.unit_price_micro))}</p>
                    <div className="min-w-0">
                      {v && v.ratio_bps != null ? <RatioBar bps={v.ratio_bps} level={v.level} /> : v ? <span className="font-mono text-[10.5px] text-faint">no usable price</span> : <span className="block h-1.5 animate-pulse rounded-full bg-line" />}
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {v ? <VerdictBadge level={v.level} size="xs" /> : <span className="font-mono text-[10px] text-faint">checking…</span>}
                      {o.source_url && (
                        <a href={o.source_url} target="_blank" rel="noreferrer" aria-label={`Source for ${o.seller_name}`} className="text-faint hover:text-fg">
                          <ExternalLink aria-hidden className="size-3.5" />
                        </a>
                      )}
                    </div>
                    {v && v.level !== "ALLOW" && (
                      <div className="sm:col-span-4">
                        <ul className="space-y-1">
                          {v.findings
                            .filter((f) => f.level !== "ALLOW")
                            .map((f) => (
                              <li key={f.rule_id} className={`flex items-start gap-2 text-[12px] ${f.level === "BLOCK" ? "text-bad" : "text-warn"}`}>
                                <span className="font-mono text-[10.5px] whitespace-nowrap opacity-80" title={f.name}>
                                  {f.rule_id}
                                </span>
                                <span>{f.message}</span>
                              </li>
                            ))}
                        </ul>
                        {/* Template text restates the findings above, so only an LLM explanation earns its own box. */}
                        {ex?.source === "llm" && (
                          <p className="mt-2 flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] px-3 py-2 text-[12.5px] leading-relaxed text-muted">
                            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                            <span className="flex-1">{ex.text}</span>
                            <TrustLabel kind="advisory" />
                          </p>
                        )}
                        {v.level === "REVIEW" &&
                          (acked.has(id) ? (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] text-warn ring-1 ring-inset ring-warn/30">
                              <Check aria-hidden className="size-3" /> acknowledged · eligible for the basket
                            </p>
                          ) : (
                            ackable && (
                              <button onClick={() => onAck(id)} disabled={!!acking} className="key key-ghost mt-2 h-8 px-3 text-[12px] text-warn ring-1 ring-warn/30 ring-inset hover:bg-warn-soft">
                                {acking === id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden className="size-3.5" />}
                                I reviewed this. Let it be picked
                              </button>
                            )
                          ))}
                      </div>
                    )}
                    {o.capture_method === "fixture" && o.raw_text && (
                      // Untrusted listing text, shown as a quote. No rule, parser or explanation reads it (AT-13).
                      <blockquote className="rounded-lg border-l-2 border-line-strong py-1 pl-3 font-mono text-[11px] leading-relaxed break-words text-muted sm:col-span-4">
                        <span className="mr-2 text-[9.5px] tracking-wider text-faint uppercase">listing text · data, not instructions</span>“{o.raw_text}”
                      </blockquote>
                    )}
                    <p className="font-mono text-[10px] text-faint sm:col-span-4">
                      {[o.captured_at && `captured ${new Date(o.captured_at).toLocaleDateString([], { day: "numeric", month: "short" })}`, o.source_url && host(o.source_url)].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
