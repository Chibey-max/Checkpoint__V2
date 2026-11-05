export function PageHeader({ title, intro, children }: { title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
        {intro && <p className="mt-1 max-w-2xl text-sm text-muted">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

/** Placeholder card for screens that arrive in later tasks. */
export function Planned({ task, children }: { task: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white p-6 text-sm text-muted">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue">Planned · {task}</p>
      {children}
    </div>
  );
}
