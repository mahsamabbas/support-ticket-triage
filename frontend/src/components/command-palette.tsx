"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useModShortcut } from "@/hooks/use-hotkeys";
import type { Queue, Ticket } from "@/lib/types";

const SHORTCUTS: [string, string][] = [
  ["J / K", "Next / previous ticket"],
  ["T", "Run triage"],
  ["A", "Approve draft"],
  ["R", "Reject"],
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
  queues: Queue[];
  onSelectTicket: (id: string) => void;
  onFilterQueue: (queue: Queue | undefined) => void;
  onNewTicket: () => void;
  onTriageAll: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
  tickets,
  queues,
  onSelectTicket,
  onFilterQueue,
  onNewTicket,
  onTriageAll,
}: Props) {
  const paletteShortcut = useModShortcut("K");
  const shortcuts: [string, string][] = [...SHORTCUTS, [paletteShortcut, "Toggle this palette"]];
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Jump to a ticket or run an action"
    >
      <CommandInput placeholder="Search tickets or actions…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(onNewTicket)}>New ticket</CommandItem>
          <CommandItem onSelect={() => run(onTriageAll)}>Triage all new tickets</CommandItem>
          <CommandItem onSelect={() => run(() => onFilterQueue(undefined))}>Show all queues</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Queues">
          {queues.map((queue) => (
            <CommandItem key={queue} onSelect={() => run(() => onFilterQueue(queue))}>
              Filter: {queue}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Tickets">
          {tickets.map((ticket) => (
            <CommandItem
              key={ticket.id}
              value={`${ticket.id} ${ticket.subject} ${ticket.customer_name}`}
              onSelect={() => run(() => onSelectTicket(ticket.id))}
            >
              <span className="font-mono text-xs text-muted-foreground">{ticket.id}</span>
              <span className="truncate">{ticket.subject}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Shortcuts">
          {shortcuts.map(([keys, label]) => (
            <CommandItem key={label} disabled>
              {label}
              <CommandShortcut>{keys}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
