from app.domain.taxonomy import Category, Flag, Queue, Urgency, is_route_allowed
from app.schemas import ClassificationOut, PolicyResult

FALLBACK_REASON = (
    "The model's output failed validation twice, so a human needs to classify this ticket."
)


def apply_policy(
    classification: ClassificationOut, threshold: float, *, injection_suspected: bool = False
) -> PolicyResult:
    queue = Queue(classification.queue.value)
    flags: list[Flag] = []
    if classification.confidence < threshold:
        flags.append(Flag.LOW_CONFIDENCE)
    if not is_route_allowed(classification.category, queue):
        flags.append(Flag.INCONSISTENT_ROUTE)
    if injection_suspected:
        flags.append(Flag.POSSIBLE_INJECTION)
    return PolicyResult(
        category=classification.category,
        urgency=classification.urgency,
        queue=Queue.MANUAL_TRIAGE if flags else queue,
        reason=classification.reason,
        confidence=classification.confidence,
        flags=flags,
    )


def fallback_result(*, injection_suspected: bool = False) -> PolicyResult:
    flags = [Flag.AI_OUTPUT_INVALID]
    if injection_suspected:
        flags.append(Flag.POSSIBLE_INJECTION)
    return PolicyResult(
        category=Category.GENERAL,
        urgency=Urgency.MEDIUM,
        queue=Queue.MANUAL_TRIAGE,
        reason=FALLBACK_REASON,
        confidence=0.0,
        flags=flags,
    )
