from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.db import TicketRepository
from app.errors import AppError
from app.llm.client import LLMProvider, OllamaProvider
from app.routes import system, tickets, triage
from app.seed import seed_if_empty


def create_app(settings: Settings | None = None, provider: LLMProvider | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        repo = TicketRepository(settings.sqlite_path)
        repo.init_schema()
        seed_if_empty(repo)
        app.state.settings = settings
        app.state.repo = repo
        app.state.provider = provider or OllamaProvider(settings)
        yield

    app = FastAPI(
        title="QueueWise API",
        version="1.0.0",
        lifespan=lifespan,
        separate_input_output_schemas=False,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": {"code": exc.code, "message": exc.message}},
        )

    app.include_router(system.router)
    app.include_router(tickets.router)
    app.include_router(triage.router)
    return app


app = create_app()
