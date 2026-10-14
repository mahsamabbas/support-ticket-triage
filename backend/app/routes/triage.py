from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.deps import ProviderDep, RepoDep, SettingsDep
from app.errors import InvalidStateError, ServiceUnavailableError
from app.services.tickets import require_ticket
from app.services.triage import TRIAGEABLE, TriageService
from app.sse import sse_stream

router = APIRouter(tags=["triage"])


@router.post(
    "/tickets/{ticket_id}/triage",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "Triage events"}},
)
async def triage_ticket(
    ticket_id: str, repo: RepoDep, provider: ProviderDep, settings: SettingsDep
) -> StreamingResponse:
    ticket = require_ticket(repo, ticket_id)
    if ticket.status not in TRIAGEABLE:
        raise InvalidStateError(
            f"Ticket {ticket_id} is {ticket.status.value} and can no longer be triaged."
        )
    reachable, available = await provider.health()
    if not reachable:
        raise ServiceUnavailableError("Ollama is not reachable. Start it with `ollama serve`.")
    if not available:
        raise ServiceUnavailableError(
            f"Model {provider.model_name} is not available. "
            f"Run `ollama pull {provider.model_name}`."
        )
    service = TriageService(
        repo, provider, settings.confidence_threshold, settings.llm_timeout_seconds
    )
    return StreamingResponse(
        sse_stream(service.run(ticket)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
