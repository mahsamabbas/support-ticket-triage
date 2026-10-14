import { describe, expect, it } from "vitest";
import { formatMs, formatPercent } from "./format";

describe("format helpers", () => {
  it("formats milliseconds", () => {
    expect(formatMs(840)).toBe("840ms");
    expect(formatMs(3240)).toBe("3.2s");
  });
  it("formats percentages", () => expect(formatPercent(0.916)).toBe("92%"));
});
