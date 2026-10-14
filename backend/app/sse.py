import json
from collections.abc import AsyncIterator
from typing import Any

from app.services.triage import TriageEvent


def format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def sse_stream(events: AsyncIterator[TriageEvent]) -> AsyncIterator[str]:
    async for item in events:
        yield format_sse(item.event, item.data)
