import { GrammarAtlas } from "@/components/grammar/atlas";

export default async function GrammarPage({
  searchParams,
}: {
  searchParams: Promise<{ concept?: string; context?: string; draft?: string }>;
}) {
  const params = await searchParams;
  const bounded = (value: unknown) =>
    typeof value === "string" && value.length <= 200 ? value : undefined;
  return (
    <GrammarAtlas
      initialConceptId={bounded(params.concept)}
      contextToken={bounded(params.context)}
      draftId={bounded(params.draft)}
    />
  );
}
