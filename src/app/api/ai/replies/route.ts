import { NextResponse } from "next/server";
import {
  createAuthServerContext,
  createTrustedCommandClient,
} from "@/infrastructure/supabase/server";
import {
  assertSameOrigin,
  readBoundedJson,
  RequestRejectedError,
} from "@/infrastructure/supabase/request-guards";

export const dynamic = "force-dynamic";

/** Delete only the authenticated owner's delivery cache; never client-supplied ownership. */
export async function POST(request: Request) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  try {
    assertSameOrigin(request, process.env.LEXIS_APP_ORIGIN);
    const input = await readBoundedJson(request, 1024);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new RequestRejectedError(
        "Confirm clearing your AI reply cache.",
        422,
      );
    const value = input as Record<string, unknown>;
    if (
      Object.keys(value).some(
        (key) => !["confirmation", "expectedUserId"].includes(key),
      ) ||
      value.confirmation !== "CLEAR AI REPLY CACHE" ||
      typeof value.expectedUserId !== "string" ||
      !/^[a-f0-9-]{36}$/u.test(value.expectedUserId)
    )
      throw new RequestRejectedError(
        "Confirm clearing the AI reply cache for your current account.",
        422,
      );
    const context = await createAuthServerContext(true, request.signal);
    const trusted = createTrustedCommandClient();
    if (!context || !trusted)
      return NextResponse.json(
        {
          ok: false,
          message:
            "Server AI reply-cache deletion awaits account and database configuration. No local conversations were deleted.",
        },
        { status: 503, headers },
      );
    const { data, error } = await context.client.auth.getUser();
    context.responseHeaders.forEach((value, key) => headers.set(key, value));
    if (error || !data.user)
      throw new RequestRejectedError(
        "Sign in again before clearing your server AI reply cache.",
        401,
      );
    if (data.user.id !== value.expectedUserId)
      throw new RequestRejectedError(
        "Your account changed. Reopen Tutor under the intended account before deleting its data.",
        409,
      );
    const result = await trusted
      .rpc("clear_ai_reply_cache_command", { p_user_id: data.user.id })
      .abortSignal(AbortSignal.timeout(10_000));
    if (result.error)
      throw new Error("AI reply-cache deletion could not be confirmed.");
    return NextResponse.json(
      {
        ok: true,
        message:
          "Server AI delivery replies were cleared and pending deliveries were sealed. Cost/idempotency receipts remain; this does not delete provider-held records or backups.",
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof RequestRejectedError
            ? error.message
            : "Server AI reply-cache deletion could not be confirmed. Local conversations have not been removed; retry before reporting deletion.",
      },
      {
        status: error instanceof RequestRejectedError ? error.status : 503,
        headers,
      },
    );
  }
}
