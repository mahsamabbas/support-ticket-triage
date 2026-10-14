"use client";

import { Plus, Radar } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { TicketFilters } from "@/lib/api";
import { KpiStrip } from "./kpi-strip";
import { QueueLanes } from "./queue-lanes";

type Props = {
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  onNewTicket: () => void;
  actions?: ReactNode;
};

export function TopBar({ filters, onFiltersChange, onNewTicket, actions }: Props) {
  return (
    <header className="flex flex-col gap-3 px-4 pt-4 pb-3">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Radar className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">QueueWise</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              NovaGear · Support Ops
            </p>
          </div>
        </div>
        <KpiStrip />
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <Button size="sm" onClick={onNewTicket}>
            <Plus className="size-4" />
            New ticket
          </Button>
        </div>
      </div>
      <QueueLanes
        activeQueue={filters.queue}
        onSelect={(queue) =>
          onFiltersChange({ ...filters, queue: filters.queue === queue ? undefined : queue })
        }
      />
    </header>
  );
}
