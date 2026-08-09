import { notFound, redirect } from "next/navigation";
import BulkScanView from "@/components/BulkScanView";
import { getBulkScanOwner } from "@/lib/bulk-scan";
import { getCurrentUser } from "@/lib/session";

export default async function BulkScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const owner = getBulkScanOwner(id);
  if (!owner.exists) notFound();
  if (owner.userId) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    if (user.id !== owner.userId) notFound();
  }

  return <BulkScanView id={id} />;
}
