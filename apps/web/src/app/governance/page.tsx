import { Vote } from "lucide-react";
import { Ghost, PageHeader, Planned } from "@/components/page-header";
import { TrustLabel } from "@/components/trust-label";
import { config } from "@/lib/config";

export default function GovernancePage() {
  return (
    <>
      <PageHeader eyebrow="Governance" title="The council owns the policy" intro="Caps, vendor and token allowlists, Guard keys and the rules hash change only through a proposal and a vote. The guardian can only pause.">
        <TrustLabel kind="onchain" />
      </PageHeader>
      <Planned task="P-5.1" needs="H11 · DAO hand-over" title={`Proposals from ${config.daoId}`} Icon={Vote}>
        Current policy and version, the last 10 proposals with status, and vote buttons for council members.
      </Planned>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <div className="panel space-y-4 rounded-[var(--radius-card)] p-5">
          <p className="eyebrow">Policy</p>
          {["Max basket", "Daily cap", "Max vendors", "Guard key", "Rules hash"].map((k) => (
            <div key={k} className="flex items-center justify-between text-sm"><span className="text-muted">{k}</span><Ghost className="h-3.5 w-24" /></div>
          ))}
        </div>
        <div className="panel space-y-3 rounded-[var(--radius-card)] p-5">
          <p className="eyebrow">Recent proposals</p>
          {[0, 1, 2, 3].map((i) => <Ghost key={i} className="h-14" />)}
        </div>
      </div>
    </>
  );
}
