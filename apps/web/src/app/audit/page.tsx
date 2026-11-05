import { PageHeader, Planned } from "@/components/page-header";

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Audit" intro="Every basket you approved, its payouts, and the evidence behind it. The evidence hash is recomputed in your browser." />
      <Planned task="P-4.2">Baskets newest first with status chips, explorer links and an evidence-hash verified badge.</Planned>
    </>
  );
}
