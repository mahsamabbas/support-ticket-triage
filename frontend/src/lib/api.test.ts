import { afterEach, describe, expect, it, vi } from "vitest";
import { api, toApiError } from "./api";

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

  it("uses a model-level validation message instead of a field", async () => {
    const error = await toApiError(
      json(422, {
        detail: [
          {
            loc: ["body"],
            msg: "Value error, approve requires: final_category, final_urgency, final_queue",
          },
        ],
      }),
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe("validation_error");
    expect(error.message).toBe("approve requires: final_category, final_urgency, final_queue");
    expect(error.fields).not.toHaveProperty("body");
  });

  it("keys a field named body under fields.body", async () => {
    const error = await toApiError(
      json(422, {
        detail: [
          { loc: ["body", "body"], msg: "String should have at least 10 characters" },
          { loc: ["body", "subject"], msg: "String should have at least 3 characters" },
        ],
      }),
    );
    expect(error.status).toBe(422);
    expect(error.message).toBe("Some fields are invalid.");
    expect(error.fields).toEqual({
      body: "String should have at least 10 characters",
      subject: "String should have at least 3 characters",
    });
  });

  it("uses the only validation error as the message", async () => {
    const error = await toApiError(
      json(422, { detail: [{ loc: ["query", "status"], msg: "Input should be 'new'" }] }),
    );
    expect(error.message).toBe("Input should be 'new'");
    expect(error.fields).toEqual({ status: "Input should be 'new'" });
  });

  it("uses a plain string detail as the message", async () => {
    const error = await toApiError(json(404, { detail: "Not Found" }));
    expect(error.status).toBe(404);
    expect(error.code).toBe("http_error");
    expect(error.message).toBe("Not Found");
  });

  it("falls back to a generic message when a coded detail has none", async () => {
    const error = await toApiError(json(409, { detail: { code: "invalid_state" } }));
    expect(error.code).toBe("invalid_state");
    expect(error.message).toContain("409");
  });
});

describe("api requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a network_error ApiError when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(api.health()).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      code: "network_error",
      message: "Can't reach the QueueWise API. Is the backend running on port 8005?",
    });
  });

  it("sends Content-Type only when there is a body", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await api.health();
    await api.createTicket({ customer_name: "Ada", subject: "Hello", body: "Long enough body" });
    const [, getInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(getInit.headers).has("Content-Type")).toBe(false);
    expect(new Headers(postInit.headers).get("Content-Type")).toBe("application/json");
  });
});
