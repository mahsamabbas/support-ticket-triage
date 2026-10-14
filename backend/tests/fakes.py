import json

from langchain_core.language_models.fake_chat_models import FakeListChatModel

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
