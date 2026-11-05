import { Activity } from "lucide-react";
import { Ghost, PageHeader, Planned } from "@/components/page-header";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader eyebrow={`Request · ${id.slice(0, 8)}`} title="Live request" intro="Agent progress streams in as it happens. Offers, verdicts and the basket all come from signed or hashed evidence." />
      <Planned task="P-2.2 · P-3.1" needs="H2 · H6" title="Timeline, offers and basket stream over SSE" Icon={Activity}>
        Research, Guard, Coordinator, Approval and Settlement lanes on the left. Offers grouped by item with verdicts on the right, then the basket card.
      </Planned>
      <div className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="panel space-y-3 rounded-[var(--radius-card)] p-5">{[0, 1, 2, 3, 4].map((i) => <Ghost key={i} className="h-10" />)}</div>
        <div className="panel space-y-2 rounded-[var(--radius-card)] p-5">{[0, 1, 2, 3, 4, 5].map((i) => <Ghost key={i} className="h-9" />)}</div>
      </div>
    </>
  );
}
