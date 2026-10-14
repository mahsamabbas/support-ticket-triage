export type SseMessage = { event: string; data: string };

function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const message = parseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (message) onMessage(message);
        boundary = buffer.indexOf("\n\n");
      }
    },
  };
}

export async function readSse(
  response: Response,
  onMessage: (message: SseMessage) => void,
): Promise<void> {
  if (!response.body) throw new Error("The triage response has no body to stream.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createSseParser(onMessage);
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        return;
      }
      parser.push(value);
    }
  } finally {
    if (!finished) void reader.cancel().catch(() => undefined);
  }
}
