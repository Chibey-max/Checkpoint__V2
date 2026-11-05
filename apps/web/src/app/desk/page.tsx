"use client";

import { ArrowRight, CornerDownLeft, FlaskConical, Inbox, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { agents, history, remember, type HistoryEntry } from "@/lib/agents/client";
import type { CatalogItem } from "@/lib/agents/types";
import { humanError } from "@/lib/errors";
import { parseAmount } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const EXAMPLE = "2× VPS 2 vCPU / 4 GB for 1 month\n1× .com domain for 1 year\n1 TB object storage for 1 month\n10k transactional emails";
const VENDORS = ["vendor-01", "vendor-02", "vendor-03", "vendor-04", "vendor-06"];
const DEMO_OWNER = "owner-demo.cpdemo.testnet";

export default function DeskPage() {
  const router = useRouter();
  const { accountId } = useWallet();
  const [text, setText] = useState("");
  const [max, setMax] = useState("");
  const [prefer, setPrefer] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    agents.catalog().then(setCatalog).catch(() => setCatalog([]));
    setPast(history());
  }, []);

  const maxErr = useMemo(() => {
    if (!max.trim()) return null;
    try {
      parseAmount(max);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [max]);

  function addLine(line: string) {
    setText((t) => (t.trim() ? `${t.replace(/\s+$/, "")}\n${line}` : line));
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || maxErr || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const owner = accountId ?? DEMO_OWNER;
      const constraints = {
        ...(max.trim() ? { max_total: parseAmount(max).toString() } : {}),
        ...(prefer.length ? { preferred_vendors: prefer.map((v) => `${v}.cpdemo.testnet`) } : {}),
      };
      const { request_id } = await agents.createRequest({ owner_id: owner, text: text.trim(), constraints });
      remember({ id: request_id, text: text.trim(), created: Date.now(), owner });
      router.push(`/desk/${request_id}`);
    } catch (e) {
      setErr(e instanceof Error && e.message.startsWith("Couldn't") ? e.message : humanError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Procurement desk" title="What do you need?" intro="Write it the way you'd brief a colleague. Agents match each line to the catalogue, research every offer in the snapshot, and Guard checks the prices before you see a basket.">
        {agents.mode === "mock" && (
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.12em] text-info uppercase ring-1 ring-inset ring-info/30">
            <FlaskConical aria-hidden className="size-3.5" /> Mock agents
          </span>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <form onSubmit={submit} className="panel edge-light rounded-[var(--radius-card)] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <label className="eyebrow" htmlFor="list">
              Shopping list
            </label>
            <button type="button" onClick={() => setText(EXAMPLE)} className="font-mono text-[11px] text-accent underline-offset-4 hover:underline">
              Use the demo list
            </button>
          </div>
          <div className="relative mt-3">
            <textarea
              id="list"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
              rows={7}
              placeholder={"One item per line, e.g.\n2× VPS 2 vCPU / 4 GB for 1 month"}
              className="w-full resize-none rounded-2xl border border-line bg-[color-mix(in_srgb,var(--color-bg)_55%,transparent)] p-4 font-mono text-[13.5px] leading-relaxed text-fg placeholder:text-faint focus:border-accent/50 focus:outline-none"
            />
            <span className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1 font-mono text-[10px] text-faint">
              <CornerDownLeft aria-hidden className="size-3" /> ⌘/Ctrl + Enter
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[10.5px] text-faint">Catalogue</span>
            {catalog.map((c) => (
              <button
                type="button"
                key={c.item_key}
                onClick={() => addLine(`1× ${c.title.replace(/,/g, " ·")}`)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg"
              >
                + {c.title.split(",")[0]}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow">Max total · optional</span>
              <span className="mt-2 flex items-center rounded-full border border-line bg-[color-mix(in_srgb,var(--color-bg)_55%,transparent)] pr-4 focus-within:border-accent/50">
                <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="150.00" className="h-10 w-full bg-transparent px-4 font-mono text-sm text-fg placeholder:text-faint focus:outline-none" />
                <span className="font-mono text-xs text-faint">cpUSD</span>
              </span>
              {maxErr && <span className="mt-1 block text-xs text-bad">{maxErr}</span>}
            </label>
            <div>
              <span className="eyebrow">Preferred vendors · optional</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VENDORS.map((v) => {
                  const on = prefer.includes(v);
                  return (
                    <button
                      type="button"
                      key={v}
                      aria-pressed={on}
                      onClick={() => setPrefer((p) => (on ? p.filter((x) => x !== v) : [...p, v]))}
                      className={`rounded-full px-2.5 py-1.5 font-mono text-[11px] ring-1 ring-inset transition-colors ${on ? "bg-accent-soft text-accent ring-accent/35" : "text-muted ring-line hover:text-fg"}`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {accountId ? (
                <>
                  Buying as <span className="font-mono text-fg">{accountId}</span>
                </>
              ) : (
                <>
                  Not signed in · the demo uses <span className="font-mono">{DEMO_OWNER}</span>
                </>
              )}
            </p>
            <button disabled={!text.trim() || !!maxErr || busy} className="key key-primary h-11 px-5 text-sm">
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
              Start research
            </button>
          </div>
          {err && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad ring-1 ring-inset ring-bad/25">
              <X aria-hidden className="mt-0.5 size-4 shrink-0" /> {err}
            </p>
          )}
        </form>

        <aside className="panel rounded-[var(--radius-card)] p-5">
          <p className="eyebrow">Your requests</p>
          {past.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--color-fg)_6%,transparent)] text-muted">
                <Inbox aria-hidden className="size-5" />
              </span>
              <p className="mt-3 text-sm text-fg">No requests yet</p>
              <p className="mt-1 max-w-56 text-xs text-muted">Your requests from this browser will show up here.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {past.map((h) => (
                <li key={h.id}>
                  <Link href={`/desk/${h.id}`} data-spotlight className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 hover:border-line">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{h.text.split("\n")[0]}</span>
                      <span className="block font-mono text-[10.5px] text-faint">
                        {h.text.split("\n").length} lines · {ago(h.created)} · {h.id.slice(0, 8)}
                      </span>
                    </span>
                    <ArrowRight aria-hidden className="size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
