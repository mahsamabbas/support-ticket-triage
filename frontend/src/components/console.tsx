"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHotkeys, useModShortcut } from "@/hooks/use-hotkeys";
import { useTriageStream, type TriageOutcome } from "@/hooks/use-triage-stream";
import { ApiError, api, type TicketFilters } from "@/lib/api";
import { bulkSummary, runBulkTriage, shouldFollow } from "@/lib/bulk-triage";
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
const NEW_TICKETS: TicketFilters = { status: "new" };

function clickAction(action: "approve" | "reject") {
  document.querySelector<HTMLButtonElement>(`[data-action="${action}"]:not(:disabled)`)?.click();
}

function ticketRow(id: string) {
  return document.querySelector(`[data-ticket-id="${id}"]`);
}

export function Console() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<TicketFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  const bulkRunning = useRef(false);
  const stopRequested = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const pendingReveal = useRef<string | null>(null);
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

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const id = pendingReveal.current;
    if (!id) return;
    if (id !== selectedId) {
      pendingReveal.current = null;
      return;
    }
    const row = ticketRow(id);
    if (!row) return;
    row.scrollIntoView({ block: "nearest" });
    pendingReveal.current = null;
  }, [tickets.data, selectedId]);

  function revealTicket(id: string) {
    selectedRef.current = id;
    setSelectedId(id);
    const row = ticketRow(id);
    row?.scrollIntoView({ block: "nearest" });
    pendingReveal.current = row ? null : id;
  }

  async function runTriage(id: string): Promise<TriageOutcome> {
    setSelectedId(id);
    const outcome = await triage.start(id);
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

  async function loadNewTickets() {
    try {
      return await queryClient.fetchQuery({
        queryKey: queryKeys.tickets(NEW_TICKETS),
        queryFn: () => api.tickets(NEW_TICKETS),
        staleTime: 0,
      });
    } catch (error) {
      toast.error("Could not load new tickets.", {
        description: error instanceof ApiError ? error.message : undefined,
      });
      return null;
    }
  }

  async function triageAllNew() {
    if (bulkRunning.current || triage.isRunning) {
      toast.info("A triage is already running.");
      return;
    }
    bulkRunning.current = true;
    stopRequested.current = false;
    try {
      const pending = await loadNewTickets();
      if (!pending) return;
      if (pending.length === 0) {
        toast.info("No new tickets to triage.");
        return;
      }
      const total = pending.length;
      setBulk({ done: 0, total });
      let lastAutoId = selectedRef.current;
      const result = await runBulkTriage(
        pending.map((item) => item.id),
        {
          start: triage.start,
          stopRequested: () => stopRequested.current,
          beforeEach: (id) => {
            if (!shouldFollow(selectedRef.current, lastAutoId)) return;
            lastAutoId = id;
            revealTicket(id);
          },
          onProgress: (done) => setBulk({ done, total }),
        },
      );
      const summary = bulkSummary(result);
      if (summary) toast[summary.kind](summary.message);
    } catch (error) {
      console.error(error);
      toast.error("Triage all stopped unexpectedly.");
    } finally {
      bulkRunning.current = false;
      stopRequested.current = false;
      setBulk(null);
    }
  }

  function stopBulk() {
    stopRequested.current = true;
    triage.cancel();
  }

  function selectFromPalette(id: string) {
    if (!list.some((item) => item.id === id)) setFilters({});
    revealTicket(id);
  }

  function selectRelative(delta: number) {
    if (list.length === 0) return;
    const index = list.findIndex((item) => item.id === activeId);
    const next = list[Math.min(list.length - 1, Math.max(0, index + delta))];
    revealTicket(next.id);
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
              onStop={stopBulk}
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
        onSelectTicket={selectFromPalette}
        onFilterQueue={(queue) => setFilters((current) => ({ ...current, queue }))}
        onNewTicket={() => setNewTicketOpen(true)}
        onTriageAll={() => void triageAllNew()}
      />
    </div>
  );
}
