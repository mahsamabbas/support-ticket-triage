import type { TriageOutcome } from "./triage-stream";

export const USER_STOP = "stopped";

const STOP_ERRORS = new Set(["busy", "cancelled", "llm_unavailable", "network_error"]);

export type BulkResult = { total: number; triaged: number; failed: number; stoppedBy: string | null };
export type BulkSummary = { kind: "success" | "info" | "warning"; message: string };

type BulkOptions = {
  start: (id: string) => Promise<TriageOutcome>;
  stopRequested: () => boolean;
  beforeEach: (id: string) => void;
  onProgress: (done: number) => void;
};

export async function runBulkTriage(
  ids: readonly string[],
  { start, stopRequested, beforeEach, onProgress }: BulkOptions,
): Promise<BulkResult> {
  const result: BulkResult = { total: ids.length, triaged: 0, failed: 0, stoppedBy: null };
  for (const [index, id] of ids.entries()) {
    if (stopRequested()) {
      result.stoppedBy = USER_STOP;
      break;
    }
    beforeEach(id);
    const outcome = await start(id);
    onProgress(index + 1);
    if (outcome.ok) {
      result.triaged += 1;
      continue;
    }
    const { code } = outcome.error;
    if (code === "cancelled" && stopRequested()) {
      result.stoppedBy = USER_STOP;
      break;
    }
    if (STOP_ERRORS.has(code)) {
      result.stoppedBy = code;
      break;
    }
    result.failed += 1;
  }
  return result;
}

const STOP_COPY: Record<string, [BulkSummary["kind"], string]> = {
  [USER_STOP]: ["info", "Stopped."],
  llm_unavailable: ["warning", "Stopped: the model is unavailable."],
  network_error: ["warning", "Stopped: lost connection to the API."],
  busy: ["info", "Stopped: another triage is running."],
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function bulkSummary({ total, triaged, failed, stoppedBy }: BulkResult): BulkSummary | null {
  if (stoppedBy === "cancelled") return null;
  if (stoppedBy) {
    const [kind, lead] = STOP_COPY[stoppedBy] ?? ["warning", "Stopped."];
    return { kind, message: `${lead} Triaged ${triaged} of ${total}.` };
  }
  if (failed === 0) return { kind: "success", message: `Triaged ${plural(total, "ticket")}.` };
  return { kind: "warning", message: `${failed} of ${plural(total, "ticket")} failed to triage.` };
}

export function shouldFollow(selectedId: string | null, lastAutoId: string | null): boolean {
  return selectedId === null || selectedId === lastAutoId;
}
