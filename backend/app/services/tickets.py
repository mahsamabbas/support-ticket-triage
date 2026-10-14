from app.db import TicketRepository
from app.errors import NotFoundError
from app.schemas import Ticket


def require_ticket(repo: TicketRepository, ticket_id: str) -> Ticket:
    ticket = repo.get(ticket_id)
    if ticket is None:
        raise NotFoundError(f"Ticket {ticket_id} does not exist.")
    return ticket
