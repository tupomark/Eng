import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiQuotaPort,
  AiQuotaReservationInput,
  AiReservation,
} from "@/application/ai/ports";
import type { AiResult } from "@/domain/ai/contracts";

export class SupabaseAiQuotaRepository implements AiQuotaPort {
  constructor(private readonly client: Pick<SupabaseClient, "rpc">) {}
  async reserve(input: AiQuotaReservationInput): Promise<AiReservation> {
    const { data, error } = await this.client
      .rpc("reserve_ai_request_command", {
        p_user_id: input.userId,
        p_request_key: input.requestId,
        p_fingerprint: input.fingerprint,
        p_feature: input.feature,
        p_reserved_microusd: input.reservedMicrousd,
        p_user_budget_microusd: input.dailyBudgetMicrousd,
        p_server_budget_microusd: input.serverDailyBudgetMicrousd,
        p_daily_request_limit: input.dailyRequestLimit,
      })
      .abortSignal(AbortSignal.timeout(10_000));
    if (
      error ||
      !data ||
      typeof data !== "object" ||
      ![
        "reserved",
        "replay",
        "in-progress",
        "conflict",
        "quota-exhausted",
      ].includes(data.status)
    )
      throw new Error("AI cost controls could not be confirmed.");
    if (
      data.status === "replay" &&
      (!data.result || typeof data.result.ok !== "boolean")
    )
      throw new Error("AI delivery receipt could not be read.");
    return data as AiReservation;
  }
  async complete(
    userId: string,
    requestId: string,
    result: AiResult<unknown>,
  ): Promise<void> {
    const { error } = await this.client
      .rpc("complete_ai_request_command", {
        p_user_id: userId,
        p_request_key: requestId,
        p_result: result,
      })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error)
      throw new Error(
        "The AI reply could not be durably confirmed. Your question remains saved locally.",
      );
  }
}
