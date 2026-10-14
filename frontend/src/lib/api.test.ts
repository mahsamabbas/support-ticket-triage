import { describe, expect, it } from "vitest";
import { toApiError } from "./api";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("toApiError", () => {
  it("maps FastAPI validation errors to field messages", async () => {
    const error = await toApiError(
      json(422, {
        detail: [{ loc: ["body", "subject"], msg: "String should have at least 3 characters" }],
      }),
    );
    expect(error.code).toBe("validation_error");
    expect(error.fields).toEqual({ subject: "String should have at least 3 characters" });
  });

  it("reads coded application errors", async () => {
    const error = await toApiError(
      json(409, { detail: { code: "invalid_state", message: "Ticket NG-1001 is approved." } }),
    );
    expect(error.status).toBe(409);
    expect(error.code).toBe("invalid_state");
    expect(error.message).toBe("Ticket NG-1001 is approved.");
  });

  it("falls back for non-JSON bodies", async () => {
    const error = await toApiError(new Response("Bad gateway", { status: 502 }));
    expect(error.code).toBe("http_error");
    expect(error.message).toContain("502");
  });
});
