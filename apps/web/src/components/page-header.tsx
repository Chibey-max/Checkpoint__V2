import type { LucideIcon } from "lucide-react";

export function PageHeader({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pt-14 pb-10">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold text-fg sm:text-5xl">{title}</h1>
        {intro && <p className="mt-4 text-[15px] leading-relaxed text-muted">{intro}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** Honest placeholder for a screen that lands in a later task: shows the shape of what's coming. */
export function Planned({ task, needs, title, children, Icon }: { task: string; needs?: string; title: string; children: React.ReactNode; Icon: LucideIcon }) {
  return (
    <div className="panel edge-light rounded-[var(--radius-card)] p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-inset ring-accent/25">
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-fg">{title}</h2>
            <span className="rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-info uppercase ring-1 ring-inset ring-info/30">{task}</span>
            {needs && <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">needs {needs}</span>}
          </div>
          <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton block for placeholder layouts. */
export function Ghost({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] ${className}`} />;
}
