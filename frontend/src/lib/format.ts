const timestampFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatTimestamp(iso: string): string {
  return timestampFormat.format(new Date(iso));
}
