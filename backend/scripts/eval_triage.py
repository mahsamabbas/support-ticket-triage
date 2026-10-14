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
from app.domain.policy import apply_policy, fallback_result
from app.llm.chains import LLMUnavailableError, classify
from app.llm.client import OllamaProvider
from app.schemas import PolicyResult
from app.seed import SEED_TICKETS, SeedTicket
from scripts.eval_cases import HELD_OUT_TICKETS


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
            result = apply_policy(classification, settings.confidence_threshold)
        rows.append(Row(ticket, result, classify_ms))
        print(
            f"{ticket.id}: {result.category} / {result.urgency} / {result.queue} "
            f"({classify_ms} ms)",
            file=sys.stderr,
        )
    return rows


async def evaluate(settings: Settings) -> tuple[list[Row], list[Row]]:
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
    seed_rows = await _classify_all(provider, settings, SEED_TICKETS)
    held_out_rows = await _classify_all(provider, settings, HELD_OUT_TICKETS)
    return seed_rows, held_out_rows


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


def render(
    model: str,
    threshold: float,
    run_date: date,
    seed_rows: list[Row],
    held_out_rows: list[Row],
) -> str:
    latencies = [row.classify_ms for row in seed_rows + held_out_rows]
    lines = [
        f"# Triage eval — `{model}`",
        "",
        f"Model `{model}` · threshold {threshold:g} · run {run_date.isoformat()} (UTC) · "
        f"classify latency mean {statistics.mean(latencies):.0f} ms, "
        f"median {statistics.median(latencies):.0f} ms over {len(latencies)} tickets",
        "",
        "The classify prompt was tuned against the seed tickets, so the held-out score is the "
        "honest number. An expected label of `any` is not scored.",
        "",
        *_section("Seed tickets (used while tuning the prompt)", seed_rows),
        "",
        *_section("Held-out tickets", held_out_rows),
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="Write the Markdown report to this path.")
    args = parser.parse_args()
    settings = get_settings()
    try:
        seed_rows, held_out_rows = asyncio.run(evaluate(settings))
    except EvalAbortedError as exc:
        sys.exit(str(exc))
    report = render(
        settings.ollama_model,
        settings.confidence_threshold,
        datetime.now(UTC).date(),
        seed_rows,
        held_out_rows,
    )
    print(report, end="")
    if args.out:
        args.out.write_text(report)
        print(f"wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
