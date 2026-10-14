"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { queryKeys, useTicketCacheSync } from "@/lib/queries";
import {
  BUSY,
  CANCELLED,
  IDLE_TRIAGE,
  runTriageStream,
  staleQueriesFor,
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

type ActiveRun = { id: number; ticketId: string; controller: AbortController };

export function useTriageStream() {
  const [state, dispatch] = useReducer(triageReducer, IDLE_TRIAGE);
  const active = useRef<ActiveRun | null>(null);
  const lastRunId = useRef(0);
  const disposed = useRef(false);
  const queryClient = useQueryClient();
  const sync = useTicketCacheSync();

  const cancel = useCallback(() => {
    const run = active.current;
    if (!run) return;
    run.controller.abort();
    active.current = null;
    dispatch({ type: "cancel", runId: run.id });
    void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(run.ticketId) });
    void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
  }, [queryClient]);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      cancel();
    };
  }, [cancel]);

  const start = useCallback(
    async (ticketId: string): Promise<TriageOutcome> => {
      if (disposed.current) return CANCELLED;
      if (active.current) return BUSY;
      lastRunId.current += 1;
      const run: ActiveRun = { id: lastRunId.current, ticketId, controller: new AbortController() };
      active.current = run;
      const handle = (action: TriageAction) => {
        if (action.type === "done") sync(action.ticket);
        dispatch(action);
      };
      try {
        const outcome = await runTriageStream(ticketId, {
          runId: run.id,
          signal: run.controller.signal,
          dispatch: handle,
        });
        for (const queryKey of staleQueriesFor(ticketId, outcome)) {
          void queryClient.invalidateQueries({ queryKey });
        }
        return outcome;
      } finally {
        if (active.current === run) active.current = null;
      }
    },
    [queryClient, sync],
  );

  const reset = useCallback(() => {
    active.current?.controller.abort();
    active.current = null;
    dispatch({ type: "reset" });
  }, []);

  return { state, start, cancel, reset, isRunning: state.running };
}
