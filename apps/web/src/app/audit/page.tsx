import { ScrollText } from "lucide-react";
import { Ghost, PageHeader, Planned } from "@/components/page-header";
import { TrustLabel } from "@/components/trust-label";

export default function AuditPage() {
  return (
    <>
      <PageHeader eyebrow="Audit" title="Every basket, with receipts" intro="Each basket you approved, its payouts and the evidence behind it. The evidence hash is recomputed in your browser and compared with the chain.">
        <TrustLabel kind="onchain" />
      </PageHeader>
      <Planned task="P-4.2" needs="D-4.2 · audit endpoint" title="Baskets read from get_baskets and /v1/audit" Icon={ScrollText}>
        Newest first, with status chips, explorer links per payout and a verified badge when the recomputed evidence hash matches.
      </Planned>
      <div className="panel mt-6 divide-y divide-line rounded-[var(--radius-card)]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 p-5">
            <Ghost className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2"><Ghost className="h-3.5 w-48" /><Ghost className="h-3 w-72" /></div>
            <Ghost className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </>
  );
}
