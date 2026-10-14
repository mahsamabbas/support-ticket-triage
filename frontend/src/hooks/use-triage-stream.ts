"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { useTicketCacheSync } from "@/lib/queries";
import {
  BUSY,
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

type ActiveRun = { id: number; controller: AbortController };

export function useTriageStream() {
  const [state, dispatch] = useReducer(triageReducer, IDLE_TRIAGE);
  const active = useRef<ActiveRun | null>(null);
  const lastRunId = useRef(0);
  const queryClient = useQueryClient();
  const sync = useTicketCacheSync();

  useEffect(
    () => () => {
      const run = active.current;
      if (!run) return;
      run.controller.abort();
      active.current = null;
      dispatch({ type: "cancel", runId: run.id });
    },
    [],
  );

  const start = useCallback(
    async (ticketId: string): Promise<TriageOutcome> => {
      if (active.current) return BUSY;
      lastRunId.current += 1;
      const run: ActiveRun = { id: lastRunId.current, controller: new AbortController() };
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

  return { state, start, reset, isRunning: state.running };
}
