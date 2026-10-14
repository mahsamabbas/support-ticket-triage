"use client";

import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type BulkProgress = { done: number; total: number };

type Props = { progress: BulkProgress | null; disabled: boolean; onClick: () => void };

export function TriageAllButton({ progress, disabled, onClick }: Props) {
  if (progress) {
    return (
      <div className="flex w-48 items-center gap-2 font-mono text-xs text-muted-foreground">
        <Progress
          value={(progress.done / progress.total) * 100}
          aria-label="Triage all progress"
          className="h-1.5"
        />
        <span className="tabular-nums">
          {progress.done}/{progress.total}
        </span>
      </div>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={disabled}>
      <ListChecks className="size-4" />
      Triage all new
    </Button>
  );
}
