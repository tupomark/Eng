import { Library } from "@/components/library";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  return (
    <Library
      initialQuery={typeof params.q === "string" ? params.q.slice(0, 200) : ""}
    />
  );
}
