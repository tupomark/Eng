import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LearningCommand,
  TrustedLearningCommandPort,
  VerifiedActor,
} from "@/application/server/learning-command";
import { mapLegacyId } from "./legacy-id";

export class RemoteCommandError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function safeDatabaseError(code?: string): RemoteCommandError {
  if (code === "40001")
    return new RemoteCommandError(
      "This item changed elsewhere. Reload it before retrying; your answer is still available.",
      409,
    );
  if (code === "P0002")
    return new RemoteCommandError(
      "This item is no longer available in your account.",
      404,
    );
  if (["22023", "23503", "23505"].includes(code ?? ""))
    return new RemoteCommandError(
      "This action conflicts with saved data. Review the item and try again.",
      409,
    );
  return new RemoteCommandError(
    "Cloud saving is temporarily unavailable. Keep this action and retry; it has not been confirmed.",
    503,
  );
}

export class SupabaseCommandRepository implements TrustedLearningCommandPort {
  constructor(private readonly client: SupabaseClient) {}

  async execute(
    actor: VerifiedActor,
    command: LearningCommand,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    let name: string;
    let parameters: Record<string, unknown>;
    const base = { p_user_id: actor.userId, p_key: command.key };
    switch (command.type) {
      case "archive-sense":
        name = "archive_saved_sense_command";
        parameters = {
          ...base,
          p_sense_id: command.senseId,
          p_expected_revision: command.expectedRevision,
        };
        break;
      case "self-review":
        name = "record_self_review_command";
        parameters = {
          ...base,
          p_sense_id: command.senseId,
          p_event_id: command.eventId,
          p_rating: command.rating,
          p_occurred_at: command.occurredAt,
          p_expected_revision: command.expectedRevision,
        };
        break;
      case "dispute-evidence":
        name = "dispute_evidence_command";
        parameters = {
          ...base,
          p_evidence_id: command.evidenceId,
          p_reason: command.reason,
        };
        break;
      case "purge-sense":
        name = "purge_saved_sense_command";
        parameters = {
          ...base,
          p_sense_id: command.senseId,
          p_confirmation: command.confirmation,
        };
        break;
      case "append-writing-revision":
        name = "append_writing_revision_command";
        parameters = {
          ...base,
          p_draft_id: command.draftId,
          p_revision_id: command.revisionId,
          p_parent_revision_id: command.parentRevisionId,
          p_body: command.body,
        };
        break;
    }
    const timeout = AbortSignal.timeout(10000);
    const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const { data, error } = await this.client
      .rpc(name, parameters)
      .abortSignal(abort);
    if (error) throw safeDatabaseError(error.code);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw safeDatabaseError();
    const result = data as Record<string, unknown>;
    const matches =
      command.type === "self-review"
        ? result.evidenceId === command.eventId
        : command.type === "dispute-evidence"
          ? result.evidenceId === command.evidenceId
          : command.type === "append-writing-revision"
            ? result.revisionId === command.revisionId &&
              typeof result.conflict === "boolean"
            : result.senseId === command.senseId;
    if (!matches) throw safeDatabaseError();
    return result;
  }

  async persistLegacyMapping(
    actor: VerifiedActor,
    namespace: string,
    legacyId: string,
  ): Promise<string> {
    const mappedId = mapLegacyId(actor.userId, namespace, legacyId);
    const { data, error } = await this.client
      .rpc("map_legacy_id_command", {
        p_user_id: actor.userId,
        p_namespace: namespace,
        p_legacy_id: legacyId,
        p_mapped_id: mappedId,
      })
      .abortSignal(AbortSignal.timeout(10000));
    if (error) throw safeDatabaseError(error.code);
    if (data !== mappedId) throw safeDatabaseError();
    return mappedId;
  }
}
