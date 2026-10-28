import { NextResponse } from "next/server";
import { currentAiCapabilities } from "@/infrastructure/ai/server-runtime";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(currentAiCapabilities(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
