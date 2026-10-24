export interface SupabasePublicConfiguration {
  url: string;
  publishableKey: string;
}

export function readSupabasePublicConfiguration(
  environment: Record<string, string | undefined>,
): SupabasePublicConfiguration | null {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      parsed.hostname,
    );
    if (
      (parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" && loopback)) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "")
    )
      return null;
    return { url: parsed.origin, publishableKey };
  } catch {
    return null;
  }
}
