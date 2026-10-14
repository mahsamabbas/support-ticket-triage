from app.db import TicketRepository, TicketStateChangedError
from app.domain.taxonomy import Queue, TicketStatus, is_route_allowed
from app.errors import InvalidRouteError, InvalidStateError, NotFoundError
from app.schemas import ReviewAction, ReviewRequest, Ticket


def require_ticket(repo: TicketRepository, ticket_id: str) -> Ticket:
    ticket = repo.get(ticket_id)
    if ticket is None:
        raise NotFoundError(f"Ticket {ticket_id} does not exist.")
    return ticket


def review_ticket(repo: TicketRepository, ticket_id: str, review: ReviewRequest) -> Ticket:
    ticket = require_ticket(repo, ticket_id)
    if ticket.status != TicketStatus.TRIAGED:
        raise InvalidStateError(
            f"Ticket {ticket_id} is {ticket.status.value}; only triaged tickets can be reviewed."
        )
    if review.action == ReviewAction.REJECT:
        return _save_review(repo, ticket_id, review, TicketStatus.REJECTED)

    category, queue = review.final_category, review.final_queue
    if category is None or queue is None:
        raise InvalidRouteError("Approving needs a category and a queue.")
    if queue == Queue.MANUAL_TRIAGE:
        raise InvalidRouteError("Pick a real queue before approving; manual triage is not a team.")
    if not is_route_allowed(category, queue):
        raise InvalidRouteError(f"{queue.value} does not handle {category.value} tickets.")
    return _save_review(repo, ticket_id, review, TicketStatus.APPROVED)


def _save_review(
    repo: TicketRepository, ticket_id: str, review: ReviewRequest, status: TicketStatus
) -> Ticket:
    try:
        return repo.save_review(ticket_id, review, status)
    except TicketStateChangedError as exc:
        raise InvalidStateError(
            f"Ticket {ticket_id} changed while you were reviewing it; reload and try again."
        ) from exc
