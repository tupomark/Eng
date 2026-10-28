import { NextResponse } from "next/server";
import { createAiRuntime } from "@/infrastructure/ai/server-runtime";
import {
  assertSameOrigin,
  readBoundedJson,
  RequestRejectedError,
} from "@/infrastructure/supabase/request-guards";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  try {
    assertSameOrigin(request, process.env.LEXIS_APP_ORIGIN);
    const input = await readBoundedJson(request, 100_000);
    const runtime = await createAiRuntime(request.signal);
    const result = await runtime.pipeline.tutor(input, request.signal);
    runtime.responseHeaders?.forEach((value, key) => headers.set(key, value));
    const status = result.ok
      ? 200
      : result.code === "authentication-required"
        ? 401
        : result.code === "quota-exhausted"
          ? 429
          : result.code === "conflict" || result.code === "in-progress"
            ? 409
            : result.code === "cancelled"
              ? 499
              : 503;
    return NextResponse.json(result, { status, headers });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "provider-failure",
        message:
          error instanceof RequestRejectedError
            ? error.message
            : "This request could not be confirmed. Your question remains saved locally; no learning assessment was made.",
      },
      {
        status: error instanceof RequestRejectedError ? error.status : 503,
        headers,
      },
    );
  }
}
