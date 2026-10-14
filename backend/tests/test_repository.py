import pytest

from app.db import TicketRepository, TicketStateChangedError
from app.domain.taxonomy import Category, Flag, Queue, TicketStatus, Urgency
from app.schemas import PolicyResult, ReviewRequest, TicketCreate
from app.seed import SEED_TICKETS, seed_if_empty


@pytest.fixture
def repo(tmp_path) -> TicketRepository:
    repository = TicketRepository(tmp_path / "test.db")
    repository.init_schema()
    return repository


def policy(**overrides) -> PolicyResult:
    data = {
        "category": Category.BILLING,
        "urgency": Urgency.HIGH,
        "queue": Queue.BILLING_TEAM,
        "reason": "Duplicate charge.",
        "confidence": 0.9,
        "flags": [],
    }
    data.update(overrides)
    return PolicyResult(**data)


def new_ticket() -> TicketCreate:
    return TicketCreate(
        customer_name="Ali", subject="Order late", body="My order has not arrived yet."
    )


def test_seed_inserts_ten_tickets_once(repo):
    assert seed_if_empty(repo) == 10
    assert seed_if_empty(repo) == 0
    assert repo.count() == 10
    assert len(SEED_TICKETS) == 10


def test_create_on_empty_db_starts_at_1001(repo):
    assert repo.create(new_ticket()).id == "NG-1001"


def test_create_after_seed_assigns_next_id(repo):
    seed_if_empty(repo)
    ticket = repo.create(new_ticket())
    assert ticket.id == "NG-1011"
    assert ticket.status == TicketStatus.NEW
    assert ticket.triage is None


def test_save_triage_sets_status_and_record(repo):
    seed_if_empty(repo)
    ticket = repo.save_triage("NG-1001", policy(), "Hi Sara", "qwen2.5:7b", 1200, 3400)
    assert ticket.status == TicketStatus.TRIAGED
    assert ticket.triage.ai_queue == Queue.BILLING_TEAM
    assert ticket.triage.ai_draft == "Hi Sara"
    assert ticket.triage.classify_ms == 1200
    assert ticket.triage.final_queue is None


def test_retriage_replaces_result(repo):
    seed_if_empty(repo)
    repo.save_triage("NG-1001", policy(), "first", "m", 1, 1)
    ticket = repo.save_triage(
        "NG-1001",
        policy(queue=Queue.MANUAL_TRIAGE, flags=[Flag.LOW_CONFIDENCE]),
        "second",
        "m",
        2,
        2,
    )
    assert ticket.status == TicketStatus.TRIAGED
    assert ticket.triage.ai_draft == "second"
    assert ticket.triage.flags == [Flag.LOW_CONFIDENCE]
    assert ticket.triage.classify_ms == 2


@pytest.mark.parametrize(
    ("review", "status"),
    [
        (
            ReviewRequest(
                action="approve",
                final_category="billing",
                final_urgency="critical",
                final_queue="Billing Team",
                final_draft="edited",
            ),
            TicketStatus.APPROVED,
        ),
        (ReviewRequest(action="reject", review_note="wrong"), TicketStatus.REJECTED),
    ],
)
def test_save_triage_refuses_reviewed_ticket(repo, review, status):
    seed_if_empty(repo)
    repo.save_triage("NG-1001", policy(), "first", "m", 1, 1)
    reviewed = repo.save_review("NG-1001", review, status)

    with pytest.raises(TicketStateChangedError):
        repo.save_triage("NG-1001", policy(urgency=Urgency.LOW), "second", "m", 2, 2)

    assert repo.get("NG-1001") == reviewed


def test_list_puts_new_first_then_sorts_by_urgency(repo):
    seed_if_empty(repo)
    repo.save_triage("NG-1005", policy(urgency=Urgency.LOW), "d", "m", 1, 1)
    repo.save_triage("NG-1003", policy(urgency=Urgency.CRITICAL), "d", "m", 1, 1)
    ids = [t.id for t in repo.list_tickets()]
    assert ids[:8] == [s.id for s in SEED_TICKETS if s.id not in {"NG-1003", "NG-1005"}]
    assert ids[8:] == ["NG-1003", "NG-1005"]


def test_list_filters_by_status_and_queue(repo):
    seed_if_empty(repo)
    repo.save_triage("NG-1001", policy(), "d", "m", 1, 1)
    repo.save_triage("NG-1003", policy(queue=Queue.LOGISTICS), "d", "m", 1, 1)
    assert [t.id for t in repo.list_tickets(status=TicketStatus.TRIAGED)] == ["NG-1001", "NG-1003"]
    assert [t.id for t in repo.list_tickets(queue=Queue.LOGISTICS)] == ["NG-1003"]


def test_save_review_records_final_fields(repo):
    seed_if_empty(repo)
    repo.save_triage("NG-1001", policy(), "draft", "m", 1, 1)
    review = ReviewRequest(
        action="approve",
        final_category="billing",
        final_urgency="critical",
        final_queue="Customer Care",
        final_draft="edited draft",
    )
    ticket = repo.save_review("NG-1001", review, TicketStatus.APPROVED)
    assert ticket.status == TicketStatus.APPROVED
    assert ticket.triage.final_urgency == Urgency.CRITICAL
    assert ticket.triage.final_queue == Queue.CUSTOMER_CARE
    assert ticket.triage.final_draft == "edited draft"
    assert ticket.triage.reviewed_at is not None
    assert [t.id for t in repo.list_tickets(queue=Queue.CUSTOMER_CARE)] == ["NG-1001"]


def test_save_review_refuses_already_reviewed_ticket(repo):
    seed_if_empty(repo)
    repo.save_triage("NG-1001", policy(), "draft", "m", 1, 1)
    approved = repo.save_review(
        "NG-1001",
        ReviewRequest(
            action="approve",
            final_category="billing",
            final_urgency="high",
            final_queue="Billing Team",
            final_draft="first review",
        ),
        TicketStatus.APPROVED,
    )

    with pytest.raises(TicketStateChangedError):
        repo.save_review(
            "NG-1001",
            ReviewRequest(action="reject", review_note="second review"),
            TicketStatus.REJECTED,
        )

    assert repo.get("NG-1001") == approved


def test_save_review_refuses_untriaged_ticket(repo):
    seed_if_empty(repo)
    before = repo.get("NG-1002")

    with pytest.raises(TicketStateChangedError):
        repo.save_review(
            "NG-1002", ReviewRequest(action="reject", review_note="no"), TicketStatus.REJECTED
        )

    assert repo.get("NG-1002") == before


def test_stats_counts(repo):
    seed_if_empty(repo)
    assert repo.stats().avg_confidence is None
    repo.save_triage("NG-1001", policy(confidence=0.9), "d", "m", 1, 1)
    repo.save_triage(
        "NG-1009",
        policy(queue=Queue.MANUAL_TRIAGE, confidence=0.3, flags=[Flag.LOW_CONFIDENCE]),
        "d",
        "m",
        1,
        1,
    )
    stats = repo.stats()
    assert stats.by_status[TicketStatus.NEW] == 8
    assert stats.by_status[TicketStatus.TRIAGED] == 2
    assert stats.open_by_queue[Queue.BILLING_TEAM] == 1
    assert stats.open_by_queue[Queue.MANUAL_TRIAGE] == 1
    assert stats.avg_confidence == 0.6
