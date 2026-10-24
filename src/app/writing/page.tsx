import { WritingStudio } from "@/components/writing/studio";

export default async function WritingPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; resume?: string }>;
}) {
  const params = await searchParams;
  return (
    <WritingStudio
      initialDraftId={
        typeof params.draft === "string" && params.draft.length <= 200
          ? params.draft
          : undefined
      }
      resume={params.resume === "1"}
    />
  );
}
