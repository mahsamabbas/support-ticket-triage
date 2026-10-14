import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from app.services.triage import TriageEvent

logger = logging.getLogger(__name__)

INTERNAL_ERROR = {
    "code": "internal_error",
    "message": "Something went wrong while triaging. Try again.",
}


def format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def sse_stream(events: AsyncIterator[TriageEvent]) -> AsyncIterator[str]:
    try:
        async for item in events:
            yield format_sse(item.event, item.data)
    except Exception:
        # Cancellation is a BaseException, so a client disconnect still ends the stream.
        logger.exception("Triage stream failed")
        yield format_sse("error", INTERNAL_ERROR)
