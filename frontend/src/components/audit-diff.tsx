import { ArrowRight } from "lucide-react";
import type { AuditChange } from "@/lib/review";

type Props = { changes: AuditChange[]; title: string };

export function AuditDiff({ changes, title }: Props) {
  if (changes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {changes.map((change) => (
          <li
            key={change.field}
            className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[11px]"
          >
            <span className="text-muted-foreground">{change.field}</span>
            <span className="line-through decoration-muted-foreground/60">AI: {change.ai}</span>
            <ArrowRight className="size-3" />
            <span>Agent: {change.agent}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
