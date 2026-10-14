from fastapi import APIRouter

from app.deps import RepoDep
from app.domain.taxonomy import Queue, TicketStatus
from app.schemas import Ticket, TicketCreate
from app.services.tickets import require_ticket

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("", response_model=list[Ticket])
def list_tickets(
    repo: RepoDep, status: TicketStatus | None = None, queue: Queue | None = None
) -> list[Ticket]:
    return repo.list_tickets(status=status, queue=queue)


@router.get("/{ticket_id}", response_model=Ticket)
def get_ticket(ticket_id: str, repo: RepoDep) -> Ticket:
    return require_ticket(repo, ticket_id)


@router.post("", response_model=Ticket, status_code=201)
def create_ticket(payload: TicketCreate, repo: RepoDep) -> Ticket:
    return repo.create(payload)
