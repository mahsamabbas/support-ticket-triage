import asyncio
import re
from collections.abc import AsyncIterator, Awaitable, Callable

import httpx
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from pydantic import ValidationError

from app.domain.taxonomy import Queue
from app.llm.prompts import (
    CLARIFY_INSTRUCTION,
    CLASSIFY_PROMPT,
    DRAFT_PROMPT,
    REPAIR_INSTRUCTION,
    ROUTED_INSTRUCTION,
)
from app.schemas import ClassificationOut, PolicyResult, TicketText

TRANSIENT_ERRORS = (ConnectionError, TimeoutError, httpx.TransportError)
MAX_ATTEMPTS = 2

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")
_TICKET_TAG = re.compile(r"<\s*(/?)\s*ticket\s*>", re.IGNORECASE)


class LLMUnavailableError(RuntimeError):
    pass


def _describe(exc: BaseException) -> str:
    return str(exc) or exc.__class__.__name__


def _timed_out(step_timeout: float) -> str:
    return f"timed out after {step_timeout:g}s"


def _neutralise_tags(text: str) -> str:
    """Stop customer text from closing or reopening the prompt's <ticket> fence."""
    return _TICKET_TAG.sub(lambda match: f"[{match.group(1)}ticket]", text)


def _ticket_variables(ticket: TicketText) -> dict[str, str]:
    return {
        "customer_name": _neutralise_tags(ticket.customer_name),
        "subject": _neutralise_tags(ticket.subject),
        "body": _neutralise_tags(ticket.body),
    }


def _parse(raw: str) -> ClassificationOut:
    return ClassificationOut.model_validate_json(_FENCE.sub("", raw.strip()))


def _summarize(exc: ValidationError) -> str:
    parts = []
    for error in exc.errors()[:5]:
        location = ".".join(str(part) for part in error["loc"]) or "root"
        parts.append(f"{location}: {error['msg']}")
    return "; ".join(parts)


async def _call_with_retry(call: Callable[[], Awaitable[str]]) -> str:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return await call()
        except TRANSIENT_ERRORS as exc:
            if attempt == MAX_ATTEMPTS:
                raise LLMUnavailableError(_describe(exc)) from exc
        except Exception as exc:
            raise LLMUnavailableError(_describe(exc)) from exc
    raise AssertionError("unreachable")


async def classify(
    llm: BaseChatModel, ticket: TicketText, *, step_timeout: float | None = None
) -> ClassificationOut | None:
    """Return None when the output is still invalid after one repair attempt.

    `step_timeout` bounds the whole step, retries and repair included.
    """
    try:
        async with asyncio.timeout(step_timeout):
            return await _classify(llm, ticket)
    except TimeoutError as exc:
        raise LLMUnavailableError(_timed_out(step_timeout)) from exc


async def _classify(llm: BaseChatModel, ticket: TicketText) -> ClassificationOut | None:
    chain = CLASSIFY_PROMPT | llm | StrOutputParser()
    variables = _ticket_variables(ticket)
    raw = await _call_with_retry(lambda: chain.ainvoke(variables))
    try:
        return _parse(raw)
    except ValidationError as exc:
        error = _summarize(exc)

    repair = [AIMessage(content=raw), HumanMessage(content=REPAIR_INSTRUCTION.format(error=error))]
    raw = await _call_with_retry(lambda: chain.ainvoke({**variables, "repair": repair}))
    try:
        return _parse(raw)
    except ValidationError:
        return None


def draft_variables(ticket: TicketText, result: PolicyResult) -> dict[str, str]:
    if result.queue == Queue.MANUAL_TRIAGE:
        instruction = CLARIFY_INSTRUCTION
    else:
        instruction = ROUTED_INSTRUCTION.format(
            category=result.category.value,
            urgency=result.urgency.value,
            queue=result.queue.value,
        )
    return {**_ticket_variables(ticket), "instruction": instruction}


async def stream_draft(
    llm: BaseChatModel,
    ticket: TicketText,
    result: PolicyResult,
    *,
    step_timeout: float | None = None,
) -> AsyncIterator[str]:
    """`step_timeout` is an overall deadline for the stream, retries included."""
    chain = DRAFT_PROMPT | llm | StrOutputParser()
    variables = draft_variables(ticket, result)
    loop = asyncio.get_running_loop()
    deadline = None if step_timeout is None else loop.time() + step_timeout
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = False
        stream = chain.astream(variables)
        try:
            while True:
                remaining = None if deadline is None else deadline - loop.time()
                try:
                    # A timeout scope must not stay open across `yield`, so each chunk is
                    # awaited against the remaining time instead.
                    token = await asyncio.wait_for(anext(stream), remaining)
                except StopAsyncIteration:
                    return
                if token:
                    started = True
                    yield token
        except TRANSIENT_ERRORS as exc:
            if deadline is not None and loop.time() >= deadline:
                raise LLMUnavailableError(_timed_out(step_timeout)) from exc
            if started or attempt == MAX_ATTEMPTS:
                raise LLMUnavailableError(_describe(exc)) from exc
        except Exception as exc:
            raise LLMUnavailableError(_describe(exc)) from exc
        finally:
            await stream.aclose()
