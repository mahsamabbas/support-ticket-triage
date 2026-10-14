from fastapi import APIRouter

from app.deps import ProviderDep, RepoDep, SettingsDep
from app.domain.taxonomy import ALLOWED_QUEUES, Category, Queue, RoutableQueue, Urgency
from app.schemas import HealthOut, StatsOut, TaxonomyOut

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut)
async def health(provider: ProviderDep) -> HealthOut:
    reachable, available = await provider.health()
    return HealthOut(
        status="ok" if reachable and available else "degraded",
        ollama_reachable=reachable,
        model=provider.model_name,
        model_available=available,
    )


@router.get("/taxonomy", response_model=TaxonomyOut)
def taxonomy(settings: SettingsDep) -> TaxonomyOut:
    return TaxonomyOut(
        categories=list(Category),
        urgencies=list(Urgency),
        queues=list(Queue),
        routable_queues=list(RoutableQueue),
        allowed_queues={category: list(queues) for category, queues in ALLOWED_QUEUES.items()},
        confidence_threshold=settings.confidence_threshold,
    )


@router.get("/stats", response_model=StatsOut)
def stats(repo: RepoDep) -> StatsOut:
    return repo.stats()
