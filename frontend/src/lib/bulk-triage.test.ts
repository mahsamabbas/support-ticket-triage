import { describe, expect, it } from "vitest";
import { USER_STOP, bulkSummary, runBulkTriage, shouldFollow, type BulkResult } from "./bulk-triage";
import type { TriageOutcome } from "./triage-stream";
import type { Ticket } from "./types";

const ok = (id: string): TriageOutcome => ({ ok: true, ticket: { id } as Ticket });
const fail = (code: string): TriageOutcome => ({ ok: false, error: { code, message: code } });

function harness(outcomes: Record<string, TriageOutcome>, { stopAfter }: { stopAfter?: string } = {}) {
  const calls: string[] = [];
  const progress: number[] = [];
  let stop = false;
  const options = {
    start: async (id: string) => {
      calls.push(id);
      if (id === stopAfter) stop = true;
      return outcomes[id] ?? ok(id);
    },
    stopRequested: () => stop,
    beforeEach: () => {},
    onProgress: (done: number) => progress.push(done),
  };
  return { calls, progress, options };
}

describe("runBulkTriage", () => {
  it("triages every ticket and reports progress", async () => {
    const { calls, progress, options } = harness({});
    const result = await runBulkTriage(["a", "b", "c"], options);
    expect(result).toEqual({ total: 3, triaged: 3, failed: 0, stoppedBy: null });
    expect(calls).toEqual(["a", "b", "c"]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it("counts per-ticket failures and keeps going", async () => {
    const { calls, options } = harness({ a: fail("empty_draft"), b: fail("incomplete"), c: fail("invalid_state") });
    const result = await runBulkTriage(["a", "b", "c", "d"], options);
    expect(result).toEqual({ total: 4, triaged: 1, failed: 3, stoppedBy: null });
    expect(calls).toEqual(["a", "b", "c", "d"]);
  });

  it.each(["llm_unavailable", "network_error", "busy", "cancelled"])("stops on %s", async (code) => {
    const { calls, options } = harness({ b: fail(code) });
    const result = await runBulkTriage(["a", "b", "c"], options);
    expect(result).toEqual({ total: 3, triaged: 1, failed: 0, stoppedBy: code });
    expect(calls).toEqual(["a", "b"]);
  });

  it("stops before the next ticket when the user asks", async () => {
    const { calls, options } = harness({}, { stopAfter: "a" });
    const result = await runBulkTriage(["a", "b", "c"], options);
    expect(result).toEqual({ total: 3, triaged: 1, failed: 0, stoppedBy: USER_STOP });
    expect(calls).toEqual(["a"]);
  });

  it("treats a cancelled run after Stop as a user stop", async () => {
    const { options } = harness({ b: fail("cancelled") }, { stopAfter: "b" });
    const result = await runBulkTriage(["a", "b", "c"], options);
    expect(result).toEqual({ total: 3, triaged: 1, failed: 0, stoppedBy: USER_STOP });
  });

  it("calls beforeEach with each ticket before starting it", async () => {
    const seen: string[] = [];
    const { calls, options } = harness({});
    await runBulkTriage(["a", "b"], {
      ...options,
      beforeEach: (id) => seen.push(`${id}:${calls.length}`),
    });
    expect(seen).toEqual(["a:0", "b:1"]);
  });
});

describe("bulkSummary", () => {
  const base: BulkResult = { total: 4, triaged: 4, failed: 0, stoppedBy: null };

  it("celebrates a clean run", () => {
    expect(bulkSummary(base)).toEqual({ kind: "success", message: "Triaged 4 tickets." });
    expect(bulkSummary({ ...base, total: 1, triaged: 1 })).toEqual({ kind: "success", message: "Triaged 1 ticket." });
  });
  it("warns about per-ticket failures", () => {
    expect(bulkSummary({ ...base, triaged: 2, failed: 2 })).toEqual({
      kind: "warning",
      message: "2 of 4 tickets failed to triage.",
    });
  });
  it("explains why the run stopped", () => {
    expect(bulkSummary({ ...base, triaged: 1, stoppedBy: USER_STOP })).toEqual({
      kind: "info",
      message: "Stopped. Triaged 1 of 4.",
    });
    expect(bulkSummary({ ...base, triaged: 1, stoppedBy: "llm_unavailable" })).toEqual({
      kind: "warning",
      message: "Stopped: the model is unavailable. Triaged 1 of 4.",
    });
    expect(bulkSummary({ ...base, triaged: 1, stoppedBy: "network_error" })).toEqual({
      kind: "warning",
      message: "Stopped: lost connection to the API. Triaged 1 of 4.",
    });
    expect(bulkSummary({ ...base, triaged: 1, stoppedBy: "busy" })).toEqual({
      kind: "info",
      message: "Stopped: another triage is running. Triaged 1 of 4.",
    });
  });
  it("stays silent when the run was cancelled from outside", () => {
    expect(bulkSummary({ ...base, triaged: 1, stoppedBy: "cancelled" })).toBeNull();
  });
});

describe("shouldFollow", () => {
  it("follows when nothing is selected", () => {
    expect(shouldFollow(null, null)).toBe(true);
    expect(shouldFollow(null, "NG-1001")).toBe(true);
  });
  it("follows while the selection is still the one the run picked", () => {
    expect(shouldFollow("NG-1001", "NG-1001")).toBe(true);
  });
  it("stops following once the user picks another ticket", () => {
    expect(shouldFollow("NG-1005", "NG-1001")).toBe(false);
  });
});
