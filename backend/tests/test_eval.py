from datetime import date

from app.domain.policy import fallback_result
from app.domain.taxonomy import Category, Flag, Queue, Urgency
from app.schemas import PolicyResult
from app.seed import SEED_TICKETS, SeedTicket
from scripts.eval_cases import HELD_OUT_TICKETS
from scripts.eval_triage import Row, _score, render


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


def test_render_reports_both_sets_with_scores_and_latency():
    seed_rows = [
        Row(seed(ticket_id="NG-1"), result(), 1000),
        Row(seed(None, None, Queue.MANUAL_TRIAGE, "NG-2"), result(queue=Queue.MANUAL_TRIAGE), 3000),
    ]
    held_out_rows = [
        Row(seed(ticket_id="EV-1"), result(urgency=Urgency.LOW), 2000),
        Row(seed(ticket_id="EV-2"), result(queue=Queue.CUSTOMER_CARE), 10000),
    ]
    report = render("qwen2.5:7b", 0.6, date(2026, 10, 14), seed_rows, held_out_rows)

    assert "`qwen2.5:7b`" in report
    assert "threshold 0.6" in report
    assert "2026-10-14" in report
    assert "mean 4000 ms" in report
    assert "median 2500 ms" in report
    seed_part, held_out_part = report.split("## Held-out tickets")
    assert "## Seed tickets (used while tuning the prompt)" in seed_part
    assert "Category 1/1 · Urgency 1/1 · Queue 2/2" in seed_part
    assert "Category 2/2 · Urgency 1/2 · Queue 1/2" in held_out_part
    assert "| NG-2 | any / any / Needs Manual Triage |" in seed_part
    assert "| EV-1 |" in held_out_part and "| EV-1 |" not in seed_part


def test_render_marks_fallback_rows():
    report = render(
        "qwen2.5:7b",
        0.6,
        date(2026, 10, 14),
        [Row(seed(ticket_id="NG-1"), fallback_result(), 1500)],
        [],
    )
    row_line = next(line for line in report.splitlines() if line.startswith("| NG-1 |"))
    assert "| 0.00 |" in row_line
    assert "ai_output_invalid" in row_line
    assert "Queue 0/1" in report


def test_held_out_set_is_distinct_and_covers_every_queue():
    ids = [ticket.id for ticket in HELD_OUT_TICKETS]
    assert len(ids) == 12
    assert len(set(ids)) == 12
    assert not set(ids) & {ticket.id for ticket in SEED_TICKETS}
    assert {ticket.expected_queue for ticket in HELD_OUT_TICKETS} == set(Queue)
