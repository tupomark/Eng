export const RESTORE_STATUSES = [
  "staged",
  "running",
  "partial",
  "complete",
  "cancelled",
  "partial-accepted",
] as const;
export interface ProfileRestoreStep {
  id: string;
  kind: "local" | "writing" | "media-asset" | "media-session";
  target: string;
  beforeHash: string | null;
  afterHash: string;
}
export interface ProfileRestoreMarker {
  version: 1;
  id: string;
  owner: "local";
  fileHash: string;
  epoch: string;
  status: (typeof RESTORE_STATUSES)[number];
  startedAt: string;
  updatedAt: string;
  steps: ProfileRestoreStep[];
  completed: string[];
  failedStep?: string;
}
const invalid = () =>
  new Error(
    "The saved profile recovery journal is unreadable. Its original bytes are preserved; do not replace it with an empty profile.",
  );
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    throw invalid();
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,200}$/u.test(value))
    throw invalid();
  return value;
}
function target(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw invalid();
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    throw invalid();
  return value;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 30 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw invalid();
  return value;
}
export function parseProfileRestoreMarker(
  value: unknown,
): ProfileRestoreMarker {
  const item = record(value);
  keys(
    item,
    [
      "version",
      "id",
      "owner",
      "fileHash",
      "epoch",
      "status",
      "startedAt",
      "updatedAt",
      "steps",
      "completed",
    ],
    ["failedStep"],
  );
  if (
    item.version !== 1 ||
    item.owner !== "local" ||
    !RESTORE_STATUSES.includes(item.status as ProfileRestoreMarker["status"]) ||
    !Array.isArray(item.steps) ||
    item.steps.length < 1 ||
    item.steps.length > 1000 ||
    !Array.isArray(item.completed)
  )
    throw invalid();
  const steps: ProfileRestoreStep[] = item.steps.map((value) => {
    const step = record(value);
    keys(step, ["id", "kind", "target", "beforeHash", "afterHash"]);
    if (
      !["local", "writing", "media-asset", "media-session"].includes(
        String(step.kind),
      )
    )
      throw invalid();
    return {
      id: id(step.id),
      kind: step.kind as ProfileRestoreStep["kind"],
      target: target(step.target),
      beforeHash: step.beforeHash === null ? null : hash(step.beforeHash),
      afterHash: hash(step.afterHash),
    };
  });
  const stepIds = new Set(steps.map((step) => step.id));
  if (
    stepIds.size !== steps.length ||
    new Set(steps.map((step) => `${step.kind}|${step.target}`)).size !==
      steps.length
  )
    throw invalid();
  const completed = item.completed.map(id);
  if (
    new Set(completed).size !== completed.length ||
    completed.some((value) => !stepIds.has(value))
  )
    throw invalid();
  // Receipts form a canonical prefix. A later step cannot imply that earlier data was written.
  if (completed.some((value, index) => steps[index]?.id !== value))
    throw invalid();
  if (
    (item.status === "complete" && completed.length !== steps.length) ||
    (item.status === "cancelled" && completed.length !== 0)
  )
    throw invalid();
  if (item.failedStep !== undefined && !stepIds.has(id(item.failedStep)))
    throw invalid();
  return {
    version: 1,
    id: id(item.id),
    owner: "local",
    fileHash: hash(item.fileHash),
    epoch: id(item.epoch),
    status: item.status as ProfileRestoreMarker["status"],
    startedAt: timestamp(item.startedAt),
    updatedAt: timestamp(item.updatedAt),
    steps,
    completed,
    ...(item.failedStep ? { failedStep: id(item.failedStep) } : {}),
  };
}

export interface ProfileRestorePayload {
  bytes: Uint8Array;
  metadata?: string;
}
