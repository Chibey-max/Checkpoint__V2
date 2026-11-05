import { Inbox, Sparkles } from "lucide-react";
import { Ghost, PageHeader, Planned } from "@/components/page-header";

const EXAMPLE = "2× VPS 2 vCPU / 4 GB for 1 month\n1× .com domain for 1 year\n1 TB object storage for 1 month\n10k transactional emails";

export default function DeskPage() {
  return (
    <>
      <PageHeader eyebrow="Procurement desk" title="What do you need?" intro="Describe it in plain words. Agents match it to the catalogue, research offers, and Guard checks every price before you see a basket." />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="panel edge-light rounded-[var(--radius-card)] p-5">
          <label className="eyebrow" htmlFor="list">Shopping list</label>
          <textarea
            id="list"
            disabled
            defaultValue={EXAMPLE}
            rows={6}
            className="mt-3 w-full resize-none rounded-2xl border border-line bg-[color-mix(in_srgb,var(--color-bg)_55%,transparent)] p-4 font-mono text-[13.5px] leading-relaxed text-fg/80"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {["VPS", ".com domain", "Object storage", "Transactional email"].map((h) => (
              <span key={h} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{h}</span>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-faint">Max total · optional</span>
            <button disabled className="key key-primary h-11 px-5 text-sm">
              <Sparkles aria-hidden className="size-4" /> Start research
            </button>
          </div>
        </div>
        <div className="panel rounded-[var(--radius-card)] p-5">
          <p className="eyebrow">Your requests</p>
          <div className="mt-8 flex flex-col items-center text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--color-fg)_6%,transparent)] text-muted">
              <Inbox aria-hidden className="size-5" />
            </span>
            <p className="mt-3 text-sm text-fg">No requests yet</p>
            <p className="mt-1 text-xs text-muted">Your first basket will show up here.</p>
          </div>
          <div className="mt-8 space-y-2 opacity-50">{[0, 1].map((i) => <Ghost key={i} className="h-12" />)}</div>
        </div>
      </div>
      <div className="mt-6">
        <Planned task="P-2.1" needs="H2 · mock agents server" title="The form goes live with David's agents API" Icon={Sparkles}>
          Submitting posts to <code className="font-mono text-fg">POST /v1/requests</code> and opens the live request page.
        </Planned>
      </div>
    </>
  );
}
