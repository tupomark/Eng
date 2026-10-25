import { UserMeaningsWorkspace } from "@/components/lexical-catalog-editor";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  return (
    <UserMeaningsWorkspace
      initialQuery={typeof q === "string" ? q.slice(0, 160) : ""}
    />
  );
}
