import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { readSupabasePublicConfiguration } from "./configuration";

/** Per-request SSR client. Never share a client/session in a module singleton. */
export async function createAuthServerContext(
  allowCookieWrites = true,
  requestSignal?: AbortSignal,
) {
  const configuration = readSupabasePublicConfiguration(process.env);
  if (!configuration) return null;
  const cookieStore = await cookies();
  const responseHeaders = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
  });
  const deadline = AbortSignal.timeout(12000);
  const client = createServerClient(
    configuration.url,
    configuration.publishableKey,
    {
      global: {
        fetch(input, options) {
          const signals = [deadline];
          if (requestSignal) signals.push(requestSignal);
          if (options?.signal) signals.push(options.signal);
          return fetch(input, {
            ...options,
            signal: AbortSignal.any(signals),
          });
        },
      },
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          if (allowCookieWrites) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          }
          Object.entries(cacheHeaders).forEach(([key, value]) =>
            responseHeaders.set(key, value),
          );
        },
      },
    },
  );
  return { client, responseHeaders };
}

/** This module is guarded by server-only; the secret is never serialized. */
export function createTrustedCommandClient() {
  const configuration = readSupabasePublicConfiguration(process.env);
  const secret =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuration || !secret) return null;
  return createClient(configuration.url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
