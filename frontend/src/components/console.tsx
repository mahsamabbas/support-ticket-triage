"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTriageStream } from "@/hooks/use-triage-stream";
import type { TicketFilters } from "@/lib/api";
import { useTicket, useTickets } from "@/lib/queries";
import { DecisionPanel } from "./decision-panel";
import { Inbox } from "./inbox";
import { NewTicketDialog } from "./new-ticket-dialog";
import { OfflineBanner } from "./offline-banner";
import { TicketDetail } from "./ticket-detail";
import { TopBar } from "./top-bar";

const SILENT_TRIAGE_ERRORS = new Set(["busy", "cancelled"]);

export function Console() {
  const [filters, setFilters] = useState<TicketFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const tickets = useTickets(filters);
  const list = tickets.data ?? [];
  const activeId = selectedId ?? list[0]?.id ?? null;
  const ticket = useTicket(activeId);
  const triage = useTriageStream();
  const stream = triage.state.ticketId === activeId ? triage.state : null;

  async function runTriage(id: string) {
    const outcome = await triage.start(id);
    if (outcome.ok) toast.success(`${outcome.ticket.id} → ${outcome.ticket.triage?.ai_queue}`);
    else if (!SILENT_TRIAGE_ERRORS.has(outcome.error.code)) toast.error(outcome.error.message);
  }

  return (
    <div className="control-grid flex h-dvh flex-col">
      <OfflineBanner />
      <TopBar filters={filters} onFiltersChange={setFilters} onNewTicket={() => setNewTicketOpen(true)} />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-3 pb-3 lg:grid-cols-[300px_minmax(0,1fr)_400px] lg:overflow-hidden">
        <Inbox
          tickets={list}
          isLoading={tickets.isLoading}
          selectedId={activeId}
          streamingId={triage.isRunning ? triage.state.ticketId : null}
          filters={filters}
          onFiltersChange={setFilters}
          onSelect={setSelectedId}
        />
        <TicketDetail
          ticket={ticket.data ?? null}
          isLoading={ticket.isLoading && activeId !== null}
          stream={stream}
          isRunning={triage.isRunning}
          onTriage={runTriage}
        />
        <DecisionPanel ticket={ticket.data ?? null} stream={stream} isRunning={triage.isRunning} />
      </main>
      <NewTicketDialog
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        onCreated={(created, triageNow) => {
          setSelectedId(created.id);
          if (triageNow) void runTriage(created.id);
        }}
      />
    </div>
  );
}
