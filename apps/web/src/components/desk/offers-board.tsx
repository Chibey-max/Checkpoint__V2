import { ExternalLink, FlaskConical, Info } from "lucide-react";
import { RatioBar } from "@/components/landing/product-window";
import { TrustLabel } from "@/components/trust-label";
import { VerdictBadge } from "@/components/verdict-badge";
import type { RequestView } from "@/lib/agents/reducer";
import { formatUsdMicro } from "@/lib/format";

/** FR-UI03: offers grouped by item, each with its price against the median, verdict and every finding's reason. */
export function OffersBoard({ view }: { view: RequestView }) {
  const picked = new Set(view.basket?.lines.map((l) => l.offer_id));
  const keys = [...new Set(view.items.map((i) => i.item_key))];
  if (!keys.length) return null;
  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const item = view.items.find((i) => i.item_key === key)!;
        const qty = view.items.filter((i) => i.item_key === key).reduce((s, i) => s + i.qty, 0);
        const ids = view.order.filter((id) => view.offers[id]?.item_key === key);
        const price = (id: string) => view.offers[id]!.price_total_micro_usd;
        const sorted = [...ids].sort((a, b) => price(a) - price(b));
        return (
          <section key={key} className="panel rounded-[var(--radius-card)] p-4 sm:p-5">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold tracking-tight text-fg">
                {item.title} <span className="font-mono text-xs font-normal text-muted">× {qty}</span>
              </h3>
              <span className="font-mono text-[11px] text-muted">
                {ids.length} offers{view.medians[key] ? ` · median ${formatUsdMicro(view.medians[key]!)}` : ""}
              </span>
            </header>
            <ul className="mt-3 divide-y divide-line">
              {sorted.map((id) => {
                const o = view.offers[id]!;
                const v = view.verdicts[id];
                const isPick = picked.has(id);
                return (
                  <li key={id} className={`grid gap-x-4 gap-y-2 py-3 transition-opacity duration-500 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto] sm:items-center ${v?.level === "BLOCK" ? "opacity-70" : ""}`} style={{ animation: "fade-up 500ms var(--ease-out-soft)" }}>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-fg">
                        <span className={v?.level === "BLOCK" ? "line-through decoration-bad/60" : ""}>{o.seller_name}</span>
                        {isPick && <span className="rounded-md bg-accent px-1.5 py-px font-mono text-[9.5px] text-accent-fg">IN BASKET</span>}
                        {o.fixture && (
                          <span className="flex items-center gap-1 rounded-md px-1.5 py-px font-mono text-[9.5px] text-info ring-1 ring-inset ring-info/30">
                            <FlaskConical aria-hidden className="size-2.5" /> fixture
                          </span>
                        )}
                      </p>
                      <p className="truncate font-mono text-[10.5px] text-faint">
                        {o.vendor_id.split(".")[0]} · {o.product_title}
                      </p>
                    </div>
                    <p className="font-mono text-[14px] text-fg tabular sm:text-right">{formatUsdMicro(o.price_total_micro_usd)}</p>
                    <div className="min-w-0">{v && view.ratios[id] !== undefined ? <RatioBar bps={view.ratios[id]!} level={v.level} /> : <span className="block h-1.5 animate-pulse rounded-full bg-line" />}</div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {v ? <VerdictBadge level={v.level} size="xs" /> : <span className="font-mono text-[10px] text-faint">checking…</span>}
                      <a href={o.source_url} target="_blank" rel="noreferrer" aria-label={`Source for ${o.seller_name}`} className="text-faint hover:text-fg">
                        <ExternalLink aria-hidden className="size-3.5" />
                      </a>
                    </div>
                    {v && v.level !== "ALLOW" && (
                      <div className="sm:col-span-4">
                        <ul className="space-y-1">
                          {v.findings
                            .filter((f) => f.level !== "ALLOW")
                            .map((f) => (
                              <li key={f.rule_id} className={`flex items-start gap-2 text-[12px] ${f.level === "BLOCK" ? "text-bad" : "text-warn"}`}>
                                <span className="font-mono text-[10.5px] opacity-80">{f.rule_id}</span>
                                <span>{f.message}</span>
                              </li>
                            ))}
                        </ul>
                        {view.explanations[id] && (
                          <p className="mt-2 flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] px-3 py-2 text-[12.5px] leading-relaxed text-muted">
                            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                            <span className="flex-1">{view.explanations[id]}</span>
                            <TrustLabel kind="advisory" />
                          </p>
                        )}
                      </div>
                    )}
                    <p className="font-mono text-[10px] text-faint sm:col-span-4">
                      captured {new Date(o.captured_at).toLocaleDateString([], { day: "numeric", month: "short" })} · {new URL(o.source_url).hostname.replace(/^www\./, "")}
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
