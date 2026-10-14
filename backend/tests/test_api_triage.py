from app.db import TicketRepository
from app.seed import seed_if_empty
from app.services.triage import TriageService
from tests.fakes import DRAFT_TEXT, SlowChatModel, classification_json
from tests.sse_utils import parse_sse


def triage(client, ticket_id="NG-1001"):
    response = client.post(f"/tickets/{ticket_id}/triage")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    return parse_sse(response.text)


def payload(events, name):
    return next(data for event, data in events if event == name)


def test_triage_streams_steps_and_saves(client):
    events = triage(client)
    names = [event for event, _ in events]
    assert names[0] == "step"
    assert names[-1] == "done"
    assert names.index("classified") < names.index("draft_token")
    assert events[0][1] == {"name": "classify", "state": "started"}

    classified = payload(events, "classified")
    assert classified["queue"] == "Billing Team"
    assert classified["flags"] == []

    streamed = "".join(data["text"] for event, data in events if event == "draft_token")
    assert streamed == DRAFT_TEXT

    done = payload(events, "done")
    assert done["status"] == "triaged"
    assert done["triage"]["ai_draft"] == DRAFT_TEXT
    assert done["triage"]["model"] == "fake-qwen"
    assert client.get("/tickets/NG-1001").json()["status"] == "triaged"


def test_low_confidence_goes_to_manual_triage(client, provider):
    provider.classify_responses = [classification_json(confidence=0.3)]
    done = payload(triage(client), "done")
    assert done["triage"]["ai_queue"] == "Needs Manual Triage"
    assert done["triage"]["flags"] == ["low_confidence"]


def test_inconsistent_route_goes_to_manual_triage(client, provider):
    provider.classify_responses = [classification_json(queue="Logistics")]
    done = payload(triage(client), "done")
    assert done["triage"]["ai_queue"] == "Needs Manual Triage"
    assert done["triage"]["flags"] == ["inconsistent_route"]


def test_invalid_output_twice_uses_fallback(client, provider):
    provider.classify_responses = ["garbage", "more garbage"]
    done = payload(triage(client), "done")
    assert done["triage"]["ai_queue"] == "Needs Manual Triage"
    assert done["triage"]["confidence"] == 0.0
    assert done["triage"]["flags"] == ["ai_output_invalid"]
    assert done["triage"]["ai_draft"] == DRAFT_TEXT


def test_ollama_unreachable_returns_503(client, provider):
    provider.reachable = False
    response = client.post("/tickets/NG-1001/triage")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "llm_unavailable"
    assert client.get("/tickets/NG-1001").json()["status"] == "new"


def test_missing_model_returns_503(client, provider):
    provider.model_available = False
    response = client.post("/tickets/NG-1001/triage")
    assert response.status_code == 503
    assert "ollama pull" in response.json()["detail"]["message"]


def test_classify_failure_mid_run_emits_error(client, provider):
    provider.fail_classify = True
    events = triage(client)
    assert events[-1][0] == "error"
    assert events[-1][1]["code"] == "llm_unavailable"
    assert client.get("/tickets/NG-1001").json()["status"] == "new"


def test_draft_failure_keeps_ticket_new(client, provider):
    provider.fail_draft = True
    events = triage(client)
    assert events[-1][0] == "error"
    assert "classified" in [event for event, _ in events]
    assert client.get("/tickets/NG-1001").json()["triage"] is None


def test_triage_unknown_ticket_404(client):
    assert client.post("/tickets/NG-9999/triage").status_code == 404


def test_retriage_is_allowed_for_triaged_ticket(client, provider):
    triage(client)
    provider.classify_responses = [classification_json(urgency="critical")]
    done = payload(triage(client), "done")
    assert done["triage"]["ai_urgency"] == "critical"


async def test_step_timeout_emits_llm_unavailable(tmp_path, provider, monkeypatch):
    repo = TicketRepository(tmp_path / "test.db")
    repo.init_schema()
    seed_if_empty(repo)
    monkeypatch.setattr(
        provider, "classifier", lambda: SlowChatModel(responses=[classification_json()])
    )
    service = TriageService(repo, provider, 0.6, step_timeout_seconds=0.05)

    events = [item async for item in service.run(repo.get("NG-1001"))]

    assert events[-1].event == "error"
    assert events[-1].data["code"] == "llm_unavailable"
    assert "timed out after 0.05s" in events[-1].data["message"]
    assert repo.get("NG-1001").triage is None
