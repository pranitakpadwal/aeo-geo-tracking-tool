import BulkScanView from "@/components/BulkScanView";

export default async function BulkScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BulkScanView id={id} />;
}
