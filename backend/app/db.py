import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path

from app.domain.taxonomy import URGENCY_RANK, Queue, TicketStatus, Urgency
from app.schemas import PolicyResult, ReviewRequest, StatsOut, Ticket, TicketCreate, TriageRecord

TICKET_PREFIX = "NG-"
FIRST_TICKET_NUMBER = 1001

SCHEMA = """
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS triage_results (
    ticket_id TEXT PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    ai_category TEXT NOT NULL,
    ai_urgency TEXT NOT NULL,
    ai_queue TEXT NOT NULL,
    reason TEXT NOT NULL,
    confidence REAL NOT NULL,
    flags TEXT NOT NULL,
    ai_draft TEXT NOT NULL,
    final_category TEXT,
    final_urgency TEXT,
    final_queue TEXT,
    final_draft TEXT,
    review_note TEXT,
    model TEXT NOT NULL,
    classify_ms INTEGER NOT NULL,
    draft_ms INTEGER NOT NULL,
    triaged_at TEXT NOT NULL,
    reviewed_at TEXT
);
"""

SELECT_TICKETS = """
SELECT t.*, r.*
FROM tickets t
LEFT JOIN triage_results r ON r.ticket_id = t.id
"""


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def current_queue(ticket: Ticket) -> Queue | None:
    if ticket.triage is None:
        return None
    return ticket.triage.final_queue or ticket.triage.ai_queue


def current_urgency(ticket: Ticket) -> Urgency | None:
    if ticket.triage is None:
        return None
    return ticket.triage.final_urgency or ticket.triage.ai_urgency


def _value(member: Enum | None) -> str | None:
    return None if member is None else member.value


def _row_to_ticket(row: sqlite3.Row) -> Ticket:
    triage = None
    if row["ai_category"] is not None:
        data = {name: row[name] for name in TriageRecord.model_fields}
        data["flags"] = json.loads(row["flags"])
        triage = TriageRecord(**data)
    return Ticket(
        id=row["id"],
        customer_name=row["customer_name"],
        subject=row["subject"],
        body=row["body"],
        status=row["status"],
        created_at=row["created_at"],
        triage=triage,
    )


def _inbox_sort_key(ticket: Ticket) -> tuple:
    if ticket.status == TicketStatus.NEW:
        return (0, ticket.created_at)
    urgency = current_urgency(ticket) or Urgency.LOW
    return (1, URGENCY_RANK[urgency], ticket.created_at)


class TicketRepository:
    def __init__(self, path: Path) -> None:
        self._path = path

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    def count(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0]

    def insert(self, ticket_id: str, data: TicketCreate, created_at: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO tickets (id, customer_name, subject, body, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    ticket_id,
                    data.customer_name,
                    data.subject,
                    data.body,
                    TicketStatus.NEW.value,
                    created_at,
                ),
            )

    def create(self, data: TicketCreate) -> Ticket:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT MAX(CAST(SUBSTR(id, ?) AS INTEGER)) FROM tickets",
                (len(TICKET_PREFIX) + 1,),
            ).fetchone()
        next_number = (row[0] + 1) if row[0] is not None else FIRST_TICKET_NUMBER
        ticket_id = f"{TICKET_PREFIX}{next_number}"
        self.insert(ticket_id, data, utc_now())
        return self._require(ticket_id)

    def get(self, ticket_id: str) -> Ticket | None:
        with self._connect() as conn:
            row = conn.execute(SELECT_TICKETS + " WHERE t.id = ?", (ticket_id,)).fetchone()
        return _row_to_ticket(row) if row else None

    def list_tickets(
        self, status: TicketStatus | None = None, queue: Queue | None = None
    ) -> list[Ticket]:
        with self._connect() as conn:
            rows = conn.execute(SELECT_TICKETS).fetchall()
        tickets = [_row_to_ticket(row) for row in rows]
        if status is not None:
            tickets = [t for t in tickets if t.status == status]
        if queue is not None:
            tickets = [t for t in tickets if current_queue(t) == queue]
        return sorted(tickets, key=_inbox_sort_key)

    def save_triage(
        self,
        ticket_id: str,
        result: PolicyResult,
        draft: str,
        model: str,
        classify_ms: int,
        draft_ms: int,
    ) -> Ticket:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO triage_results (
                    ticket_id, ai_category, ai_urgency, ai_queue, reason, confidence, flags,
                    ai_draft, model, classify_ms, draft_ms, triaged_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ticket_id) DO UPDATE SET
                    ai_category = excluded.ai_category,
                    ai_urgency = excluded.ai_urgency,
                    ai_queue = excluded.ai_queue,
                    reason = excluded.reason,
                    confidence = excluded.confidence,
                    flags = excluded.flags,
                    ai_draft = excluded.ai_draft,
                    model = excluded.model,
                    classify_ms = excluded.classify_ms,
                    draft_ms = excluded.draft_ms,
                    triaged_at = excluded.triaged_at,
                    final_category = NULL,
                    final_urgency = NULL,
                    final_queue = NULL,
                    final_draft = NULL,
                    review_note = NULL,
                    reviewed_at = NULL
                """,
                (
                    ticket_id,
                    result.category.value,
                    result.urgency.value,
                    result.queue.value,
                    result.reason,
                    result.confidence,
                    json.dumps([flag.value for flag in result.flags]),
                    draft,
                    model,
                    classify_ms,
                    draft_ms,
                    utc_now(),
                ),
            )
            conn.execute(
                "UPDATE tickets SET status = ? WHERE id = ?",
                (TicketStatus.TRIAGED.value, ticket_id),
            )
        return self._require(ticket_id)

    def save_review(self, ticket_id: str, review: ReviewRequest, status: TicketStatus) -> Ticket:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE triage_results SET
                    final_category = ?, final_urgency = ?, final_queue = ?,
                    final_draft = ?, review_note = ?, reviewed_at = ?
                WHERE ticket_id = ?
                """,
                (
                    _value(review.final_category),
                    _value(review.final_urgency),
                    _value(review.final_queue),
                    review.final_draft,
                    review.review_note,
                    utc_now(),
                    ticket_id,
                ),
            )
            conn.execute("UPDATE tickets SET status = ? WHERE id = ?", (status.value, ticket_id))
        return self._require(ticket_id)

    def stats(self) -> StatsOut:
        by_status = {status: 0 for status in TicketStatus}
        open_by_queue = {queue: 0 for queue in Queue}
        confidences: list[float] = []
        for ticket in self.list_tickets():
            by_status[ticket.status] += 1
            if ticket.triage is None:
                continue
            confidences.append(ticket.triage.confidence)
            if ticket.status == TicketStatus.TRIAGED:
                open_by_queue[ticket.triage.ai_queue] += 1
        avg = round(sum(confidences) / len(confidences), 3) if confidences else None
        return StatsOut(by_status=by_status, open_by_queue=open_by_queue, avg_confidence=avg)

    def _require(self, ticket_id: str) -> Ticket:
        ticket = self.get(ticket_id)
        if ticket is None:
            raise LookupError(ticket_id)
        return ticket
