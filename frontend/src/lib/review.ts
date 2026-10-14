import type { Category, Classified, Queue, Taxonomy, TriageRecord, Urgency } from "./types";

export type Route = { category: Category; urgency: Urgency; queue: Queue };
export type AuditChange = { field: keyof Route; ai: string; agent: string };

export const MANUAL_QUEUE: Queue = "Needs Manual Triage";

const ROUTE_FIELDS = ["category", "urgency", "queue"] as const;

export function buildAuditDiff(ai: Route, agent: Route): AuditChange[] {
  return ROUTE_FIELDS.filter((field) => ai[field] !== agent[field]).map((field) => ({
    field,
    ai: ai[field],
    agent: agent[field],
  }));
}

export function aiRoute(triage: TriageRecord): Route {
  return { category: triage.ai_category, urgency: triage.ai_urgency, queue: triage.ai_queue };
}

export function finalRoute(triage: TriageRecord): Route | null {
  if (!triage.final_category || !triage.final_urgency || !triage.final_queue) return null;
  return {
    category: triage.final_category,
    urgency: triage.final_urgency,
    queue: triage.final_queue,
  };
}

export function toClassified(triage: TriageRecord): Classified {
  return {
    ...aiRoute(triage),
    reason: triage.reason,
    confidence: triage.confidence,
    flags: triage.flags,
  };
}

export function approveBlockReason(taxonomy: Taxonomy, route: Route, draft: string): string | null {
  if (route.queue === MANUAL_QUEUE) return "Pick a real queue before approving.";
  const allowed = taxonomy.allowed_queues[route.category] ?? [];
  if (!allowed.includes(route.queue)) return `${route.queue} does not handle ${route.category} tickets.`;
  if (!draft.trim()) return "The reply draft is empty.";
  return null;
}
