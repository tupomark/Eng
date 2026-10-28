import type { AiPipelineConfiguration } from "@/application/ai/ports";

/** No default model, key, prices or budget. An operator must verify current provider terms. */
export function readAiConfiguration(
  environment: Record<string, string | undefined>,
): AiPipelineConfiguration | null {
  if (
    environment.LEXIS_AI_ENABLED !== "true" ||
    environment.LEXIS_AI_PROVIDER !== "openai" ||
    !environment.OPENAI_API_KEY ||
    !environment.LEXIS_AI_MODEL ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/u.test(environment.LEXIS_AI_MODEL)
  )
    return null;
  const positive = (name: string, min: number, max: number) => {
    const raw = environment[name];
    if (!raw || !Number.isFinite(Number(raw))) return null;
    const value = Number(raw);
    return value >= min && value <= max ? value : null;
  };
  const maxOutputTokens = positive("LEXIS_AI_MAX_OUTPUT_TOKENS", 128, 8_192);
  const dailyRequestLimit = positive("LEXIS_AI_DAILY_REQUEST_LIMIT", 1, 500);
  const dailyBudgetUsd = positive("LEXIS_AI_DAILY_BUDGET_USD", 0.01, 100);
  const serverBudgetUsd = positive(
    "LEXIS_AI_SERVER_DAILY_BUDGET_USD",
    0.01,
    10_000,
  );
  const inputUsdPerMillion = positive(
    "LEXIS_AI_INPUT_USD_PER_MILLION",
    0.001,
    1_000,
  );
  const outputUsdPerMillion = positive(
    "LEXIS_AI_OUTPUT_USD_PER_MILLION",
    0.001,
    10_000,
  );
  if (
    [
      maxOutputTokens,
      dailyRequestLimit,
      dailyBudgetUsd,
      serverBudgetUsd,
      inputUsdPerMillion,
      outputUsdPerMillion,
    ].some((value) => value === null) ||
    !Number.isInteger(maxOutputTokens) ||
    !Number.isInteger(dailyRequestLimit)
  )
    return null;
  return {
    provider: "openai",
    model: environment.LEXIS_AI_MODEL,
    maxOutputTokens: maxOutputTokens!,
    timeoutMs: 30_000,
    dailyRequestLimit: dailyRequestLimit!,
    dailyBudgetMicrousd: Math.ceil(dailyBudgetUsd! * 1_000_000),
    serverDailyBudgetMicrousd: Math.ceil(serverBudgetUsd! * 1_000_000),
    inputMicrousdPerMillionTokens: Math.ceil(inputUsdPerMillion! * 1_000_000),
    outputMicrousdPerMillionTokens: Math.ceil(outputUsdPerMillion! * 1_000_000),
  };
}

export function aiCapabilitySnapshot(
  configuration: AiPipelineConfiguration | null,
  trustedStorageConfigured: boolean,
) {
  const configured = Boolean(configuration && trustedStorageConfigured);
  return {
    tutor: {
      supported: true,
      configured,
      availableNow: false,
      verifiedLive: false,
      status: configured ? "awaiting-verification" : "awaiting-configuration",
      provider: configuration?.provider ?? null,
      model: configuration?.model ?? null,
      lastVerification: null,
    },
    verification: {
      supported: true,
      configured,
      availableNow: false,
      verifiedLive: false,
      status: configured ? "awaiting-verification" : "awaiting-configuration",
    },
    pronunciation: {
      supported: false,
      configured: false,
      availableNow: false,
      verifiedLive: false,
      status: "awaiting-configuration",
    },
  };
}
