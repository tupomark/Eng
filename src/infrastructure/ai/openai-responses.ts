import type { AiProviderPort, PreparedAiRequest } from "@/application/ai/ports";

export class AiProviderFailure extends Error {
  constructor(
    readonly kind: "provider-failure" | "refused" | "invalid-output",
  ) {
    super("AI response could not be confirmed.");
  }
}

/** Fixed official endpoint; callers cannot supply URLs, tools or privileged instructions. */
export class OpenAiResponsesProvider implements AiProviderPort {
  constructor(
    private readonly configuration: {
      apiKey: string;
      model: string;
      maxOutputTokens: number;
    },
    private readonly send: typeof fetch = fetch,
  ) {}
  prepare(input: {
    instructions: string;
    payload: unknown;
    schema: unknown;
    schemaName: string;
  }): PreparedAiRequest {
    const body = JSON.stringify({
      model: this.configuration.model,
      instructions: input.instructions,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: JSON.stringify(input.payload) },
          ],
        },
      ],
      store: false,
      stream: false,
      max_output_tokens: this.configuration.maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    });
    const bytes = new TextEncoder().encode(body).byteLength;
    if (bytes > 100_000) throw new AiProviderFailure("invalid-output");
    // Byte-level tokenization cannot contain more tokens than input UTF-8 bytes.
    // Count the whole envelope too: conservative over-reservation, never a proficiency metric.
    return {
      body,
      inputTokenUpperBound: bytes,
      provider: "openai",
      model: this.configuration.model,
    };
  }
  async invoke(request: PreparedAiRequest, signal: AbortSignal) {
    const response = await this.send("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: request.body,
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new AiProviderFailure("provider-failure");
    const reader = response.body?.getReader();
    if (!reader) throw new AiProviderFailure("invalid-output");
    let text = "",
      bytes = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > 150_000) {
          await reader.cancel();
          throw new AiProviderFailure("invalid-output");
        }
        text += decoder.decode(item.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new AiProviderFailure("invalid-output");
    }
    if (!value || typeof value !== "object")
      throw new AiProviderFailure("invalid-output");
    const root = value as Record<string, unknown>;
    if (
      root.status !== "completed" ||
      typeof root.model !== "string" ||
      root.model.length > 200 ||
      !root.model.trim() ||
      !Array.isArray(root.output) ||
      !root.usage ||
      typeof root.usage !== "object"
    )
      throw new AiProviderFailure("invalid-output");
    const usage = root.usage as Record<string, unknown>;
    if (
      !Number.isSafeInteger(usage.input_tokens) ||
      (usage.input_tokens as number) < 0 ||
      !Number.isSafeInteger(usage.output_tokens) ||
      (usage.output_tokens as number) < 0 ||
      (usage.output_tokens as number) > this.configuration.maxOutputTokens
    )
      throw new AiProviderFailure("invalid-output");
    const texts: string[] = [];
    for (const output of root.output) {
      if (
        !output ||
        typeof output !== "object" ||
        !Array.isArray((output as Record<string, unknown>).content)
      )
        continue;
      for (const content of (output as { content: unknown[] }).content) {
        if (!content || typeof content !== "object") continue;
        const part = content as Record<string, unknown>;
        if (part.type === "refusal") throw new AiProviderFailure("refused");
        if (part.type === "output_text" && typeof part.text === "string")
          texts.push(part.text);
      }
    }
    if (texts.length !== 1) throw new AiProviderFailure("invalid-output");
    try {
      return {
        value: JSON.parse(texts[0]!),
        model: root.model,
        usage: {
          inputTokens: usage.input_tokens as number,
          outputTokens: usage.output_tokens as number,
        },
      };
    } catch {
      throw new AiProviderFailure("invalid-output");
    }
  }
}
