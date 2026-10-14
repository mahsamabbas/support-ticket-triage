import { describe, expect, it, vi } from "vitest";
import { createSseParser, readSse, type SseMessage } from "./sse";

function collect() {
  const messages: SseMessage[] = [];
  const parser = createSseParser((message) => messages.push(message));
  return { messages, parser };
}

describe("createSseParser", () => {
  it("parses one complete event", () => {
    const { messages, parser } = collect();
    parser.push('event: step\ndata: {"name":"classify"}\n\n');
    expect(messages).toEqual([{ event: "step", data: '{"name":"classify"}' }]);
  });

  it("joins events split across chunks", () => {
    const { messages, parser } = collect();
    parser.push("event: draft_tok");
    parser.push('en\ndata: {"text":"Hi"}');
    expect(messages).toEqual([]);
    parser.push("\n\n");
    expect(messages).toEqual([{ event: "draft_token", data: '{"text":"Hi"}' }]);
  });

  it("handles several events in one chunk and CRLF line endings", () => {
    const { messages, parser } = collect();
    parser.push("event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n");
    expect(messages.map((m) => m.event)).toEqual(["a", "b"]);
  });

  it("ignores blocks without data", () => {
    const { messages, parser } = collect();
    parser.push(": keep-alive\n\n");
    expect(messages).toEqual([]);
  });
});

describe("readSse", () => {
  it("cancels the body stream when the message handler throws", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: a\ndata: 1\n\n"));
      },
      cancel,
    });
    const failure = new Error("handler failed");
    await expect(
      readSse(new Response(body), () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
});
