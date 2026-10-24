import "server-only";
import { createHash } from "node:crypto";
import { AiPipeline } from "@/application/ai/pipeline";
import {
  createAuthServerContext,
  createTrustedCommandClient,
} from "@/infrastructure/supabase/server";
import { readAiConfiguration, aiCapabilitySnapshot } from "./configuration";
import { OpenAiResponsesProvider } from "./openai-responses";
import { SupabaseAiQuotaRepository } from "./quota-repository";

export function currentAiCapabilities() {
  return aiCapabilitySnapshot(
    readAiConfiguration(process.env),
    Boolean(createTrustedCommandClient()),
  );
}
export async function createAiRuntime(signal: AbortSignal) {
  const configuration = readAiConfiguration(process.env);
  const trusted = createTrustedCommandClient();
  const context =
    configuration && trusted
      ? await createAuthServerContext(true, signal)
      : null;
  const provider = configuration
    ? new OpenAiResponsesProvider({
        apiKey: process.env.OPENAI_API_KEY!,
        model: configuration.model,
        maxOutputTokens: configuration.maxOutputTokens,
      })
    : null;
  return {
    responseHeaders: context?.responseHeaders,
    pipeline: new AiPipeline(
      configuration,
      provider,
      trusted ? new SupabaseAiQuotaRepository(trusted) : null,
      async () => {
        if (!context) return null;
        const { data, error } = await context.client.auth.getUser();
        return !error && data.user ? { userId: data.user.id } : null;
      },
      (value) => createHash("sha256").update(value).digest("hex"),
    ),
  };
}
