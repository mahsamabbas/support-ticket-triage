from typing import Protocol

import httpx
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama

from app.config import Settings
from app.schemas import ClassificationOut

HEALTH_TIMEOUT_SECONDS = 2.0


class LLMProvider(Protocol):
    model_name: str

    def classifier(self) -> BaseChatModel: ...

    def drafter(self) -> BaseChatModel: ...

    async def health(self) -> tuple[bool, bool]:
        """Return (server reachable, model pulled)."""
        ...


class OllamaProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.model_name = settings.ollama_model

    def _chat(self, **options) -> ChatOllama:
        return ChatOllama(
            model=self._settings.ollama_model,
            base_url=self._settings.ollama_base_url,
            num_ctx=self._settings.num_ctx,
            client_kwargs={"timeout": self._settings.llm_timeout_seconds},
            **options,
        )

    def classifier(self) -> ChatOllama:
        return self._chat(temperature=0, format=ClassificationOut.model_json_schema())

    def drafter(self) -> ChatOllama:
        return self._chat(temperature=0.3)

    async def health(self) -> tuple[bool, bool]:
        try:
            async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT_SECONDS) as client:
                response = await client.get(f"{self._settings.ollama_base_url}/api/tags")
                response.raise_for_status()
        except httpx.HTTPError:
            return False, False
        names = {model.get("name", "") for model in response.json().get("models", [])}
        return True, self.model_name in names or f"{self.model_name}:latest" in names
