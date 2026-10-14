"use client";

import { Check, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import type { StepState, StepView, TriageStreamState } from "@/hooks/use-triage-stream";
import { formatMs } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = StepView & { key: "classify" | "draft"; title: string; detail: string };

function resolveStep(live: StepView | undefined, savedMs: number | undefined): StepView {
  if (live && live.state !== "idle") return live;
  if (savedMs !== undefined) return { state: "done", ms: savedMs };
  return { state: "idle" };
}

export function TriagePipeline({ ticket, stream }: { ticket: Ticket; stream: TriageStreamState | null }) {
  const saved = ticket.triage;
  const live = stream?.ticketId === ticket.id ? stream : null;
  const steps: Step[] = [
    {
      key: "classify",
      title: "Classify",
      detail: "Category, urgency, queue and confidence as validated JSON",
      ...resolveStep(live?.classify, saved?.classify_ms),
    },
    {
      key: "draft",
      title: "Draft",
      detail: "Reply written from the routing decision, streamed live",
      ...resolveStep(live?.draft, saved?.draft_ms),
    },
  ];
  return (
    <div className="rounded-xl border bg-background/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Triage pipeline
        </h3>
        {saved && <span className="font-mono text-[11px] text-muted-foreground">{saved.model}</span>}
      </div>
      <ol aria-live="polite" className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <PipelineStep key={step.key} step={step} index={index + 1} />
        ))}
      </ol>
      {live?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {live.error.message}
        </p>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<StepState, string> = {
  idle: "not started",
  running: "running",
  done: "done",
  error: "failed",
};

function PipelineStep({ step, index }: { step: Step; index: number }) {
  const marker = {
    idle: <span>{index}</span>,
    running: <Loader2 className="size-3.5 motion-safe:animate-spin" />,
    done: <Check className="size-3.5" />,
    error: <X className="size-3.5" />,
  }[step.state];
  let timing = "";
  if (step.state === "running") timing = "running…";
  else if (step.ms !== undefined) timing = formatMs(step.ms);
  const status =
    step.state === "done" && step.ms !== undefined ? `done, ${formatMs(step.ms)}` : STATUS_TEXT[step.state];
  return (
    <li className="flex items-center gap-3">
      <span className="sr-only">
        {step.title}: {status}
      </span>
      <motion.span
        layout
        aria-hidden
        className={cn(
          "grid size-7 place-items-center rounded-full border font-mono text-xs",
          step.state === "idle" && "text-muted-foreground",
          step.state === "running" && "border-primary text-primary shadow-[0_0_16px_-2px_var(--signal)]",
          step.state === "done" && "border-primary/50 bg-primary/15 text-primary",
          step.state === "error" && "border-destructive/50 bg-destructive/15 text-destructive",
        )}
      >
        {marker}
      </motion.span>
      <div className="min-w-0 flex-1">
        <p aria-hidden className="text-sm font-medium">
          {step.title}
        </p>
        <p className="text-xs text-muted-foreground">{step.detail}</p>
      </div>
      <span aria-hidden className="font-mono text-xs tabular-nums text-muted-foreground">
        {timing}
      </span>
    </li>
  );
}
