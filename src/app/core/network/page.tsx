import { SemanticNetwork } from "@/components/semantic-network";
export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const value = (key: string, max: number) =>
    typeof query[key] === "string" ? query[key].slice(0, max) : "";
  return (
    <SemanticNetwork
      key={`${value("sense", 200)}:${value("type", 40)}:${value("source", 20)}:${value("saved", 1)}`}
      initialSense={value("sense", 200)}
      initialType={value("type", 40)}
      initialSource={value("source", 20)}
      initialSaved={value("saved", 1) === "1"}
    />
  );
}
