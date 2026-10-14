import { describe, expect, it } from "vitest";
import { DRAFT_MAX, approveBlockReason, buildAuditDiff, finalRoute, type Route } from "./review";
import type { Taxonomy, TriageRecord } from "./types";

const taxonomy: Taxonomy = {
  categories: ["billing", "technical", "account", "shipping", "general"],
  urgencies: ["low", "medium", "high", "critical"],
  queues: [
    "Billing Team",
    "Tech Support",
    "Account Security",
    "Logistics",
    "Customer Care",
    "Needs Manual Triage",
  ],
  routable_queues: ["Billing Team", "Tech Support", "Account Security", "Logistics", "Customer Care"],
  allowed_queues: {
    billing: ["Billing Team", "Customer Care"],
    technical: ["Tech Support"],
    account: ["Account Security", "Tech Support"],
    shipping: ["Logistics", "Customer Care"],
    general: ["Customer Care"],
  },
  confidence_threshold: 0.6,
};

const ai: Route = { category: "technical", urgency: "high", queue: "Tech Support" };

describe("buildAuditDiff", () => {
  it("is empty when nothing changed", () => expect(buildAuditDiff(ai, ai)).toEqual([]));
  it("lists each changed field", () => {
    expect(buildAuditDiff(ai, { ...ai, category: "billing", queue: "Billing Team" })).toEqual([
      { field: "category", ai: "technical", agent: "billing" },
      { field: "queue", ai: "Tech Support", agent: "Billing Team" },
    ]);
  });
});

describe("approveBlockReason", () => {
  it("allows a valid route with a draft", () => {
    expect(approveBlockReason(taxonomy, ai, "Hello")).toBeNull();
  });
  it("blocks manual triage", () => {
    expect(approveBlockReason(taxonomy, { ...ai, queue: "Needs Manual Triage" }, "Hi")).toMatch(
      /real queue/,
    );
  });
  it("blocks a queue that does not serve the category", () => {
    expect(approveBlockReason(taxonomy, { ...ai, queue: "Logistics" }, "Hi")).toBe(
      "Logistics does not handle technical tickets.",
    );
  });
  it("blocks an empty draft", () => {
    expect(approveBlockReason(taxonomy, ai, "   ")).toMatch(/empty/);
  });
  it("blocks a draft over the backend cap but allows exactly the cap", () => {
    expect(approveBlockReason(taxonomy, ai, "a".repeat(DRAFT_MAX + 1))).toBe(
      "The reply draft is over 4000 characters.",
    );
    expect(approveBlockReason(taxonomy, ai, ` ${"a".repeat(DRAFT_MAX)} `)).toBeNull();
  });
});

describe("finalRoute", () => {
  it("is null before review", () => {
    const triage = { final_category: null, final_urgency: null, final_queue: null } as TriageRecord;
    expect(finalRoute(triage)).toBeNull();
  });
});
