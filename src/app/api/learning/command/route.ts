import { NextResponse } from "next/server";
import {
  AuthenticationRequiredError,
  CommandValidationError,
  executeAuthenticatedCommand,
} from "@/application/server/learning-command";
import {
  createAuthServerContext,
  createTrustedCommandClient,
} from "@/infrastructure/supabase/server";
import {
  RemoteCommandError,
  SupabaseCommandRepository,
} from "@/infrastructure/supabase/command-repository";
import {
  assertSameOrigin,
  readBoundedJson,
  RequestRejectedError,
} from "@/infrastructure/supabase/request-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  try {
    assertSameOrigin(request, process.env.LEXIS_APP_ORIGIN);
    const input = await readBoundedJson(request, 450000);
    const context = await createAuthServerContext(true, request.signal);
    const trustedClient = createTrustedCommandClient();
    if (!context || !trustedClient) {
      return NextResponse.json(
        {
          ok: false,
          status: "awaiting-configuration",
          message:
            "Cloud learning is not configured. Your separate local work remains on this device.",
        },
        { status: 503, headers },
      );
    }
    const result = await executeAuthenticatedCommand(
      input,
      async () => {
        const { data, error } = await context.client.auth.getUser();
        if (error || !data.user) return null;
        return { userId: data.user.id };
      },
      new SupabaseCommandRepository(trustedClient),
      request.signal,
    );
    context.responseHeaders.forEach((value, key) => headers.set(key, value));
    return NextResponse.json({ ok: true, result }, { headers });
  } catch (error) {
    const status =
      error instanceof AuthenticationRequiredError
        ? 401
        : error instanceof CommandValidationError
          ? 422
          : error instanceof RequestRejectedError ||
              error instanceof RemoteCommandError
            ? error.status
            : 503;
    const known =
      error instanceof AuthenticationRequiredError ||
      error instanceof CommandValidationError ||
      error instanceof RequestRejectedError ||
      error instanceof RemoteCommandError;
    return NextResponse.json(
      {
        ok: false,
        message: known
          ? error.message
          : "The action has not been confirmed. Keep your input and retry when the connection is available.",
      },
      { status, headers },
    );
  }
}
