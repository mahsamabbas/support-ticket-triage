import type {
  Health,
  Queue,
  ReviewRequest,
  Stats,
  Taxonomy,
  Ticket,
  TicketCreate,
  TicketStatus,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8005";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type ValidationItem = { loc: (string | number)[]; msg: string };

const NETWORK_ERROR_MESSAGE = "Can't reach the QueueWise API. Is the backend running on port 8005?";

function validationMessage(msg: string) {
  return msg.replace(/^Value error, /, "");
}

export async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `Request failed with status ${response.status}.`;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (Array.isArray(detail)) {
    const items = detail as ValidationItem[];
    const fields: Record<string, string> = {};
    let message = "Some fields are invalid.";
    for (const item of items) {
      const key = item.loc.slice(1).join(".");
      if (key) fields[key] = validationMessage(item.msg);
      else message = validationMessage(item.msg);
    }
    if (items.length === 1) message = validationMessage(items[0].msg);
    return new ApiError(response.status, "validation_error", message || fallback, fields);
  }
  if (typeof detail === "string" && detail) {
    return new ApiError(response.status, "http_error", detail);
  }
  if (detail && typeof detail === "object" && "code" in detail) {
    const { code, message } = detail as { code: string; message?: string };
    return new ApiError(response.status, code, message || fallback);
  }
  return new ApiError(response.status, "http_error", fallback);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "network_error", NETWORK_ERROR_MESSAGE);
  }
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

export type TicketFilters = { status?: TicketStatus; queue?: Queue };

function ticketPath(id: string, suffix = "") {
  return `/tickets/${encodeURIComponent(id)}${suffix}`;
}

export const api = {
  health: () => request<Health>("/health"),
  taxonomy: () => request<Taxonomy>("/taxonomy"),
  stats: () => request<Stats>("/stats"),
  tickets: (filters: TicketFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.queue) params.set("queue", filters.queue);
    const query = params.toString();
    return request<Ticket[]>(`/tickets${query ? `?${query}` : ""}`);
  },
  ticket: (id: string) => request<Ticket>(ticketPath(id)),
  createTicket: (payload: TicketCreate) =>
    request<Ticket>("/tickets", { method: "POST", body: JSON.stringify(payload) }),
  reviewTicket: (id: string, payload: ReviewRequest) =>
    request<Ticket>(ticketPath(id, "/review"), { method: "POST", body: JSON.stringify(payload) }),
  triageUrl: (id: string) => `${API_URL}${ticketPath(id, "/triage")}`,
};
