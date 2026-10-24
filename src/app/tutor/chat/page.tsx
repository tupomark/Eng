import type { Metadata } from "next";
import { TutorChat } from "@/components/tutor/chat";
export const metadata: Metadata = { title: "AI Tutor" };
export default async function TutorChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <TutorChat
      visitToken={
        typeof params.visit === "string" ? params.visit.slice(0, 100) : ""
      }
      returnHref={
        typeof params.return === "string"
          ? params.return.slice(0, 1_000)
          : "/library"
      }
    />
  );
}
