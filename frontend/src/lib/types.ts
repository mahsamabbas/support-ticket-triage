import type { components } from "./api-types";

type Schemas = components["schemas"];

export type Ticket = Schemas["Ticket"];
export type TriageRecord = Schemas["TriageRecord"];
export type TicketCreate = Schemas["TicketCreate"];
export type ReviewRequest = Schemas["ReviewRequest"];
export type Taxonomy = Schemas["TaxonomyOut"];
export type Stats = Schemas["StatsOut"];
export type Health = Schemas["HealthOut"];
export type Category = Schemas["Category"];
export type Urgency = Schemas["Urgency"];
export type Queue = Schemas["Queue"];
export type Flag = Schemas["Flag"];
export type TicketStatus = Schemas["TicketStatus"];

export type Classified = {
  category: Category;
  urgency: Urgency;
  queue: Queue;
  reason: string;
  confidence: number;
  flags: Flag[];
};
