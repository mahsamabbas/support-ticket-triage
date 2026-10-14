from collections.abc import AsyncIterator
from dataclasses import dataclass
from time import perf_counter
from typing import Any

from app.db import TicketRepository, TicketStateChangedError
from app.domain.injection import ticket_looks_like_injection
from app.domain.policy import apply_policy, fallback_result
from app.domain.taxonomy import TicketStatus
from app.llm.chains import LLMUnavailableError, classify, stream_draft
from app.llm.client import LLMProvider
from app.schemas import Ticket

TRIAGEABLE = frozenset({TicketStatus.NEW, TicketStatus.TRIAGED})


@dataclass(frozen=True)
class TriageEvent:
    event: str
    data: dict[str, Any]


def _elapsed_ms(started: float) -> int:
    return int((perf_counter() - started) * 1000)


def _unavailable(exc: LLMUnavailableError) -> TriageEvent:
    return TriageEvent(
        "error", {"code": "llm_unavailable", "message": f"The language model is unavailable: {exc}"}
    )


class TriageService:
    def __init__(
        self,
        repo: TicketRepository,
        provider: LLMProvider,
        confidence_threshold: float,
        step_timeout_seconds: float | None = None,
    ) -> None:
        self._repo = repo
        self._provider = provider
        self._threshold = confidence_threshold
        self._step_timeout = step_timeout_seconds

    async def run(self, ticket: Ticket) -> AsyncIterator[TriageEvent]:
        yield TriageEvent("step", {"name": "classify", "state": "started"})
        started = perf_counter()
        try:
            classification = await classify(
                self._provider.classifier(), ticket, step_timeout=self._step_timeout
            )
        except LLMUnavailableError as exc:
            yield _unavailable(exc)
            return
        if classification is None:
            result = fallback_result()
        else:
            result = apply_policy(
                classification,
                self._threshold,
                injection_suspected=ticket_looks_like_injection(ticket),
            )
        classify_ms = _elapsed_ms(started)
        yield TriageEvent("step", {"name": "classify", "state": "done", "ms": classify_ms})
        yield TriageEvent("classified", result.model_dump(mode="json"))

        yield TriageEvent("step", {"name": "draft", "state": "started"})
        started = perf_counter()
        parts: list[str] = []
        try:
            async for token in stream_draft(
                self._provider.drafter(), ticket, result, step_timeout=self._step_timeout
            ):
                parts.append(token)
                yield TriageEvent("draft_token", {"text": token})
        except LLMUnavailableError as exc:
            yield _unavailable(exc)
            return
        draft = "".join(parts).strip()
        if not draft:
            yield TriageEvent(
                "error",
                {"code": "empty_draft", "message": "The model returned an empty draft. Try again."},
            )
            return
        draft_ms = _elapsed_ms(started)
        yield TriageEvent("step", {"name": "draft", "state": "done", "ms": draft_ms})

        try:
            saved = self._repo.save_triage(
                ticket.id, result, draft, self._provider.model_name, classify_ms, draft_ms
            )
        except TicketStateChangedError:
            yield TriageEvent(
                "error",
                {
                    "code": "invalid_state",
                    "message": f"Ticket {ticket.id} was reviewed while triage was running; "
                    "the new result was discarded.",
                },
            )
            return
        yield TriageEvent("done", saved.model_dump(mode="json"))
