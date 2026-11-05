import { PageHeader, Planned } from "@/components/page-header";
import { TrustLabel } from "@/components/trust-label";

export default function VaultPage() {
  return (
    <>
      <PageHeader title="Vault" intro="Your cpUSD balance, held by the Vault contract. Agents can spend it only through baskets you approve, within your limits.">
        <TrustLabel kind="onchain" />
      </PageHeader>
      <Planned task="P-1.2">
        Balances per token (available, reserved, withdrawing), deposit, withdraw, agent authorisation, effective limits and remaining daily allowance.
        States: not signed in, not registered on cpUSD, zero balance, paused, deficit.
      </Planned>
    </>
  );
}
