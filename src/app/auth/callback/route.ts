import { NextResponse } from "next/server";
import { createAuthServerContext } from "@/infrastructure/supabase/server";
import {
  resolveRequestOrigin,
  safeReturnPath,
} from "@/infrastructure/supabase/request-guards";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveRequestOrigin(request, process.env.LEXIS_APP_ORIGIN);
  const destination = safeReturnPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const context = await createAuthServerContext();
  if (context && code && code.length <= 4096) {
    try {
      const { error } = await context.client.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL(destination, origin));
        context.responseHeaders.forEach((value, key) =>
          response.headers.set(key, value),
        );
        return response;
      }
    } catch {
      // A callback failure must not disclose token/provider payloads in a URL.
    }
  }
  const response = NextResponse.redirect(
    new URL("/account?notice=callback-incomplete", origin),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
