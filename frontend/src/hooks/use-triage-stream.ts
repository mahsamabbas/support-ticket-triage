"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { queryKeys, useTicketCacheSync } from "@/lib/queries";
import {
  BUSY,
  IDLE_TRIAGE,
  runTriageStream,
  triageReducer,
  type TriageAction,
  type TriageOutcome,
} from "@/lib/triage-stream";

export type {
  StepState,
  StepView,
  TriageError,
  TriageOutcome,
  TriageStreamState,
} from "@/lib/triage-stream";

const STALE_TICKET_CODES = new Set(["invalid_state", "not_found"]);

export function useTriageStream() {
  const [state, dispatch] = useReducer(triageReducer, IDLE_TRIAGE);
  const controller = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const sync = useTicketCacheSync();

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (ticketId: string): Promise<TriageOutcome> => {
      if (controller.current) return BUSY;
      const run = new AbortController();
      controller.current = run;
      const handle = (action: TriageAction) => {
        if (action.type === "done") sync(action.ticket);
        dispatch(action);
      };
      try {
        const outcome = await runTriageStream(ticketId, { signal: run.signal, dispatch: handle });
        if (!outcome.ok) {
          if (outcome.error.code === "llm_unavailable") {
            void queryClient.invalidateQueries({ queryKey: queryKeys.health });
          }
          if (STALE_TICKET_CODES.has(outcome.error.code)) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
            void queryClient.invalidateQueries({ queryKey: ["tickets"] });
            void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
          }
        }
        return outcome;
      } finally {
        if (controller.current === run) controller.current = null;
      }
    },
    [queryClient, sync],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: "reset" });
  }, []);

  return { state, start, reset, isRunning: state.running };
}
