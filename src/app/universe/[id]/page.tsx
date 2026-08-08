import UniverseView from "@/components/UniverseView";

export default async function UniverseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UniverseView id={id} />;
}
