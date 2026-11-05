import { RequestRoom } from "@/components/desk/request-room";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestRoom id={id} />;
}
