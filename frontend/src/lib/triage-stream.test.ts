import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import {
  IDLE_TRIAGE,
  runTriageStream,
  triageReducer,
  type TriageAction,
  type TriageStreamState,
} from "./triage-stream";
import type { Classified, Ticket } from "./types";

const CLASSIFIED: Classified = {
  category: "billing",
  urgency: "high",
  queue: "Billing Team",
  reason: "Double charge",
  confidence: 0.9,
  flags: [],
};

const TICKET = { id: "NG-1001", status: "triaged" } as Ticket;

function frame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type StreamMode = "close" | "error-on-abort" | "late-frame-on-abort";

function sseResponse(frames: string[], signal: AbortSignal, mode: StreamMode = "close") {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const text of frames) controller.enqueue(encoder.encode(text));
      if (mode === "close") return controller.close();
      signal.addEventListener("abort", () => {
        if (mode === "error-on-abort") {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        } else {
          controller.enqueue(encoder.encode(frame("draft_token", { text: "late" })));
          controller.close();
        }
      });
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function stubFetch(respond: (signal: AbortSignal) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => respond(init.signal as AbortSignal));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function harness() {
  const box: { state: TriageStreamState } = { state: IDLE_TRIAGE };
  const dispatch = vi.fn((action: TriageAction) => {
    box.state = triageReducer(box.state, action);
  });
  return { box, dispatch };
}

