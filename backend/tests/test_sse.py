import asyncio
import logging

import pytest

from app.services.triage import TriageEvent
from app.sse import INTERNAL_ERROR, sse_stream
from tests.sse_utils import parse_sse


async def test_unexpected_error_ends_stream_with_internal_error(caplog):
    async def events():
        yield TriageEvent("step", {"name": "classify", "state": "started"})
        raise RuntimeError("database is locked")

    with caplog.at_level(logging.ERROR, logger="app.sse"):
        frames = [frame async for frame in sse_stream(events())]

    assert parse_sse("".join(frames)) == [
        ("step", {"name": "classify", "state": "started"}),
        ("error", INTERNAL_ERROR),
    ]
    assert INTERNAL_ERROR == {
        "code": "internal_error",
        "message": "Something went wrong while triaging. Try again.",
    }
    assert "database is locked" in caplog.text


async def test_cancellation_is_not_swallowed():
    async def events():
        yield TriageEvent("step", {"name": "classify", "state": "started"})
        raise asyncio.CancelledError

    frames = []
    with pytest.raises(asyncio.CancelledError):
        async for frame in sse_stream(events()):
            frames.append(frame)
    assert len(frames) == 1
