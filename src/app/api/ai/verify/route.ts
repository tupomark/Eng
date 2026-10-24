import { NextResponse } from "next/server";
import { createAiRuntime } from "@/infrastructure/ai/server-runtime";
import { editorialTask } from "@/infrastructure/dictionary/editorial-tasks";
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
    const input = await readBoundedJson(request, 30_000);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new RequestRejectedError("Choose an assessment task.", 422);
    const value = input as Record<string, unknown>;
    if (
      Object.keys(value).some(
        (key) => !["requestId", "senseId", "answer", "assisted"].includes(key),
      ) ||
      typeof value.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/u.test(value.requestId) ||
      typeof value.senseId !== "string" ||
      typeof value.answer !== "string" ||
      value.answer.length > 6_000 ||
      !value.answer.trim() ||
      typeof value.assisted !== "boolean"
    )
      throw new RequestRejectedError(
        "This assessment request could not be read.",
        422,
      );
    const task = editorialTask(value.senseId, "own-sentence");
    if (!task)
      throw new RequestRejectedError(
        "This meaning is not available for the requested task.",
        422,
      );
    const runtime = await createAiRuntime(request.signal);
    const result = await runtime.pipeline.verify(
      value.requestId,
      { task, answer: value.answer, assisted: value.assisted },
      request.signal,
    );
    runtime.responseHeaders?.forEach((value, key) => headers.set(key, value));
    return NextResponse.json(
      { ...result, advisoryOnly: true, evidenceSaved: false },
      {
        status: result.ok
          ? 200
          : result.code === "authentication-required"
            ? 401
            : result.code === "quota-exhausted"
              ? 429
              : 503,
        headers,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "provider-failure",
        evidenceSaved: false,
        message:
          error instanceof RequestRejectedError
            ? error.message
            : "No assessment was confirmed or saved. Keep your answer and retry when this capability is available.",
      },
      {
        status: error instanceof RequestRejectedError ? error.status : 503,
        headers,
      },
    );
  }
}
