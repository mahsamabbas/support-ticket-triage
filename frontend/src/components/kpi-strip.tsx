"use client";

import { formatPercent } from "@/lib/format";
import { useStats } from "@/lib/queries";

export function KpiStrip() {
  const { data } = useStats();
  const items = [
    { label: "New", value: data?.by_status["new"] },
    { label: "Triaged", value: data?.by_status["triaged"] },
    { label: "Approved", value: data?.by_status["approved"] },
    { label: "Rejected", value: data?.by_status["rejected"] },
    {
      label: "Avg conf",
      value: data?.avg_confidence == null ? undefined : formatPercent(data.avg_confidence),
    },
  ];
  return (
    <dl className="hidden items-center gap-6 border-l pl-6 md:flex">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
