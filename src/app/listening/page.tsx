import { ListeningWorkspace } from "@/components/listening/listening-workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  return (
    <ListeningWorkspace
      sourceId={
        source && /^[A-Za-z0-9-]{1,200}$/u.test(source) ? source : undefined
      }
    />
  );
}
