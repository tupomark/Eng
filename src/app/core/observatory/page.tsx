import { KnowledgeObservatory } from "@/components/knowledge-observatory";
export default async function ObservatoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <KnowledgeObservatory
      initialSkill={
        typeof query.skill === "string" ? query.skill.slice(0, 40) : ""
      }
    />
  );
}
