import { notFound, redirect } from "next/navigation";
import UniverseView from "@/components/UniverseView";
import { getCurrentUser } from "@/lib/session";
import { getUniverseOwner } from "@/lib/universe";

export default async function UniverseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const owner = getUniverseOwner(id);
  if (!owner.exists) notFound();
  if (owner.userId) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    if (user.id !== owner.userId) notFound();
  }

  return <UniverseView id={id} />;
}
