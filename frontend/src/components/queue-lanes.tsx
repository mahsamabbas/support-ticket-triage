"use client";

import { useStats, useTaxonomy } from "@/lib/queries";
import { MANUAL_QUEUE } from "@/lib/review";
import type { Queue } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = { activeQueue?: Queue; onSelect: (queue: Queue) => void };

export function QueueLanes({ activeQueue, onSelect }: Props) {
  const { data: taxonomy } = useTaxonomy();
  const { data: stats } = useStats();
  if (!taxonomy) return <div className="h-8" />;
  return (
    <nav aria-label="Queues" className="flex gap-2 overflow-x-auto">
      {taxonomy.queues.map((queue) => {
        const count = stats?.open_by_queue[queue] ?? 0;
        const active = activeQueue === queue;
        const needsAttention = queue === MANUAL_QUEUE && count > 0 && !active;
        return (
          <button
            key={queue}
            type="button"
            onClick={() => onSelect(queue)}
            aria-pressed={active}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
              active
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "bg-card/60 text-muted-foreground hover:text-foreground",
              needsAttention && "border-urgency-high/40 text-urgency-high",
            )}
          >
            <span className="font-medium">{queue}</span>
            <span
              className={cn(
                "rounded-full px-1.5 font-mono tabular-nums",
                count > 0 ? "bg-foreground/10 text-foreground" : "text-muted-foreground/60",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