async function run(signal = new AbortController().signal) {
  const { box, dispatch } = harness();
  const outcome = await runTriageStream("NG-1001", { signal, dispatch });
  return { outcome, state: box.state, dispatch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("triageReducer", () => {
  it("starts a run with classify running", () => {
    const state = triageReducer(IDLE_TRIAGE, { type: "start", ticketId: "NG-1001" });
    expect(state).toMatchObject({ ticketId: "NG-1001", running: true, classify: { state: "running" } });
  });

  it("refuses a second start while a run is in flight", () => {
    const running = triageReducer(IDLE_TRIAGE, { type: "start", ticketId: "NG-1001" });
    expect(triageReducer(running, { type: "start", ticketId: "NG-2002" })).toBe(running);
  });

  it("reset clears everything back to idle", () => {
    let state = triageReducer(IDLE_TRIAGE, { type: "start", ticketId: "NG-1001" });
    state = triageReducer(state, { type: "draft_token", text: "Hi" });
    expect(triageReducer(state, { type: "reset" })).toEqual(IDLE_TRIAGE);
  });

  it("stays running between draft done and the done event", () => {
    let state = triageReducer(IDLE_TRIAGE, { type: "start", ticketId: "NG-1001" });
    state = triageReducer(state, { type: "step", step: { name: "draft", state: "done", ms: 5 } });
    expect(state.running).toBe(true);
    expect(triageReducer(state, { type: "done", ticket: TICKET }).running).toBe(false);
  });

  it("ignores stream events when no run is in flight", () => {
    expect(triageReducer(IDLE_TRIAGE, { type: "draft_token", text: "stray" })).toBe(IDLE_TRIAGE);
  });
});

describe("runTriageStream", () => {
  it("streams a successful run into state and returns the saved ticket", async () => {
    const fetchMock = stubFetch((signal) =>
      sseResponse(
        [
          frame("step", { name: "classify", state: "started" }),
          frame("step", { name: "classify", state: "done", ms: 1200 }),
          frame("classified", CLASSIFIED),
          frame("step", { name: "draft", state: "started" }),
          frame("draft_token", { text: "Hello" }) + frame("draft_token", { text: " there" }),
          frame("step", { name: "draft", state: "done", ms: 800 }),
          frame("done", TICKET),
        ],
        signal,
      ),
    );
    const { outcome, state } = await run();
    expect(outcome).toEqual({ ok: true, ticket: TICKET });
    expect(fetchMock).toHaveBeenCalledWith(api.triageUrl("NG-1001"), expect.objectContaining({ method: "POST" }));
    expect(state).toMatchObject({
      ticketId: "NG-1001",
      running: false,
      classify: { state: "done", ms: 1200 },
      draft: { state: "done", ms: 800 },
      classified: CLASSIFIED,
      draftText: "Hello there",
      error: null,
    });
  });

  it("returns a pre-stream 503 as an llm_unavailable error", async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({ detail: { code: "llm_unavailable", message: "Ollama is not reachable." } }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
    );
    const { outcome, state } = await run();
    expect(outcome).toEqual({
      ok: false,
      error: { code: "llm_unavailable", message: "Ollama is not reachable." },
    });
    expect(state).toMatchObject({ running: false, classify: { state: "error" } });
  });

  it("fails the running step on a streamed error event", async () => {
    const error = { code: "empty_draft", message: "The model returned an empty reply." };
    stubFetch((signal) =>
      sseResponse(
        [
          frame("step", { name: "classify", state: "started" }),
          frame("step", { name: "classify", state: "done", ms: 900 }),
          frame("classified", CLASSIFIED),
          frame("step", { name: "draft", state: "started" }),
          frame("error", error),
        ],
        signal,
      ),
    );
    const { outcome, state } = await run();
    expect(outcome).toEqual({ ok: false, error });
    expect(state).toMatchObject({
      running: false,
      classify: { state: "done", ms: 900 },
      draft: { state: "error" },
      error,
    });
  });

  it("fails as incomplete when the stream closes without done or error", async () => {
    stubFetch((signal) => sseResponse([frame("step", { name: "classify", state: "started" })], signal));
    const { outcome, state } = await run();
    expect(outcome).toMatchObject({ ok: false, error: { code: "incomplete" } });
    expect(state).toMatchObject({ running: false, classify: { state: "error" } });
    expect(state.error?.code).toBe("incomplete");
  });

  it("aborts the request and fails as protocol_error on malformed JSON", async () => {
    const fetchMock = stubFetch((signal) =>
      sseResponse(
        [frame("step", { name: "classify", state: "started" }), "event: classified\ndata: {not json\n\n"],
        signal,
        "error-on-abort",
      ),
    );
    const { outcome, state } = await run();
    expect(outcome).toMatchObject({ ok: false, error: { code: "protocol_error" } });
    expect(state).toMatchObject({ running: false, classify: { state: "error" } });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it("reports an unreachable API as network_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { outcome, state } = await run();
    expect(outcome).toMatchObject({ ok: false, error: { code: "network_error" } });
    expect(state.running).toBe(false);
  });

  it("ends silently as cancelled when aborted mid-stream", async () => {
    const controller = new AbortController();
    stubFetch((signal) =>
      sseResponse([frame("step", { name: "classify", state: "started" })], signal, "error-on-abort"),
    );
    const { box, dispatch } = harness();
    const pending = runTriageStream("NG-1001", { signal: controller.signal, dispatch });
    await vi.waitFor(() => expect(box.state.classify.state).toBe("running"));
    const callsBeforeAbort = dispatch.mock.calls.length;
    controller.abort();
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(dispatch).toHaveBeenCalledTimes(callsBeforeAbort);
  });

  it("ignores frames that arrive after the run was aborted", async () => {
    const controller = new AbortController();
    stubFetch((signal) =>
      sseResponse([frame("step", { name: "classify", state: "started" })], signal, "late-frame-on-abort"),
    );
    const { box, dispatch } = harness();
    const pending = runTriageStream("NG-1001", { signal: controller.signal, dispatch });
    await vi.waitFor(() => expect(box.state.classify.state).toBe("running"));
    const callsBeforeAbort = dispatch.mock.calls.length;
    controller.abort();
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(dispatch).toHaveBeenCalledTimes(callsBeforeAbort);
    expect(box.state.draftText).toBe("");
  });
});
