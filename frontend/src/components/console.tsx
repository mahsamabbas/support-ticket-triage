"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHotkeys, useModShortcut } from "@/hooks/use-hotkeys";
import { useTriageStream, type TriageOutcome } from "@/hooks/use-triage-stream";
import { ApiError, api, type TicketFilters } from "@/lib/api";
import { queryKeys, useTaxonomy, useTicket, useTickets } from "@/lib/queries";
import { CommandPalette } from "./command-palette";
import { DecisionPanel } from "./decision-panel";
import { Inbox } from "./inbox";
import { NewTicketDialog } from "./new-ticket-dialog";
import { OfflineBanner } from "./offline-banner";
import { TicketDetail } from "./ticket-detail";
import { TopBar } from "./top-bar";
import { TriageAllButton, type BulkProgress } from "./triage-all-button";

const SILENT_TRIAGE_ERRORS = new Set(["busy", "cancelled"]);
const BULK_STOP_ERRORS = new Set(["busy", "cancelled", "llm_unavailable"]);
const NEW_TICKETS: TicketFilters = { status: "new" };

function clickAction(action: "approve" | "reject") {
  document.querySelector<HTMLButtonElement>(`[data-action="${action}"]:not(:disabled)`)?.click();
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function Console() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<TicketFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  const bulkRunning = useRef(false);
  const paletteShortcut = useModShortcut("K");
  const tickets = useTickets(filters);
  const allTickets = useTickets({});
  const taxonomy = useTaxonomy();
  const list = tickets.data ?? [];
  if (selectedId === null && list[0]) setSelectedId(list[0].id);
  const activeId = selectedId ?? list[0]?.id ?? null;
  const ticket = useTicket(activeId);
  const triage = useTriageStream();
  const stream = triage.state.ticketId === activeId ? triage.state : null;

  async function runTriage(id: string, { quiet = false } = {}): Promise<TriageOutcome> {
    setSelectedId(id);
    const outcome = await triage.start(id);
    if (quiet) return outcome;
    if (outcome.ok) {
      const queue = outcome.ticket.triage?.ai_queue;
      toast.success(queue ? `${outcome.ticket.id} → ${queue}` : `${outcome.ticket.id} triaged`);
    } else if (!SILENT_TRIAGE_ERRORS.has(outcome.error.code)) {
      toast.error(outcome.error.message);
    }
    return outcome;
  }

  async function triageCreated(id: string) {
    const outcome = await runTriage(id);
    if (!outcome.ok && outcome.error.code === "busy") {
      toast.info(`${id} created. Another triage is running, run this one when it finishes.`);
    }
  }

  async function triageAllNew() {
    if (bulkRunning.current || triage.isRunning) return;
    bulkRunning.current = true;
    try {
      const pending = await queryClient.fetchQuery({
        queryKey: queryKeys.tickets(NEW_TICKETS),
        queryFn: () => api.tickets(NEW_TICKETS),
        staleTime: 0,
      });
      const total = pending.length;
      if (total === 0) {
        toast.info("No new tickets to triage.");
        return;
      }
      setBulk({ done: 0, total });
      let triaged = 0;
      let failed = 0;
      let stoppedBy: string | null = null;
      for (const [index, item] of pending.entries()) {
        const outcome = await runTriage(item.id, { quiet: true });
        setBulk({ done: index + 1, total });
        if (outcome.ok) {
          triaged += 1;
        } else if (BULK_STOP_ERRORS.has(outcome.error.code)) {
          stoppedBy = outcome.error.code;
          break;
        } else {
          failed += 1;
        }
      }
      if (stoppedBy === "cancelled") return;
      if (stoppedBy === "llm_unavailable") {
        toast.warning(`Stopped: the model is unavailable. Triaged ${triaged} of ${total}.`);
      } else if (stoppedBy === "busy") {
        toast.info(`Stopped: another triage is running. Triaged ${triaged} of ${total}.`);
      } else if (failed === 0) {
        toast.success(`Triaged ${plural(total, "ticket")}.`);
      } else {
        toast.warning(`${failed} of ${plural(total, "ticket")} failed to triage.`);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load new tickets.");
    } finally {
      bulkRunning.current = false;
      setBulk(null);
    }
  }

  function selectRelative(delta: number) {
    if (list.length === 0) return;
    const index = list.findIndex((item) => item.id === activeId);
    const next = list[Math.min(list.length - 1, Math.max(0, index + delta))];
    setSelectedId(next.id);
    document.querySelector(`[data-ticket-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  useHotkeys(
    {
      j: () => selectRelative(1),
      k: () => selectRelative(-1),
      t: () => {
        const status = ticket.data?.status;
        if (activeId && (status === "new" || status === "triaged")) void runTriage(activeId);
      },
      a: () => clickAction("approve"),
      r: () => clickAction("reject"),
      "mod+k": () => {
        if (!newTicketOpen) setPaletteOpen((open) => !open);
      },
    },
    { repeatable: ["j", "k"] },
  );

  return (
    <div className="control-grid flex h-dvh flex-col">
      <OfflineBanner />
      <TopBar
        filters={filters}
        onFiltersChange={setFilters}
        onNewTicket={() => setNewTicketOpen(true)}
        actions={
          <>
            <TriageAllButton
              progress={bulk}
              disabled={triage.isRunning}
              onClick={() => void triageAllNew()}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              <Search className="size-4" />
              <kbd className="font-mono text-xs text-muted-foreground">{paletteShortcut}</kbd>
            </Button>
          </>
        }
      />
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
          if (triageNow) void triageCreated(created.id);
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        tickets={allTickets.data ?? []}
        queues={taxonomy.data?.queues ?? []}
        onSelectTicket={setSelectedId}
        onFilterQueue={(queue) => setFilters((current) => ({ ...current, queue }))}
        onNewTicket={() => setNewTicketOpen(true)}
        onTriageAll={() => void triageAllNew()}
      />
    </div>
  );
}
