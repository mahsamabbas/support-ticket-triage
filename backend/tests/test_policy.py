import pytest
from pydantic import ValidationError

from app.domain.policy import FALLBACK_REASON, apply_policy, fallback_result
from app.domain.taxonomy import (
    ALLOWED_QUEUES,
    Category,
    Flag,
    Queue,
    RoutableQueue,
)
from app.schemas import ClassificationOut, ReviewRequest, TicketCreate


def make(**overrides) -> ClassificationOut:
    data = {
        "category": "billing",
        "urgency": "high",
        "queue": "Billing Team",
        "reason": "Duplicate charge needs a refund review.",
        "confidence": 0.9,
    }
    data.update(overrides)
    return ClassificationOut(**data)


def test_confident_allowed_route_keeps_model_choice():
    result = apply_policy(make(), threshold=0.6)
    assert result.queue == Queue.BILLING_TEAM
    assert result.flags == []


def test_low_confidence_routes_to_manual_triage():
    result = apply_policy(make(confidence=0.4), threshold=0.6)
    assert result.queue == Queue.MANUAL_TRIAGE
    assert result.flags == [Flag.LOW_CONFIDENCE]
    assert result.category == Category.BILLING


def test_threshold_is_inclusive():
    assert apply_policy(make(confidence=0.6), threshold=0.6).flags == []


def test_disallowed_route_is_flagged_inconsistent():
    result = apply_policy(make(queue="Logistics"), threshold=0.6)
    assert result.queue == Queue.MANUAL_TRIAGE
    assert result.flags == [Flag.INCONSISTENT_ROUTE]


def test_both_flags_can_apply():
    result = apply_policy(make(queue="Logistics", confidence=0.2), threshold=0.6)
    assert result.flags == [Flag.LOW_CONFIDENCE, Flag.INCONSISTENT_ROUTE]


def test_fallback_is_manual_with_invalid_flag():
    result = fallback_result()
    assert result.queue == Queue.MANUAL_TRIAGE
    assert result.confidence == 0.0
    assert result.flags == [Flag.AI_OUTPUT_INVALID]
    assert result.reason == FALLBACK_REASON


def test_routable_queues_are_queue_minus_manual():
    assert {q.value for q in RoutableQueue} == {q.value for q in Queue} - {"Needs Manual Triage"}


def test_every_category_routes_somewhere_real():
    for category in Category:
        assert ALLOWED_QUEUES[category]
        assert Queue.MANUAL_TRIAGE not in ALLOWED_QUEUES[category]


def test_model_cannot_pick_manual_queue():
    with pytest.raises(ValidationError):
        make(queue="Needs Manual Triage")


def test_ticket_create_strips_and_validates_lengths():
    ticket = TicketCreate(
        customer_name="  Sara  ", subject="Refund please", body="Charged twice today."
    )
    assert ticket.customer_name == "Sara"
    with pytest.raises(ValidationError):
        TicketCreate(customer_name="Sara", subject="Hi", body="Charged twice today.")
    with pytest.raises(ValidationError):
        TicketCreate(customer_name="Sara", subject="Refund", body="x" * 4001)


def test_approve_requires_final_fields_but_reject_does_not():
    with pytest.raises(ValidationError):
        ReviewRequest(action="approve", final_category="billing")
    assert ReviewRequest(action="reject").final_queue is None
