from datetime import date

import pytest

from app.domain.policy import fallback_result
from app.domain.taxonomy import Category, Flag, Queue, Urgency
from app.schemas import PolicyResult
from app.seed import SEED_TICKETS, SeedTicket
from scripts.eval_cases import HELD_OUT_TICKETS
from scripts.eval_cases_v2 import HELD_OUT_V2
from scripts.eval_triage import BEFORE_SAFEGUARDS, Row, _score, render

SEED_TITLE = "Seed tickets (used while tuning the prompt)"
V1_TITLE = "Held-out v1 (used to diagnose these fixes)"
V2_TITLE = "Held-out v2 (written blind, run once after the fixes)"


def seed(
    category: Category | None = Category.BILLING,
    urgency: Urgency | None = Urgency.HIGH,
    queue: Queue = Queue.BILLING_TEAM,
    ticket_id: str = "T-1",
) -> SeedTicket:
    return SeedTicket(
        ticket_id, "Sara", "Charged twice", "Charged twice today.", category, urgency, queue
    )


def result(
    category: Category = Category.BILLING,
    urgency: Urgency = Urgency.HIGH,
    queue: Queue = Queue.BILLING_TEAM,
    confidence: float = 0.9,
    flags: list[Flag] | None = None,
) -> PolicyResult:
    return PolicyResult(
        category=category,
        urgency=urgency,
        queue=queue,
        reason="Duplicate charge needs a refund review.",
        confidence=confidence,
        flags=flags or [],
    )


def section(report: str, title: str) -> str:
    start = report.index(f"## {title}")
    end = report.find("\n## ", start + 1)
    return report[start:] if end == -1 else report[start:end]


def test_row_compares_each_label_with_expected():
    row = Row(seed(), result(urgency=Urgency.MEDIUM, queue=Queue.CUSTOMER_CARE), 1200)
    assert row.category_ok is True
    assert row.urgency_ok is False
    assert row.queue_ok is False


def test_row_with_any_expected_label_is_unscored():
    row = Row(seed(None, None, Queue.MANUAL_TRIAGE), result(queue=Queue.MANUAL_TRIAGE), 900)
    assert row.category_ok is None
    assert row.urgency_ok is None
    assert row.queue_ok is True


def test_score_ignores_unscored_values():
    assert _score([True, False, None, True]) == "2/3"
    assert _score([None]) == "0/0"


def test_render_reports_every_set_with_scores_and_latency():
    seed_rows = [
        Row(seed(ticket_id="NG-1"), result(), 1000),
        Row(seed(None, None, Queue.MANUAL_TRIAGE, "NG-2"), result(queue=Queue.MANUAL_TRIAGE), 3000),
    ]
    v1_rows = [
        Row(seed(ticket_id="EV-1"), result(urgency=Urgency.LOW), 2000),
        Row(seed(ticket_id="EV-2"), result(queue=Queue.CUSTOMER_CARE), 10000),
    ]
    v2_rows = [Row(seed(ticket_id="HX-1"), result(), 4000)]
    report = render(
        "qwen2.5:7b",
        0.6,
        date(2026, 10, 14),
        [(SEED_TITLE, seed_rows), (V1_TITLE, v1_rows), (V2_TITLE, v2_rows)],
    )

    assert "`qwen2.5:7b`" in report
    assert "threshold 0.6" in report
    assert "2026-10-14" in report
    assert "mean 4000 ms" in report
    assert "median 3000 ms" in report
    assert BEFORE_SAFEGUARDS in report
    assert report.index(BEFORE_SAFEGUARDS) < report.index(f"## {SEED_TITLE}")
    seed_part = section(report, SEED_TITLE)
    v1_part = section(report, V1_TITLE)
    v2_part = section(report, V2_TITLE)
    assert "Category 1/1 · Urgency 1/1 · Queue 2/2" in seed_part
    assert "Category 2/2 · Urgency 1/2 · Queue 1/2" in v1_part
    assert "Category 1/1 · Urgency 1/1 · Queue 1/1" in v2_part
    assert "| NG-2 | any / any / Needs Manual Triage |" in seed_part
    assert "| EV-1 |" in v1_part and "| EV-1 |" not in seed_part + v2_part
    assert "| HX-1 |" in v2_part


def test_before_line_keeps_the_previous_numbers():
    assert "Seed queue 9/10" in BEFORE_SAFEGUARDS
    assert "held-out v1 queue 9/12" in BEFORE_SAFEGUARDS
    assert "16dbf02" in BEFORE_SAFEGUARDS


def test_render_marks_fallback_and_flagged_rows():
    flagged = result(queue=Queue.MANUAL_TRIAGE, flags=[Flag.POSSIBLE_INJECTION])
    report = render(
        "qwen2.5:7b",
        0.6,
        date(2026, 10, 14),
        [
            (SEED_TITLE, [Row(seed(ticket_id="NG-1"), fallback_result(), 1500)]),
            (V1_TITLE, [Row(seed(ticket_id="EV-1"), flagged, 1500)]),
        ],
    )
    fallback_line = next(line for line in report.splitlines() if line.startswith("| NG-1 |"))
    assert "| 0.00 |" in fallback_line
    assert "ai_output_invalid" in fallback_line
    flagged_line = next(line for line in report.splitlines() if line.startswith("| EV-1 |"))
    assert "possible_injection" in flagged_line
    assert "Queue 0/1" in section(report, SEED_TITLE)


@pytest.mark.parametrize("tickets", [HELD_OUT_TICKETS, HELD_OUT_V2], ids=["v1", "v2"])
def test_held_out_sets_are_distinct_and_cover_every_queue(tickets):
    ids = [ticket.id for ticket in tickets]
    assert len(ids) == 12
    assert len(set(ids)) == 12
    others = [SEED_TICKETS, HELD_OUT_TICKETS, HELD_OUT_V2]
    other_ids = {t.id for group in others if group is not tickets for t in group}
    assert not set(ids) & other_ids
    assert {ticket.expected_queue for ticket in tickets} == set(Queue)
