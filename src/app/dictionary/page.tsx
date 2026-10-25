import type { Metadata } from "next";
import { DictionaryWorkspace } from "@/components/dictionary-workspace";

export const metadata: Metadata = { title: "Dictionary" };
export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const text = (key: string, max: number) =>
    typeof params[key] === "string" ? params[key].slice(0, max) : "";
  return (
    <DictionaryWorkspace
      initialQuery={text("q", 160)}
      initialSenseId={text("sense", 200)}
      initialLexemeId={text("entry", 200)}
      initialLevel={text("level", 10) === "deep" ? "deep" : "full"}
      visitToken={text("visit", 100)}
      returnHref={text("return", 1_000) || "/library"}
    />
  );
}
