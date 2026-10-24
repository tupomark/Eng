import type { AiProvenance, AiResult, AiUsage } from "@/domain/ai/contracts";

export interface PreparedAiRequest {
  body: string;
  inputTokenUpperBound: number;
  provider: string;
  model: string;
}
export interface AiProviderPort {
  prepare(input: {
    instructions: string;
    payload: unknown;
    schema: unknown;
    schemaName: string;
  }): PreparedAiRequest;
  invoke(
    request: PreparedAiRequest,
    signal: AbortSignal,
  ): Promise<{ value: unknown; usage: AiUsage; model: string }>;
}
export interface AiQuotaReservationInput {
  userId: string;
  requestId: string;
  fingerprint: string;
  feature: "tutor" | "verification";
  reservedMicrousd: number;
  dailyBudgetMicrousd: number;
  serverDailyBudgetMicrousd: number;
  dailyRequestLimit: number;
}
export type AiReservation =
  | { status: "reserved" }
  | { status: "replay"; result: AiResult<unknown> }
  | { status: "in-progress" | "conflict" | "quota-exhausted" };
export interface AiQuotaPort {
  reserve(input: AiQuotaReservationInput): Promise<AiReservation>;
  complete(
    userId: string,
    requestId: string,
    result: AiResult<unknown>,
    provenance?: AiProvenance,
  ): Promise<void>;
}
export interface AiPipelineConfiguration {
  provider: "openai";
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  dailyRequestLimit: number;
  dailyBudgetMicrousd: number;
  serverDailyBudgetMicrousd: number;
  inputMicrousdPerMillionTokens: number;
  outputMicrousdPerMillionTokens: number;
}
