import pytest
from pydantic import ValidationError

from app.domain.policy import FALLBACK_REASON, apply_policy, fallback_result
from app.domain.taxonomy import (
    ALLOWED_QUEUES,
    Category,
    Flag,
    Queue,
    RoutableQueue,
    Urgency,
)
from app.schemas import ClassificationOut, ReviewRequest, TicketCreate


def make(**overrides) -> ClassificationOut:
    data = {
        "category": "billing",
        "urgency": "high",
        "queue": "Billing Team",
        "reason": "Duplicate charge needs a refund review.",
        "concrete_issue": True,
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


def test_concrete_issue_does_not_affect_routing():
    result = apply_policy(make(concrete_issue=False), threshold=0.6)
    assert result.queue == Queue.BILLING_TEAM
    assert result.flags == []


def test_flags_are_limited_to_policy_and_validation_outcomes():
    assert {flag.value for flag in Flag} == {
        "low_confidence",
        "inconsistent_route",
        "ai_output_invalid",
        "possible_injection",
    }


def test_suspected_injection_routes_to_manual_triage_and_keeps_model_values():
    result = apply_policy(make(urgency="critical"), threshold=0.6, injection_suspected=True)
    assert result.queue == Queue.MANUAL_TRIAGE
    assert result.flags == [Flag.POSSIBLE_INJECTION]
    assert (result.category, result.urgency, result.confidence) == (
        Category.BILLING,
        Urgency.CRITICAL,
        0.9,
    )


def test_injection_is_not_suspected_by_default():
    assert apply_policy(make(), threshold=0.6).flags == []


def test_all_flags_can_apply_together():
    classification = make(queue="Logistics", confidence=0.2, concrete_issue=False)
    result = apply_policy(classification, threshold=0.6, injection_suspected=True)
    assert result.flags == [
        Flag.LOW_CONFIDENCE,
        Flag.INCONSISTENT_ROUTE,
        Flag.POSSIBLE_INJECTION,
    ]
    assert result.queue == Queue.MANUAL_TRIAGE


def test_concrete_issue_is_required_and_comes_before_confidence():
    with pytest.raises(ValidationError):
        ClassificationOut(
            category="billing",
            urgency="high",
            queue="Billing Team",
            reason="Duplicate charge.",
            confidence=0.9,
        )
    fields = list(ClassificationOut.model_fields)
    assert fields.index("reason") < fields.index("concrete_issue") < fields.index("confidence")
    schema = ClassificationOut.model_json_schema()
    assert "concrete_issue" in schema["required"]
    properties = list(schema["properties"])
    assert properties.index("concrete_issue") < properties.index("confidence")


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


@pytest.mark.parametrize(
    "leak",
    ["欺诈", "アカウント", "계정", "\u3000", "\uff01", "\u3400", "\uf900", "\U00020000", "\u1100"],
    ids=[
        "han",
        "katakana",
        "hangul",
        "ideographic-space",
        "fullwidth",
        "cjk-ext-a",
        "compat-ideograph",
        "cjk-ext-b",
        "hangul-jamo",
    ],
)
def test_reason_rejects_cjk_and_fullwidth_text(leak):
    with pytest.raises(ValidationError, match="reason must be plain English text"):
        make(reason=f"Suspicious access needs action to prevent potential{leak}")


def test_reason_allows_accented_latin_text():
    assert make(reason="Jón reports a café order charged twice; refund review needed.").reason


def test_reason_is_capped_at_200_characters():
    assert make(reason="x" * 200)
    with pytest.raises(ValidationError):
        make(reason="x" * 201)


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
