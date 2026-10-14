from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings
from app.db import TicketRepository
from app.llm.client import LLMProvider


def get_repo(request: Request) -> TicketRepository:
    return request.app.state.repo


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.provider


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


RepoDep = Annotated[TicketRepository, Depends(get_repo)]
ProviderDep = Annotated[LLMProvider, Depends(get_provider)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
