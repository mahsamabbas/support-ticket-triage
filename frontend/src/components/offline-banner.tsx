"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useHealth } from "@/lib/queries";

export function OfflineBanner() {
  const { data, isError } = useHealth();
  if (!isError && (!data || data.status === "ok")) return null;

  let message: ReactNode;
  if (isError || !data) message = "QueueWise API is unreachable. Start the backend on port 8005.";
  else if (!data.ollama_reachable) {
    message = (
      <>
        Ollama is offline. Start it with <code className="font-mono">ollama serve</code>.
      </>
    );
  } else {
    message = (
      <>
        Model {data.model} is missing. Run <code className="font-mono">ollama pull {data.model}</code>.
      </>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-urgency-high/30 bg-urgency-high/10 px-4 py-2 text-sm text-urgency-high"
    >
      <AlertTriangle className="size-4" />
      <p>{message}</p>
    </div>
  );
}
