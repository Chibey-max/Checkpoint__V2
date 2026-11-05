import { PageHeader, Planned } from "@/components/page-header";
import { TrustLabel } from "@/components/trust-label";

export default function GovernancePage() {
  return (
    <>
      <PageHeader title="Governance" intro="The checkpoint-council DAO owns the Vault's policy. Limits, vendors and Guard keys change only by proposal and vote.">
        <TrustLabel kind="onchain" />
      </PageHeader>
      <Planned task="P-5.1">Current policy and version, allowlists, guardian, the last 10 proposals with status, and vote buttons for council members.</Planned>
    </>
  );
}
