import { describe, expect, it } from "vitest";
import { URGENCY_STYLES, confidenceBand } from "./urgency";

describe("confidenceBand", () => {
  it("is weak below the threshold", () => expect(confidenceBand(0.59, 0.6)).toBe("weak"));
  it("is fair from the threshold up to 0.8", () => expect(confidenceBand(0.6, 0.6)).toBe("fair"));
  it("is strong from 0.8", () => expect(confidenceBand(0.8, 0.6)).toBe("strong"));
});

describe("URGENCY_STYLES", () => {
  it("only pulses for critical", () => {
    expect(Object.entries(URGENCY_STYLES).filter(([, s]) => s.pulse).map(([k]) => k)).toEqual([
      "critical",
    ]);
  });
});
