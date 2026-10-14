"""Classify the seed and held-out tickets with live Ollama and score them against their labels."""

import argparse
import asyncio
import statistics
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from time import perf_counter

from app.config import Settings, get_settings
from app.domain.injection import ticket_looks_like_injection
from app.domain.policy import apply_policy, fallback_result
from app.llm.chains import LLMUnavailableError, classify
from app.llm.client import OllamaProvider
from app.schemas import PolicyResult
from app.seed import SEED_TICKETS, SeedTicket
from scripts.eval_cases import HELD_OUT_TICKETS
from scripts.eval_cases_v2 import HELD_OUT_V2
from scripts.eval_cases_v3 import HELD_OUT_V3

HISTORY = (
    "History:",
    "",
    "1. Before the safeguards (16dbf02): seed queue 9/10 · held-out v1 queue 9/12. EV-09 obeyed "
    "the injected instructions; EV-11 and EV-12 were routed instead of sent to manual triage.",
    "2. First run with the safeguards, including routing on `concrete_issue` (d263010): seed "
    "queue 8/10 · held-out v1 queue 7/12 · held-out v2 queue 6/12. Nine answerable tickets went "
    "to manual triage only because of the `missing_details` flag. The v2 injection ticket HX-12 "
    "was not caught by the regex detector, but the model still labelled it correctly.",
    "3. e913355: `concrete_issue` is still asked before `confidence` but no longer routes, and "
    "its definition now counts clear requests and policy questions (seed queue 9/10 · held-out "
    "v1 queue 11/12 · held-out v2 queue 10/12).",
    "4. This run: no prompt, policy, detector or schema changes since e913355. Held-out v3 was "
    "written blind after e913355 and has been run once, so it is the honest blind number.",
    "",
    "Held-out v2 has now been run twice. Dropping the `concrete_issue` routing rule was decided "
    "after seeing the first v2 run, so v2 is no longer fully blind. The classify prompt was "
    "tuned against the seed tickets and the safeguards were designed from the held-out v1 "
    "misses. An expected label of `any` is not scored.",
)

EVAL_SETS: tuple[tuple[str, Sequence[SeedTicket]], ...] = (
    ("Seed tickets (used while tuning the prompt)", SEED_TICKETS),
    ("Held-out v1 (used to diagnose these fixes)", HELD_OUT_TICKETS),
    ("Held-out v2 (written blind; second run, see history)", HELD_OUT_V2),
    ("Held-out v3 (written blind after the last change; first run)", HELD_OUT_V3),
)


class EvalAbortedError(Exception):
    pass


@dataclass(frozen=True)
class Row:
    seed: SeedTicket
    result: PolicyResult
    classify_ms: int

    @property
    def category_ok(self) -> bool | None:
        expected = self.seed.expected_category
        return None if expected is None else self.result.category == expected

    @property
    def urgency_ok(self) -> bool | None:
        expected = self.seed.expected_urgency
        return None if expected is None else self.result.urgency == expected

    @property
    def queue_ok(self) -> bool:
        return self.result.queue == self.seed.expected_queue


Section = tuple[str, list[Row]]


async def _classify_all(
    provider: OllamaProvider, settings: Settings, tickets: Sequence[SeedTicket]
) -> list[Row]:
    rows = []
    for ticket in tickets:
        started = perf_counter()
        try:
            classification = await classify(
                provider.classifier(), ticket, step_timeout=settings.llm_timeout_seconds
            )
        except LLMUnavailableError as exc:
            raise EvalAbortedError(
                f"{ticket.id}: the language model is unavailable: {exc}"
            ) from exc
        classify_ms = int((perf_counter() - started) * 1000)
        if classification is None:
            result = fallback_result()
        else:
            result = apply_policy(
                classification,
                settings.confidence_threshold,
                injection_suspected=ticket_looks_like_injection(ticket),
            )
        rows.append(Row(ticket, result, classify_ms))
        flags = ", ".join(flag.value for flag in result.flags) or "no flags"
        print(
            f"{ticket.id}: {result.category} / {result.urgency} / {result.queue} "
            f"[{flags}] ({classify_ms} ms)",
            file=sys.stderr,
        )
    return rows


async def evaluate(settings: Settings) -> list[Section]:
    provider = OllamaProvider(settings)
    reachable, available = await provider.health()
    if not reachable:
        raise EvalAbortedError(
            f"Ollama is not reachable at {settings.ollama_base_url}. Start it with `ollama serve`."
        )
    if not available:
        raise EvalAbortedError(
            f"Model {provider.model_name} is not available. "
            f"Run `ollama pull {provider.model_name}`."
        )
    return [
        (title, await _classify_all(provider, settings, tickets)) for title, tickets in EVAL_SETS
    ]


def _mark(ok: bool | None) -> str:
    return "—" if ok is None else ("✅" if ok else "❌")


def _score(values: list[bool | None]) -> str:
    scored = [v for v in values if v is not None]
    return f"{sum(scored)}/{len(scored)}"


def _section(title: str, rows: list[Row]) -> list[str]:
    lines = [
        f"## {title}",
        "",
        f"Category {_score([r.category_ok for r in rows])} · "
        f"Urgency {_score([r.urgency_ok for r in rows])} · "
        f"Queue {_score([r.queue_ok for r in rows])}",
        "",
        "| Ticket | Expected | Actual | Confidence | Flags | Classify ms "
        "| Category | Urgency | Queue |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        seed, result = row.seed, row.result
        expected = " / ".join(
            [
                seed.expected_category.value if seed.expected_category else "any",
                seed.expected_urgency.value if seed.expected_urgency else "any",
                seed.expected_queue.value,
            ]
        )
        actual = f"{result.category.value} / {result.urgency.value} / {result.queue.value}"
        flags = ", ".join(flag.value for flag in result.flags) or "—"
        lines.append(
            f"| {seed.id} | {expected} | {actual} | {result.confidence:.2f} | {flags} | "
            f"{row.classify_ms} | {_mark(row.category_ok)} | {_mark(row.urgency_ok)} | "
            f"{_mark(row.queue_ok)} |"
        )
    return lines


def render(model: str, threshold: float, run_date: date, sections: list[Section]) -> str:
    latencies = [row.classify_ms for _, rows in sections for row in rows]
    lines = [
        f"# Triage eval — `{model}`",
        "",
        f"Model `{model}` · threshold {threshold:g} · run {run_date.isoformat()} (UTC) · "
        f"classify latency mean {statistics.mean(latencies):.0f} ms, "
        f"median {statistics.median(latencies):.0f} ms over {len(latencies)} tickets",
        "",
        *HISTORY,
    ]
    for title, rows in sections:
        lines += ["", *_section(title, rows)]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="Write the Markdown report to this path.")
    args = parser.parse_args()
    settings = get_settings()
    try:
        sections = asyncio.run(evaluate(settings))
    except EvalAbortedError as exc:
        sys.exit(str(exc))
    report = render(
        settings.ollama_model, settings.confidence_threshold, datetime.now(UTC).date(), sections
    )
    print(report, end="")
    if args.out:
        args.out.write_text(report)
        print(f"wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
