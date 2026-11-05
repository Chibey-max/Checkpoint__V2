import { PageHeader, Planned } from "@/components/page-header";

export default function DeskPage() {
  return (
    <>
      <PageHeader title="Procurement Desk" intro="Describe what you need. Agents research offers from the snapshot, Guard checks them, and you approve the final basket." />
      <Planned task="P-2.1">
        Request form with catalogue hints, optional max total and preferred vendors, then the list of your past requests.
      </Planned>
    </>
  );
}
