"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { api, toApiError } from "@/lib/api";
import { queryKeys, useTicketCacheSync } from "@/lib/queries";
import { readSse } from "@/lib/sse";
import type { Classified, Ticket } from "@/lib/types";

export type StepState = "idle" | "running" | "done" | "error";
export type StepView = { state: StepState; ms?: number };
export type TriageError = { code: string; message: string };
export type TriageOutcome = { ok: true; ticket: Ticket } | { ok: false; error: TriageError };

export type TriageStreamState = {
  ticketId: string | null;
  classify: StepView;
  draft: StepView;
  classified: Classified | null;
  draftText: string;
  error: TriageError | null;
};

type StepEvent = { name: "classify" | "draft"; state: "started" | "done"; ms?: number };

const IDLE: TriageStreamState = {
  ticketId: null,
  classify: { state: "idle" },
  draft: { state: "idle" },
  classified: null,
  draftText: "",
  error: null,
};

const BUSY: TriageOutcome = {
  ok: false,
  error: { code: "busy", message: "Another triage is still running." },
};

function failRunningSteps(state: TriageStreamState, error: TriageError): TriageStreamState {
  const fail = (step: StepView): StepView => (step.state === "running" ? { state: "error" } : step);
  return { ...state, error, classify: fail(state.classify), draft: fail(state.draft) };
}

function applyStep(state: TriageStreamState, step: StepEvent): TriageStreamState {
  const view: StepView = { state: step.state === "started" ? "running" : "done", ms: step.ms };
  return step.name === "classify" ? { ...state, classify: view } : { ...state, draft: view };
}

export function useTriageStream() {
  const [state, setState] = useState<TriageStreamState>(IDLE);
  const running = useRef(false);
  const queryClient = useQueryClient();
  const sync = useTicketCacheSync();

  const start = useCallback(
    async (ticketId: string): Promise<TriageOutcome> => {
      if (running.current) return BUSY;
      running.current = true;
      setState({ ...IDLE, ticketId, classify: { state: "running" } });
      const outcome: { value: TriageOutcome | null } = { value: null };
      const fail = (error: TriageError) => {
        outcome.value = { ok: false, error };
        setState((current) => failRunningSteps(current, error));
      };

      try {
        const response = await fetch(api.triageUrl(ticketId), { method: "POST" });
        if (!response.ok) {
          const error = await toApiError(response);
          if (error.code === "llm_unavailable") {
            void queryClient.invalidateQueries({ queryKey: queryKeys.health });
          }
          fail({ code: error.code, message: error.message });
        } else {
          await readSse(response, ({ event, data }) => {
            const payload: unknown = JSON.parse(data);
            if (event === "step") {
              setState((current) => applyStep(current, payload as StepEvent));
            } else if (event === "classified") {
              setState((current) => ({ ...current, classified: payload as Classified }));
            } else if (event === "draft_token") {
              const { text } = payload as { text: string };
              setState((current) => ({ ...current, draftText: current.draftText + text }));
            } else if (event === "done") {
              const ticket = payload as Ticket;
              outcome.value = { ok: true, ticket };
              sync(ticket);
            } else if (event === "error") {
              fail(payload as TriageError);
            }
          });
        }
      } catch {
        fail({ code: "network_error", message: "Lost connection to the QueueWise API." });
      } finally {
        running.current = false;
      }
      return (
        outcome.value ?? {
          ok: false,
          error: { code: "incomplete", message: "The triage stream ended early." },
        }
      );
    },
    [queryClient, sync],
  );

  const reset = useCallback(() => setState(IDLE), []);
  const isRunning = state.classify.state === "running" || state.draft.state === "running";
  return { state, start, reset, isRunning };
}
