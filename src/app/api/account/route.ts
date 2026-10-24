import { NextResponse } from "next/server";
import { createAuthServerContext } from "@/infrastructure/supabase/server";
import {
  assertSameOrigin,
  readBoundedJson,
  RequestRejectedError,
} from "@/infrastructure/supabase/request-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await createAuthServerContext();
  const headers = context?.responseHeaders ?? {
    "Cache-Control": "private, no-store",
  };
  if (!context)
    return NextResponse.json(
      { configured: false, user: null, cloudLearning: false },
      { headers },
    );
  try {
    const { data, error } = await context.client.auth.getUser();
    const unavailable = Boolean(
      error && error.name !== "AuthSessionMissingError",
    );
    return NextResponse.json(
      {
        configured: true,
        user: data.user
          ? { id: data.user.id, email: data.user.email ?? null }
          : null,
        cloudLearning: false,
        unavailable,
      },
      { headers, status: unavailable ? 503 : 200 },
    );
  } catch {
    return NextResponse.json(
      {
        configured: true,
        user: null,
        unavailable: true,
        cloudLearning: false,
      },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  try {
    const origin = assertSameOrigin(request, process.env.LEXIS_APP_ORIGIN);
    const input = await readBoundedJson(request, 4096);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new RequestRejectedError("Choose an account action.", 422);
    const body = input as Record<string, unknown>;
    if (
      Object.keys(body).some(
        (key) => !["action", "email", "password"].includes(key),
      )
    )
      throw new RequestRejectedError(
        "This account action is not supported.",
        422,
      );
    const context = await createAuthServerContext(true, request.signal);
    if (!context)
      return NextResponse.json(
        {
          ok: false,
          status: "awaiting-configuration",
          message:
            "Account sign-in is not configured. Local learning remains available on this device.",
        },
        { status: 503, headers },
      );
    const { client } = context;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const needsEmail = ["sign-in", "sign-up", "recover"].includes(
      String(body.action),
    );
    const needsPassword = ["sign-in", "sign-up", "update-password"].includes(
      String(body.action),
    );
    if (
      (needsEmail &&
        (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (needsPassword &&
        (password.length < (body.action === "sign-in" ? 1 : 8) ||
          password.length > 256))
    )
      throw new RequestRejectedError(
        "Enter a valid email and password. New passwords need 8–256 characters.",
        422,
      );
    let message: string;
    let errorCode: string | undefined;
    switch (body.action) {
      case "sign-in": {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        errorCode = error?.code;
        if (error && !errorCode) errorCode = "sign-in-failed";
        message = "Signed in. Your local learning has not been uploaded.";
        break;
      }
      case "sign-up": {
        const { error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback?next=/account` },
        });
        errorCode = error?.code;
        if (error && !errorCode) errorCode = "sign-up-failed";
        message =
          "Check your email for the next step. Local learning remains separate from your account.";
        break;
      }
      case "recover": {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/account?mode=recovery")}`,
        });
        errorCode = error?.code;
        if (error && !errorCode) errorCode = "recovery-failed";
        message =
          "If recovery is available for this email, a link will arrive shortly.";
        break;
      }
      case "update-password": {
        const { data, error } = await client.auth.getUser();
        if (error || !data.user)
          throw new RequestRejectedError(
            "Open your recovery email again or sign in before changing your password.",
            401,
          );
        const updated = await client.auth.updateUser({ password });
        errorCode = updated.error?.code;
        if (updated.error && !errorCode) errorCode = "update-failed";
        message = "Password updated.";
        break;
      }
      case "sign-out": {
        const { error } = await client.auth.signOut({ scope: "local" });
        errorCode = error?.code;
        if (error && !errorCode) errorCode = "sign-out-failed";
        message =
          "Signed out of this session. Separate local learning remains on this device.";
        break;
      }
      default:
        throw new RequestRejectedError(
          "Choose a supported account action.",
          422,
        );
    }
    context.responseHeaders.forEach((value, key) => headers.set(key, value));
    if (errorCode) {
      const limited = [
        "over_email_send_rate_limit",
        "over_request_rate_limit",
      ].includes(errorCode);
      return NextResponse.json(
        {
          ok: false,
          message: limited
            ? "Too many account requests. Wait a little and retry; your local work is unchanged."
            : "This account action could not be completed. Check your details or retry later; your local work is unchanged.",
        },
        { status: limited ? 429 : 400, headers },
      );
    }
    return NextResponse.json({ ok: true, message }, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof RequestRejectedError
            ? error.message
            : "The account service is temporarily unavailable. Your local learning is still available.",
      },
      {
        status: error instanceof RequestRejectedError ? error.status : 503,
        headers,
      },
    );
  }
}
