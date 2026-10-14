"use client";

import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TriageStreamState } from "@/hooks/use-triage-stream";
import { formatTimestamp } from "@/lib/format";
import { aiRoute, buildAuditDiff, finalRoute } from "@/lib/review";
import type { Ticket } from "@/lib/types";
import { AuditDiff } from "./audit-diff";
import { StatusChip } from "./status-chip";
import { TriagePipeline } from "./triage-pipeline";

type Props = {
  ticket: Ticket | null;
  isLoading: boolean;
  stream: TriageStreamState | null;
  isRunning: boolean;
  onTriage: (id: string) => void;
};

export function TicketDetail({ ticket, isLoading, stream, isRunning, onTriage }: Props) {
  if (isLoading) {
    return (
      <section aria-label="Loading ticket" aria-busy="true" className="glass flex flex-col gap-4 p-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }
  if (!ticket) {
    return (
      <section className="glass grid place-items-center p-6 text-sm text-muted-foreground">
        Select a ticket to start.
      </section>
    );
  }

  const live = stream?.ticketId === ticket.id ? stream : null;
  const canTriage = ticket.status === "new" || ticket.status === "triaged";
  const reviewed = ticket.triage ? finalRoute(ticket.triage) : null;
  const overrides = ticket.triage && reviewed ? buildAuditDiff(aiRoute(ticket.triage), reviewed) : [];

  return (
    <section aria-label="Ticket" className="glass flex min-h-0 flex-col overflow-y-auto">
      <header className="flex items-start gap-3 border-b px-6 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>{ticket.id}</span>
            <span aria-hidden>·</span>
            <span>{ticket.customer_name}</span>
            <span aria-hidden>·</span>
            <time dateTime={ticket.created_at}>{formatTimestamp(ticket.created_at)}</time>
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-balance">{ticket.subject}</h1>
        </div>
        <StatusChip status={ticket.status} streaming={isRunning && live !== null} />
      </header>
      <div className="flex flex-col gap-6 px-6 py-5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{ticket.body}</p>
        <TriagePipeline ticket={ticket} stream={live} />
        {canTriage && (
          <Button
            onClick={() => onTriage(ticket.id)}
            disabled={isRunning}
            variant={ticket.status === "new" ? "default" : "secondary"}
            className="self-start"
          >
            {ticket.status === "new" ? <Sparkles className="size-4" /> : <RotateCcw className="size-4" />}
            {ticket.status === "new" ? "Run triage" : "Re-run triage"}
          </Button>
        )}
        <AuditDiff changes={overrides} />
      </div>
    </section>
  );
}
