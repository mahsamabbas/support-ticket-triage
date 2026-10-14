import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/lib/types";

const STATUS_STYLES: Record<TicketStatus, string> = {
  new: "bg-foreground/10 text-foreground",
  triaged: "text-primary ring-1 ring-inset ring-primary/40",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
};

type Props = { status: TicketStatus; streaming?: boolean; className?: string };

export function StatusChip({ status, streaming = false, className }: Props) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        streaming ? "bg-primary/20 text-primary motion-safe:animate-pulse" : STATUS_STYLES[status],
        className,
      )}
    >
      {streaming ? "triaging" : status}
    </span>
  );
}
