import { PageHeader, Planned } from "@/components/page-header";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader title="Request" intro={`Request ${id}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Planned task="P-2.2">Agent timeline: Research, Guard, Coordinator, Approval and Settlement lanes, streamed over SSE.</Planned>
        <Planned task="P-2.2 · P-3.1">Offers grouped by item with verdicts and findings, then the basket card with &ldquo;Approve exact basket&rdquo;.</Planned>
      </div>
    </>
  );
}
