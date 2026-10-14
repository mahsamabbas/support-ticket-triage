import asyncio
import json

from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessageChunk
from langchain_core.outputs import ChatGenerationChunk

DRAFT_TEXT = (
    "Hi Sara, thanks for flagging the duplicate charge on order #4521. Our Billing Team is "
    "reviewing it now and will follow up with you. NovaGear Support"
)


def classification_json(**overrides) -> str:
    data = {
        "category": "billing",
        "urgency": "high",
        "queue": "Billing Team",
        "reason": "Duplicate card charge on order #4521 needs a refund review.",
        "concrete_issue": True,
        "confidence": 0.92,
    }
    data.update(overrides)
    return json.dumps(data)


class FailingChatModel(FakeListChatModel):
    """Raises the same error an unreachable Ollama server does."""

    def _call(self, *args, **kwargs):
        raise ConnectionError("Ollama connection refused")

    def _stream(self, *args, **kwargs):
        raise ConnectionError("Ollama connection refused")

    async def _astream(self, *args, **kwargs):
        raise ConnectionError("Ollama connection refused")
        yield  # pragma: no cover


class FlakyChatModel(FakeListChatModel):
    """Raises `error` on the first `failures` calls, then replies from `responses`."""

    error: type[Exception] = ConnectionError
    failures: int = 1
    calls: int = 0

    def _fail_first_calls(self) -> None:
        self.calls += 1
        if self.calls <= self.failures:
            raise self.error("injected failure")

    def _call(self, *args, **kwargs):
        self._fail_first_calls()
        return super()._call(*args, **kwargs)

    async def _astream(self, *args, **kwargs):
        self._fail_first_calls()
        async for chunk in super()._astream(*args, **kwargs):
            yield chunk


class DroppingChatModel(FakeListChatModel):
    """Streams the start of a reply, then loses the connection."""

    calls: int = 0

    async def _astream(self, *args, **kwargs):
        self.calls += 1
        for token in ("Hi ", "Sara, "):
            yield ChatGenerationChunk(message=AIMessageChunk(content=token))
        raise ConnectionError("Ollama connection reset")


class SlowChatModel(FakeListChatModel):
    """Stalls for `delay` seconds before answering, like an overloaded server."""

    delay: float = 5.0
    calls: int = 0

    async def _agenerate(self, *args, **kwargs):
        self.calls += 1
        await asyncio.sleep(self.delay)
        return await super()._agenerate(*args, **kwargs)


class FakeProvider:
    model_name = "fake-qwen"

    def __init__(self) -> None:
        self.classify_responses = [classification_json()]
        self.draft_text = DRAFT_TEXT
        self.reachable = True
        self.model_available = True
        self.fail_classify = False
        self.fail_draft = False

    def classifier(self):
        if self.fail_classify:
            return FailingChatModel(responses=["unused"])
        return FakeListChatModel(responses=list(self.classify_responses))

    def drafter(self):
        if self.fail_draft:
            return FailingChatModel(responses=["unused"])
        return FakeListChatModel(responses=[self.draft_text])

    async def health(self) -> tuple[bool, bool]:
        return self.reachable, self.model_available
