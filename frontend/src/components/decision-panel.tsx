"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ShieldAlert, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { TriageStreamState } from "@/hooks/use-triage-stream";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { queryKeys, useReviewTicket, useTaxonomy } from "@/lib/queries";
import {
  DRAFT_MAX,
  MANUAL_QUEUE,
  aiRoute,
  approveBlockReason,
  buildAuditDiff,
  finalRoute,
  toClassified,
  type Route,
} from "@/lib/review";
import type { Classified, Flag, Taxonomy, Ticket, TicketStatus, TriageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AuditDiff } from "./audit-diff";
import { ConfidenceGauge } from "./confidence-gauge";

const FLAG_COPY: Record<Flag, string> = {
  low_confidence: "Low confidence",
  inconsistent_route: "Category and queue disagree",
  ai_output_invalid: "Model output failed validation",
};

const SECTION_LABEL = "font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground";

const BLOCK_REASON_ID = "approve-block-reason";

type Props = { ticket: Ticket | null; stream: TriageStreamState | null; isRunning: boolean };

export function DecisionPanel({ ticket, stream, isRunning }: Props) {
  const { data: taxonomy } = useTaxonomy();

  let body: ReactNode;
  if (!ticket || !taxonomy) {
    body = <EmptyState>Select a ticket to see the AI suggestion.</EmptyState>;
  } else if (stream && isRunning) {
    body = <StreamingView stream={stream} threshold={taxonomy.confidence_threshold} />;
  } else if (!ticket.triage) {
    body = (
      <EmptyState>
        {stream?.error
          ? "Triage failed. Fix the problem shown in the pipeline and run it again."
          : "Run triage to get a category, urgency, queue and reply draft."}
      </EmptyState>
    );
  } else {
    body = (
      <ReviewForm
        key={`${ticket.id}:${ticket.triage.triaged_at}:${ticket.status}`}
        ticket={ticket}
        triage={ticket.triage}
        taxonomy={taxonomy}
      />
    );
  }

  return (
    <aside aria-label="Decision" className="glass flex min-h-0 flex-col overflow-y-auto">
      <header className="border-b px-5 py-4">
        <h2 className={SECTION_LABEL}>Decision</h2>
      </header>
      {body}
    </aside>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function SuggestionSummary({ result, threshold }: { result: Classified; threshold: number }) {
  return (
    <div className="flex flex-col gap-4">
      <ConfidenceGauge value={result.confidence} threshold={threshold} />
      {result.queue === MANUAL_QUEUE && (
        <div className="flex items-start gap-2 rounded-lg border border-urgency-high/30 bg-urgency-high/10 p-3 text-sm text-urgency-high">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Sent to manual triage</p>
            <ul className="mt-1 text-xs">
              {result.flags.map((flag) => (
                <li key={flag}>{FLAG_COPY[flag]}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div>
        <p className={SECTION_LABEL}>Why this queue</p>
        <p className="mt-1 text-sm leading-relaxed">{result.reason}</p>
      </div>
    </div>
  );
}

function StreamingView({ stream, threshold }: { stream: TriageStreamState; threshold: number }) {
  return (
    <div className="flex flex-col gap-5 p-5">
      {stream.classified ? (
        <SuggestionSummary result={stream.classified} threshold={threshold} />
      ) : (
        <div className="flex items-center gap-4">
          <Skeleton className="size-28 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className={SECTION_LABEL}>Reply draft</p>
        <div
          className={cn(
            "min-h-48 whitespace-pre-wrap rounded-lg border bg-background/50 p-3 text-sm leading-relaxed",
            stream.draft.state === "running" && "stream-caret",
          )}
        >
          {stream.draftText || <span className="text-muted-foreground">Waiting for the classifier…</span>}
        </div>
      </div>
    </div>
  );
}

type ReviewFormProps = { ticket: Ticket; triage: TriageRecord; taxonomy: Taxonomy };

function ReviewForm({ ticket, triage, taxonomy }: ReviewFormProps) {
  const locked = ticket.status !== "triaged";
  const ai = aiRoute(triage);
  const [route, setRoute] = useState<Route>(() => finalRoute(triage) ?? ai);
  const [draft, setDraft] = useState(() => triage.final_draft ?? triage.ai_draft);
  const review = useReviewTicket();
  const queryClient = useQueryClient();
  const changes = buildAuditDiff(ai, route);
  const blockReason = approveBlockReason(taxonomy, route, draft);
  const allowedQueues = taxonomy.allowed_queues[route.category] ?? [];

  function submit(action: "approve" | "reject") {
    review.mutate(
      {
        id: ticket.id,
        payload: {
          action,
          final_category: route.category,
          final_urgency: route.urgency,
          final_queue: route.queue,
          final_draft: draft,
        },
      },
      {
        onSuccess: (saved) =>
          toast.success(action === "approve" ? `${saved.id} approved for ${route.queue}` : `${saved.id} rejected`),
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : "Review failed.");
          if (error instanceof ApiError && error.status === 409) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
            void queryClient.invalidateQueries({ queryKey: ["tickets"] });
            void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
          }
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <SuggestionSummary result={toClassified(triage)} threshold={taxonomy.confidence_threshold} />
      <div className="grid gap-3">
        <RouteSelect
          label="Category"
          value={route.category}
          options={taxonomy.categories}
          disabled={locked}
          onChange={(category) => setRoute({ ...route, category })}
        />
        <RouteSelect
          label="Urgency"
          value={route.urgency}
          options={taxonomy.urgencies}
          disabled={locked}
          onChange={(urgency) => setRoute({ ...route, urgency })}
        />
        <RouteSelect
          label="Queue"
          value={route.queue}
          options={taxonomy.queues}
          disabled={locked}
          isDimmed={(queue) => !allowedQueues.includes(queue)}
          onChange={(queue) => setRoute({ ...route, queue })}
        />
      </div>
      <AuditDiff changes={changes} title={locked ? "Agent overrides" : "Your changes"} />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="reply-draft" className={SECTION_LABEL}>
            Reply draft
          </Label>
          {!locked && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {draft.length}/{DRAFT_MAX}
            </span>
          )}
        </div>
        <Textarea
          id="reply-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          readOnly={locked}
          maxLength={DRAFT_MAX}
          rows={10}
          className="resize-none bg-background/50 text-sm leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">{draftNote(ticket.status, route.queue)}</p>
      </div>
      {locked ? (
        <LockedNotice status={ticket.status} reviewedAt={triage.reviewed_at ?? null} />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" data-action="reject" disabled={review.isPending} onClick={() => submit("reject")}>
              <X className="size-4" />
              Reject
            </Button>
            <Button
              className="flex-1"
              data-action="approve"
              disabled={review.isPending || blockReason !== null}
              aria-describedby={blockReason ? BLOCK_REASON_ID : undefined}
              onClick={() => submit("approve")}
            >
              <Check className="size-4" />
              Approve draft
            </Button>
          </div>
          <p id={BLOCK_REASON_ID} aria-live="polite" className="min-h-4 text-xs text-urgency-high">
            {blockReason}
          </p>
        </div>
      )}
    </div>
  );
}

type RouteSelectProps<T extends string> = {
  label: string;
  value: T;
  options: readonly T[];
  disabled: boolean;
  onChange: (value: T) => void;
  isDimmed?: (value: T) => boolean;
};

function RouteSelect<T extends string>({ label, value, options, disabled, onChange, isDimmed }: RouteSelectProps<T>) {
  const id = `route-${label.toLowerCase()}`;
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3">
      <Label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full bg-background/50 capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const dimmed = isDimmed?.(option) ?? false;
            return (
              <SelectItem key={option} value={option} className={cn("capitalize", dimmed && "opacity-50")}>
                {option}
                {dimmed && <span className="sr-only"> (not handled for this category)</span>}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function draftNote(status: TicketStatus, queue: string): string {
  if (status === "approved") return `Approved for the ${queue} queue. Nothing was sent to the customer.`;
  if (status === "rejected") return "Rejected. The AI decision was not used.";
  if (queue === MANUAL_QUEUE) return "Nothing is sent. Pick a real queue to approve this draft.";
  return `Nothing is sent. Approving records this draft for the ${queue} queue.`;
}

function LockedNotice({ status, reviewedAt }: { status: TicketStatus; reviewedAt: string | null }) {
  const approved = status === "approved";
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        approved ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {approved ? "Approved" : "Rejected"}
      {reviewedAt ? ` · ${formatTimestamp(reviewedAt)}` : ""}. This ticket is read-only.
    </div>
  );
}
