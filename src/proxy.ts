import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicConfiguration } from "@/infrastructure/supabase/configuration";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  const configuration = readSupabasePublicConfiguration(process.env);
  if (!configuration) return response;
  const deadline = AbortSignal.timeout(10000);
  const client = createServerClient(
    configuration.url,
    configuration.publishableKey,
    {
      global: {
        fetch(input, options) {
          return fetch(input, {
            ...options,
            signal: options?.signal
              ? AbortSignal.any([deadline, options.signal])
              : deadline,
          });
        },
      },
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          response.headers.set("Cache-Control", "private, no-store, max-age=0");
          response.headers.set("Vary", "Cookie");
          Object.entries(cacheHeaders).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );
  try {
    await client.auth.getClaims();
  } catch {
    // API handlers independently verify identity. Provider failure must not
    // make the separate local learning workspace inaccessible.
  }
  return response;
}

export const config = {
  matcher: [
    "/account/:path*",
    "/auth/:path*",
    "/api/account/:path*",
    "/api/learning/:path*",
  ],
};
