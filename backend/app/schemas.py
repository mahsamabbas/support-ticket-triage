import re
from enum import StrEnum
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.taxonomy import Category, Flag, Queue, RoutableQueue, TicketStatus, Urgency

# Hangul Jamo, CJK punctuation through ideographs, Hangul syllables, compatibility ideographs,
# fullwidth forms and ideograph extensions B-G. qwen2.5 sometimes drifts into Chinese
# mid-sentence; accented Latin stays allowed.
_CJK_OR_FULLWIDTH = re.compile(
    "[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef\U00020000-\U0003134f]"
)


class TicketText(Protocol):
    customer_name: str
    subject: str
    body: str


class TicketCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    customer_name: str = Field(min_length=1, max_length=80)
    subject: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=10, max_length=4000)


class ClassificationOut(BaseModel):
    """What the model must return. Its JSON schema is sent to Ollama as `format`."""

    category: Category
    urgency: Urgency
    queue: RoutableQueue
    reason: str = Field(min_length=1, max_length=200)
    # Must stay before `confidence`: the model commits to it before scoring confidence.
    concrete_issue: bool
    confidence: float = Field(ge=0, le=1)

    @field_validator("reason")
    @classmethod
    def reason_is_english(cls, value: str) -> str:
        if _CJK_OR_FULLWIDTH.search(value):
            raise ValueError("reason must be plain English text")
        return value


class PolicyResult(BaseModel):
    category: Category
    urgency: Urgency
    queue: Queue
    reason: str
    confidence: float
    flags: list[Flag]


class TriageRecord(BaseModel):
    ai_category: Category
    ai_urgency: Urgency
    ai_queue: Queue
    reason: str
    confidence: float
    flags: list[Flag]
    ai_draft: str
    final_category: Category | None = None
    final_urgency: Urgency | None = None
    final_queue: Queue | None = None
    final_draft: str | None = None
    review_note: str | None = None
    model: str
    classify_ms: int
    draft_ms: int
    triaged_at: str
    reviewed_at: str | None = None


class Ticket(BaseModel):
    id: str
    customer_name: str
    subject: str
    body: str
    status: TicketStatus
    created_at: str
    triage: TriageRecord | None = None


class ReviewAction(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class ReviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    action: ReviewAction
    final_category: Category | None = None
    final_urgency: Urgency | None = None
    final_queue: Queue | None = None
    final_draft: str | None = Field(default=None, max_length=4000)
    review_note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def approve_needs_final_fields(self) -> "ReviewRequest":
        if self.action is ReviewAction.APPROVE:
            required = ("final_category", "final_urgency", "final_queue", "final_draft")
            missing = [name for name in required if not getattr(self, name)]
            if missing:
                raise ValueError(f"approve requires: {', '.join(missing)}")
        return self


class TaxonomyOut(BaseModel):
    categories: list[Category]
    urgencies: list[Urgency]
    queues: list[Queue]
    routable_queues: list[RoutableQueue]
    allowed_queues: dict[Category, list[Queue]]
    confidence_threshold: float


class StatsOut(BaseModel):
    by_status: dict[TicketStatus, int]
    open_by_queue: dict[Queue, int]
    avg_confidence: float | None


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    ollama_reachable: bool
    model: str
    model_available: bool
