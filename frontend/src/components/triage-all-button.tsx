"use client";

import { ListChecks, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type BulkProgress = { done: number; total: number };

type Props = {
  progress: BulkProgress | null;
  disabled: boolean;
  onClick: () => void;
  onStop: () => void;
};

export function TriageAllButton({ progress, disabled, onClick, onStop }: Props) {
  return (
    <div className="flex items-center gap-2">
      {progress && (
        <div className="flex w-36 items-center gap-2 font-mono text-xs text-muted-foreground">
          <Progress
            value={(progress.done / progress.total) * 100}
            aria-label="Triage all progress"
            className="h-1.5"
          />
          <span className="tabular-nums" aria-live="polite">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={progress ? onStop : onClick}
        disabled={progress ? false : disabled}
        aria-label={progress ? "Stop triage all" : undefined}
      >
        {progress ? <Square className="size-4" /> : <ListChecks className="size-4" />}
        {progress ? "Stop" : "Triage all new"}
      </Button>
    </div>
  );
}
