import { api, toApiError } from "./api";
import { queryKeys } from "./queries";
import { readSse, type SseMessage } from "./sse";
import type { Classified, Ticket } from "./types";

export type StepState = "idle" | "running" | "done" | "error";
export type StepView = { state: StepState; ms?: number };
export type TriageError = { code: string; message: string };
export type TriageOutcome = { ok: true; ticket: Ticket } | { ok: false; error: TriageError };

export type TriageStreamState = {
  runId: number | null;
  ticketId: string | null;
  running: boolean;
  classify: StepView;
  draft: StepView;
  classified: Classified | null;
  draftText: string;
  error: TriageError | null;
};

export type StepEvent = { name: "classify" | "draft"; state: "started" | "done"; ms?: number };

type RunEvent =
  | { type: "step"; step: StepEvent }
  | { type: "classified"; classified: Classified }
  | { type: "draft_token"; text: string }
  | { type: "done"; ticket: Ticket }
  | { type: "fail"; error: TriageError }
  | { type: "cancel" };

export type TriageAction =
  | { type: "start"; runId: number; ticketId: string }
  | (RunEvent & { runId: number })
  | { type: "reset" };

export const IDLE_TRIAGE: TriageStreamState = {
  runId: null,
  ticketId: null,
  running: false,
  classify: { state: "idle" },
  draft: { state: "idle" },
  classified: null,
  draftText: "",
  error: null,
};

export const BUSY: TriageOutcome = {
  ok: false,
  error: { code: "busy", message: "Another triage is still running." },
};

export const CANCELLED: TriageOutcome = {
  ok: false,
  error: { code: "cancelled", message: "Triage was cancelled." },
};

const NETWORK_ERROR: TriageError = {
  code: "network_error",
  message: "Lost connection to the QueueWise API.",
};

const INCOMPLETE: TriageError = {
  code: "incomplete",
  message: "The triage stream ended unexpectedly. Try again.",
};

const PROTOCOL_ERROR: TriageError = {
  code: "protocol_error",
  message: "The triage stream sent data the console couldn't read.",
};

export function failRunningSteps(state: TriageStreamState, error: TriageError): TriageStreamState {
  const fail = (step: StepView): StepView => (step.state === "running" ? { state: "error" } : step);
  return { ...state, error, classify: fail(state.classify), draft: fail(state.draft) };
}

export function applyStep(state: TriageStreamState, step: StepEvent): TriageStreamState {
  const view: StepView = { state: step.state === "started" ? "running" : "done", ms: step.ms };
  return step.name === "classify" ? { ...state, classify: view } : { ...state, draft: view };
}

function idleRunningSteps(state: TriageStreamState): TriageStreamState {
  const idle = (step: StepView): StepView => (step.state === "running" ? { state: "idle" } : step);
  return { ...state, classify: idle(state.classify), draft: idle(state.draft) };
}

export function triageReducer(state: TriageStreamState, action: TriageAction): TriageStreamState {
  if (action.type === "reset") return IDLE_TRIAGE;
  if (action.type === "start") {
    if (state.running) return state;
    return {
      ...IDLE_TRIAGE,
      runId: action.runId,
      ticketId: action.ticketId,
      running: true,
      classify: { state: "running" },
    };
  }
  if (!state.running || action.runId !== state.runId) return state;
  switch (action.type) {
    case "step":
      return applyStep(state, action.step);
    case "classified":
      return { ...state, classified: action.classified };
    case "draft_token":
      return { ...state, draftText: state.draftText + action.text };
    case "done":
      return { ...state, running: false };
    case "fail":
      return { ...failRunningSteps(state, action.error), running: false };
    case "cancel":
      return { ...idleRunningSteps(state), running: false };
  }
}

type QueryKey = readonly unknown[];

export function staleQueriesFor(ticketId: string, outcome: TriageOutcome): QueryKey[] {
  if (outcome.ok) return [];
  const { code } = outcome.error;
  if (code === "llm_unavailable") return [queryKeys.health];
  if (code === "invalid_state" || code === "not_found") {
    return [queryKeys.ticket(ticketId), ["tickets"], queryKeys.stats];
  }
  return [];
}

class ProtocolError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toEvent({ event, data }: SseMessage): RunEvent | null {
  const payload: unknown = JSON.parse(data);
  if (!isRecord(payload)) throw new ProtocolError(`Event ${event} has no object payload.`);
  switch (event) {
    case "step": {
      const { name, state } = payload;
      if ((name !== "classify" && name !== "draft") || (state !== "started" && state !== "done")) {
        throw new ProtocolError("Malformed step event.");
      }
      return { type: "step", step: payload as StepEvent };
    }
    case "classified":
      return { type: "classified", classified: payload as Classified };
    case "draft_token":
      if (typeof payload.text !== "string") throw new ProtocolError("Malformed draft token.");
      return { type: "draft_token", text: payload.text };
    case "done":
      return { type: "done", ticket: payload as Ticket };
    case "error": {
      const { code, message } = payload;
      if (typeof code !== "string" || typeof message !== "string") {
        throw new ProtocolError("Malformed error event.");
      }
      return { type: "fail", error: { code, message } };
    }
    default:
      return null;
  }
}

type RunOptions = {
  runId: number;
  signal: AbortSignal;
  dispatch: (action: TriageAction) => void;
};

export async function runTriageStream(
  ticketId: string,
  { runId, signal, dispatch }: RunOptions,
): Promise<TriageOutcome> {
  const request = new AbortController();
  const result: { outcome: TriageOutcome | null } = { outcome: null };
  const emit = (event: RunEvent) => {
    if (signal.aborted) return;
    if (event.type === "done") result.outcome = { ok: true, ticket: event.ticket };
    if (event.type === "fail") result.outcome = { ok: false, error: event.error };
    dispatch({ ...event, runId });
  };

  if (signal.aborted) return CANCELLED;
  dispatch({ type: "start", runId, ticketId });
  try {
    const response = await fetch(api.triageUrl(ticketId), {
      method: "POST",
      signal: AbortSignal.any([signal, request.signal]),
    });
    if (!response.ok) {
      const { code, message } = await toApiError(response);
      emit({ type: "fail", error: { code, message } });
    } else {
      await readSse(response, (message) => {
        if (signal.aborted || result.outcome) return;
        try {
          const event = toEvent(message);
          if (event) emit(event);
        } catch (error) {
          throw error instanceof ProtocolError ? error : new ProtocolError(String(error));
        }
      });
    }
  } catch (error) {
    if (error instanceof ProtocolError) {
      request.abort();
      emit({ type: "fail", error: PROTOCOL_ERROR });
    } else if (!result.outcome) {
      emit({ type: "fail", error: NETWORK_ERROR });
    }
  }
  if (signal.aborted) return result.outcome ?? CANCELLED;
  if (!result.outcome) emit({ type: "fail", error: INCOMPLETE });
  return result.outcome ?? { ok: false, error: INCOMPLETE };
}
