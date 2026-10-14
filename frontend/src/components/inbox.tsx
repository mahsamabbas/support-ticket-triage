"use client";

import { motion } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { TicketFilters } from "@/lib/api";
import type { Ticket, TicketStatus } from "@/lib/types";
import { URGENCY_STYLES } from "@/lib/urgency";
import { cn } from "@/lib/utils";
import { StatusChip } from "./status-chip";

const STATUS_TABS: { label: string; value?: TicketStatus }[] = [
  { label: "All" },
  { label: "New", value: "new" },
  { label: "Triaged", value: "triaged" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

type InboxProps = {
  tickets: Ticket[];
  isLoading: boolean;
  selectedId: string | null;
  streamingId: string | null;
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  onSelect: (id: string) => void;
};

export function Inbox({
  tickets,
  isLoading,
  selectedId,
  streamingId,
  filters,
  onFiltersChange,
  onSelect,
}: InboxProps) {
  return (
    <section aria-label="Inbox" className="glass flex min-h-0 flex-col">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Inbox</h2>
        <span className="font-mono text-xs text-muted-foreground">{tickets.length}</span>
      </header>
      <div role="group" aria-label="Status filter" className="flex gap-1 px-3 pb-3">
        {STATUS_TABS.map((tab) => {
          const active = filters.status === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={active}
              onClick={() => onFiltersChange({ ...filters, status: tab.value })}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul aria-busy={isLoading || undefined} className="flex flex-col gap-1 px-2 pb-2">
          {isLoading &&
            Array.from({ length: 6 }, (_, index) => (
              <li key={index}>
                <Skeleton className="h-16 w-full rounded-lg" />
              </li>
            ))}
          {!isLoading && tickets.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-muted-foreground">
              No tickets match these filters.
            </li>
          )}
          {tickets.map((ticket) => (
            <InboxItem
              key={ticket.id}
              ticket={ticket}
              selected={ticket.id === selectedId}
              streaming={ticket.id === streamingId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </ScrollArea>
    </section>
  );
}

type InboxItemProps = {
  ticket: Ticket;
  selected: boolean;
  streaming: boolean;
  onSelect: (id: string) => void;
};

function InboxItem({ ticket, selected, streaming, onSelect }: InboxItemProps) {
  const urgency = ticket.triage ? (ticket.triage.final_urgency ?? ticket.triage.ai_urgency) : null;
  const style = urgency ? URGENCY_STYLES[urgency] : null;
  return (
    <li>
      <motion.button
        layout
        type="button"
        data-ticket-id={ticket.id}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(ticket.id)}
        className={cn(
          "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
          selected ? "bg-accent ring-1 ring-primary/40" : "hover:bg-accent/60",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              style ? style.dot : "bg-muted-foreground/30",
              style?.pulse && "motion-safe:pulse-critical",
            )}
          />
          <span className="font-mono text-[11px] text-muted-foreground">{ticket.id}</span>
          <StatusChip status={ticket.status} streaming={streaming} className="ml-auto" />
        </div>
        <p className="line-clamp-1 text-sm font-medium">{ticket.subject}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {ticket.customer_name}
          {style ? ` · ${style.label}` : ""}
        </p>
      </motion.button>
    </li>
  );
}
